import { randomUUID } from 'node:crypto';
import { accountBalances, accountId, poolsOn, totalOn } from '@allotr/core';
import {
  currencyCode,
  localDate,
  money,
  type CreateGoalBody,
  type GoalListView,
  type GoalView,
  type LocalDate,
  type UpdateGoalBody,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import { loadRates } from './rates.ts';
import { uniquely } from './sqlite-errors.ts';
import {
  loadChart,
  loadLedger,
  loadPoolSetup,
  userToday,
  type Db,
} from './store.ts';

// Savings goals (ADR 0021, docs/domain.md "Goals"): a target amount, and
// optionally a date, on one savings account or one savings pool. Progress is
// what the target holds today, folded from the ledger when read; nothing is
// moved and no posting carries a goal. Every query is scoped to the user.

function notFound(): RequestProblem {
  return new RequestProblem(404, 'goal_not_found', 'There is no such goal.');
}

function nameTaken(): RequestProblem {
  return new RequestProblem(
    409,
    'goal_name_taken',
    'Another goal already has this name.',
  );
}

function targetTaken(): RequestProblem {
  return new RequestProblem(
    409,
    'goal_target_taken',
    'This pool or account already has a goal. Archive it first.',
  );
}

const columns = [
  'id',
  'name',
  'pool_id',
  'account_id',
  'target_minor',
  'currency',
  'target_on',
  'archived',
] as const;

export function listGoals(
  db: Kysely<DB>,
  userId: string,
  now: Date,
  includeArchived: boolean,
): Promise<GoalListView> {
  return db
    .transaction()
    .execute((trx) => readGoals(trx, userId, now, includeArchived));
}

async function readGoals(
  trx: Db,
  userId: string,
  now: Date,
  includeArchived: boolean,
): Promise<GoalListView> {
  const [rows, setup, chart, rates, today] = await Promise.all([
    trx
      .selectFrom('goals')
      .select(columns)
      .where('user_id', '=', userId)
      .$if(!includeArchived, (q) => q.where('archived', '=', 0))
      .orderBy('created_at')
      .orderBy('id')
      .execute(),
    loadPoolSetup(trx, userId),
    loadChart(trx, userId),
    loadRates(trx, userId),
    userToday(trx, userId, now),
  ]);
  const ledger = await loadLedger(trx, userId, chart);
  const placed = poolsOn({ chart, ledger, pools: setup, settings: {} }, today);
  const balances = accountBalances(ledger);
  const open = new Set(
    [...chart.values()].filter((a) => !a.archived).map((a) => a.id as string),
  );
  const goals = rows.map((row): GoalView => {
    const members =
      row.account_id === null
        ? [...placed]
            .filter(([id, pool]) => pool === row.pool_id && open.has(id))
            .map(([id]) => id as string)
        : [row.account_id];
    const figure = totalOn(
      rates,
      members.flatMap((id) => {
        const balance = balances.get(accountId(id));
        return balance === undefined ? [] : [balance];
      }),
      currencyCode(row.currency),
      today,
    );
    const saved = figure.amount.amountMinor;
    return {
      id: row.id,
      name: row.name,
      poolId: row.pool_id,
      accountId: row.account_id,
      target: money(row.target_minor, row.currency),
      targetOn: row.target_on === null ? null : localDate(row.target_on),
      archived: row.archived === 1,
      saved: figure.amount,
      remaining: money(Math.max(0, row.target_minor - saved), row.currency),
      reached: saved >= row.target_minor,
      missingRates: [...figure.missingRates],
    };
  });
  return { goals };
}

async function viewOf(
  db: Db,
  userId: string,
  id: string,
  now: Date,
): Promise<GoalView> {
  const { goals } = await readGoals(db, userId, now, true);
  const found = goals.find((goal) => goal.id === id);
  if (found === undefined) throw notFound();
  return found;
}

/** An earmark sits on savings: the pool, or the account's pool, must be one. */
async function checkTarget(
  trx: Db,
  userId: string,
  input: CreateGoalBody,
  today: LocalDate,
): Promise<void> {
  if (input.poolId !== undefined) {
    const pool = await trx
      .selectFrom('pools')
      .select(['kind', 'archived'])
      .where('user_id', '=', userId)
      .where('id', '=', input.poolId)
      .executeTakeFirst();
    if (pool === undefined) {
      throw new RequestProblem(404, 'pool_not_found', 'There is no such pool.');
    }
    if (pool.archived === 1 || pool.kind !== 'savings') {
      throw new RequestProblem(
        409,
        'goal_not_savings',
        'A goal sits on a savings pool or an account in one.',
      );
    }
    return;
  }
  const id = input.accountId ?? '';
  const chart = await loadChart(trx, userId);
  const account = chart.get(accountId(id));
  if (account === undefined || account.systemRole !== null) {
    throw new RequestProblem(
      404,
      'account_not_found',
      'There is no such account.',
    );
  }
  const setup = await loadPoolSetup(trx, userId);
  const ledger = await loadLedger(trx, userId, chart);
  const poolOf = poolsOn(
    { chart, ledger, pools: setup, settings: {} },
    today,
  ).get(accountId(id));
  const pool = await trx
    .selectFrom('pools')
    .select('kind')
    .where('user_id', '=', userId)
    .where('id', '=', poolOf ?? '')
    .executeTakeFirst();
  if (account.archived || pool?.kind !== 'savings') {
    throw new RequestProblem(
      409,
      'goal_not_savings',
      'A goal sits on a savings pool or an account in one.',
    );
  }
}

export async function createGoal(
  db: Kysely<DB>,
  userId: string,
  input: CreateGoalBody,
  now: Date,
): Promise<GoalView> {
  const id = randomUUID();
  const at = now.toISOString();
  await db.transaction().execute(async (trx) => {
    await checkTarget(trx, userId, input, await userToday(trx, userId, now));
    await checkName(trx, userId, input.name, null);
    await uniquely(
      () =>
        trx
          .insertInto('goals')
          .values({
            id,
            user_id: userId,
            name: input.name,
            pool_id: input.poolId ?? null,
            account_id: input.accountId ?? null,
            target_minor: input.target.amountMinor,
            currency: input.target.currency,
            target_on: input.targetOn ?? null,
            created_at: at,
            updated_at: at,
          })
          .execute(),
      targetTaken,
    );
  });
  return viewOf(db, userId, id, now);
}

/** Active goals have unique names; say so instead of a bare index error. */
async function checkName(
  trx: Db,
  userId: string,
  name: string,
  except: string | null,
): Promise<void> {
  const clash = await trx
    .selectFrom('goals')
    .select('id')
    .where('user_id', '=', userId)
    .where('archived', '=', 0)
    .where((eb) => eb(eb.fn('lower', ['name']), '=', name.toLowerCase()))
    .$if(except !== null, (q) => q.where('id', '<>', except ?? ''))
    .executeTakeFirst();
  if (clash !== undefined) throw nameTaken();
}

export async function updateGoal(
  db: Kysely<DB>,
  userId: string,
  id: string,
  input: UpdateGoalBody,
  now: Date,
): Promise<GoalView> {
  await db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('goals')
      .select(['id', 'name', 'archived'])
      .where('user_id', '=', userId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (row === undefined) throw notFound();
    if (input.name !== undefined || input.archived === false) {
      await checkName(trx, userId, input.name ?? row.name, id);
    }
    await uniquely(
      () =>
        trx
          .updateTable('goals')
          .set({
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.targetMinor === undefined
              ? {}
              : { target_minor: input.targetMinor }),
            ...(input.targetOn === undefined
              ? {}
              : { target_on: input.targetOn }),
            ...(input.archived === undefined
              ? {}
              : { archived: input.archived ? 1 : 0 }),
            updated_at: now.toISOString(),
          })
          .where('user_id', '=', userId)
          .where('id', '=', id)
          .execute(),
      // Restoring can clash with a newer goal on the same target.
      targetTaken,
    );
  });
  return viewOf(db, userId, id, now);
}
