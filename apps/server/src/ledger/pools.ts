import { randomUUID } from 'node:crypto';
import {
  accountId,
  accountBalances,
  poolCounts,
  poolCycleFigures,
  poolId,
  poolsOn,
  totalOn,
} from '@allotr/core';
import {
  type AccountView,
  type CreatePoolBody,
  type MoveAccountBody,
  type Money,
  type PoolListView,
  type PoolView,
  type UpdatePoolBody,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import { getAccount } from './accounts.ts';
import { readLedgerSettings } from './ledger-settings.ts';
import { loadRates } from './rates.ts';
import { loadView } from './today.ts';
import { uniquely } from './sqlite-errors.ts';
import {
  loadChart,
  loadLedger,
  loadPoolSetup,
  poolColumns as columns,
  poolOf as toPool,
  userToday,
  type Db,
} from './store.ts';

// Pools (ADR 0021, docs/domain.md "Pools"): groups of accounts that do or do
// not count toward the daily number. Moves are dated rows that are only ever
// added; figures read them through core, so a back-dated move corrects the
// past. Every query is scoped to the user.

function notFound(): RequestProblem {
  return new RequestProblem(404, 'pool_not_found', 'There is no such pool.');
}

function nameTaken(): RequestProblem {
  return new RequestProblem(
    409,
    'pool_name_taken',
    'Another pool already has this name.',
  );
}

export function listPools(
  db: Kysely<DB>,
  userId: string,
  now: Date,
  includeArchived: boolean,
): Promise<PoolListView> {
  return db
    .transaction()
    .execute((trx) => readPools(trx, userId, now, includeArchived));
}

async function readPools(
  trx: Db,
  userId: string,
  now: Date,
  includeArchived: boolean,
): Promise<PoolListView> {
  const [rows, setup, chart, settings, rates, today] = await Promise.all([
    trx
      .selectFrom('pools')
      .select(columns)
      .where('user_id', '=', userId)
      .orderBy('position')
      .orderBy('id')
      .execute(),
    loadPoolSetup(trx, userId),
    loadChart(trx, userId),
    readLedgerSettings(trx, userId),
    loadRates(trx, userId),
    userToday(trx, userId, now),
  ]);
  const ledger = await loadLedger(trx, userId, chart);
  const view = {
    chart,
    ledger,
    pools: setup,
    settings: { countSavingsInDaily: settings.countSavingsInDaily },
  };
  const placed = poolsOn(view, today);
  const balances = accountBalances(ledger);
  const cycleFigures = poolCycleFigures(
    (await loadView(trx, userId)).view,
    today,
  );
  const open = new Set(
    [...chart.values()].filter((a) => !a.archived).map((a) => a.id),
  );
  const pools = rows
    .filter((row) => includeArchived || row.archived === 0)
    .map((row): PoolView => {
      const members = [...placed]
        .filter(([id, pool]) => pool === row.id && open.has(id))
        .map(([id]) => id as string);
      const figure = totalOn(
        rates,
        members.flatMap((id) => {
          const balance = balances.get(accountId(id));
          return balance === undefined ? [] : [balance];
        }),
        settings.defaultCurrency,
        today,
      );
      const inCycle = cycleFigures.get(poolId(row.id));
      const inDefault = (amounts: readonly Money[]) => {
        const total = totalOn(rates, amounts, settings.defaultCurrency, today);
        return {
          amount: total.amount,
          missingRates: [...total.missingRates],
        };
      };
      return {
        id: row.id,
        name: row.name,
        kind: toPool(row).kind,
        countsTowardDaily: row.counts_toward_daily === 1,
        counts: poolCounts(toPool(row), settings.countSavingsInDaily),
        defaultFor:
          row.default_for === 'on' || row.default_for === 'off'
            ? row.default_for
            : null,
        archived: row.archived === 1,
        accountIds: members,
        balance: {
          amount: figure.amount,
          missingRates: [...figure.missingRates],
        },
        cycle:
          inCycle === undefined
            ? null
            : {
                start: inDefault(inCycle.start),
                left: inDefault(inCycle.left),
              },
      };
    });
  return { pools, countSavingsInDaily: settings.countSavingsInDaily };
}

async function findOwned(db: Db, userId: string, id: string) {
  const row = await db
    .selectFrom('pools')
    .select(columns)
    .where('user_id', '=', userId)
    .where('id', '=', id)
    .executeTakeFirst();
  if (row === undefined) throw notFound();
  return row;
}

async function viewOf(
  db: Db,
  userId: string,
  id: string,
  now: Date,
): Promise<PoolView> {
  const { pools } = await readPools(db, userId, now, true);
  const found = pools.find((pool) => pool.id === id);
  if (found === undefined) throw notFound();
  return found;
}

export async function createPool(
  db: Kysely<DB>,
  userId: string,
  input: CreatePoolBody,
  now: Date,
): Promise<PoolView> {
  const id = randomUUID();
  const at = now.toISOString();
  await db.transaction().execute(async (trx) => {
    const last = await trx
      .selectFrom('pools')
      .select((eb) => eb.fn.max('position').as('position'))
      .where('user_id', '=', userId)
      .executeTakeFirst();
    await uniquely(
      () =>
        trx
          .insertInto('pools')
          .values({
            id,
            user_id: userId,
            name: input.name,
            kind: input.kind,
            counts_toward_daily:
              (input.countsTowardDaily ?? input.kind === 'spending') ? 1 : 0,
            position: (last?.position ?? 0) + 1,
            created_at: at,
            updated_at: at,
          })
          .execute(),
      nameTaken,
    );
  });
  return viewOf(db, userId, id, now);
}

export async function updatePool(
  db: Kysely<DB>,
  userId: string,
  id: string,
  input: UpdatePoolBody,
  now: Date,
): Promise<PoolView> {
  await db.transaction().execute(async (trx) => {
    const row = await findOwned(trx, userId, id);
    // The Budget pool is what the daily number is made of.
    if (row.default_for === 'on' && input.countsTowardDaily === false) {
      throw new RequestProblem(
        409,
        'pool_fixed',
        'The Budget pool always counts toward the daily number.',
      );
    }
    if (input.archived === true) {
      if (row.default_for !== null) {
        throw new RequestProblem(
          409,
          'pool_fixed',
          'The default pools cannot be archived.',
        );
      }
      const { pools } = await readPools(trx, userId, now, false);
      if ((pools.find((p) => p.id === id)?.accountIds.length ?? 0) > 0) {
        throw new RequestProblem(
          409,
          'pool_not_empty',
          'Move the accounts out of this pool before archiving it.',
        );
      }
    }
    await uniquely(
      () =>
        trx
          .updateTable('pools')
          .set({
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.countsTowardDaily === undefined
              ? {}
              : { counts_toward_daily: input.countsTowardDaily ? 1 : 0 }),
            ...(input.archived === undefined
              ? {}
              : { archived: input.archived ? 1 : 0 }),
            updated_at: now.toISOString(),
          })
          .where('user_id', '=', userId)
          .where('id', '=', id)
          .execute(),
      nameTaken,
    );
  });
  return viewOf(db, userId, id, now);
}

/**
 * Moves an account into a pool from a day (default today). It adds a dated
 * row and changes no entry, so figures for days before it stay as they were.
 */
export async function moveAccount(
  db: Kysely<DB>,
  userId: string,
  id: string,
  input: MoveAccountBody,
  now: Date,
): Promise<AccountView> {
  await db.transaction().execute(async (trx) => {
    const account = await trx
      .selectFrom('accounts')
      .select(['id', 'archived'])
      .where('user_id', '=', userId)
      .where('id', '=', id)
      .where('system_role', 'is', null)
      .executeTakeFirst();
    if (account === undefined) {
      throw new RequestProblem(
        404,
        'account_not_found',
        'There is no such account.',
      );
    }
    if (account.archived === 1) {
      throw new RequestProblem(
        409,
        'account_archived',
        'This account is archived.',
      );
    }
    const pool = await findOwned(trx, userId, input.poolId);
    if (pool.archived === 1) {
      throw new RequestProblem(
        409,
        'pool_archived',
        'This pool is archived. Restore it first.',
      );
    }
    const today = await userToday(trx, userId, now);
    const effectiveOn = input.effectiveOn ?? today;
    const chart = await loadChart(trx, userId);
    const view = {
      chart,
      ledger: await loadLedger(trx, userId, chart),
      pools: await loadPoolSetup(trx, userId),
      settings: {},
    };
    if (
      poolsOn(view, effectiveOn).get(accountId(id)) === poolId(input.poolId)
    ) {
      return;
    }
    await trx
      .insertInto('pool_moves')
      .values({
        id: randomUUID(),
        user_id: userId,
        account_id: id,
        pool_id: input.poolId,
        effective_on: effectiveOn,
        created_at: now.toISOString(),
      })
      .execute();
  });
  return getAccount(db, userId, id, now);
}
