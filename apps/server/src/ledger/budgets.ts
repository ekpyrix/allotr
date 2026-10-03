import { randomUUID } from 'node:crypto';
import {
  budgetId,
  budgetPeriodOn,
  budgetStatus,
  categoryId,
  tagId,
  transactionId,
  type Budget,
  type BudgetSetup,
  type BudgetTarget,
  type CategoryNode,
  type TagId,
  type TransactionId,
} from '@allotr/core';
import {
  addDays,
  localDate,
  money,
  type BudgetStatusView,
  type BudgetView,
  type CreateBudgetBody,
  type LocalDate,
  type Money,
  type UpdateBudgetBody,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import { readLedgerSettings } from './ledger-settings.ts';
import { uniquely } from './sqlite-errors.ts';
import { userToday, type Db } from './store.ts';
import { loadView } from './today.ts';

// Budgets (ADR 0021): the user's plan per category or tag. They are virtual;
// the figures come from core, folded from the ledger on every read. Every
// query is scoped to the user.

/** Budgets, category tree and entry tags as core reads them. */
export async function loadBudgetSetup(
  db: Db,
  userId: string,
): Promise<BudgetSetup> {
  const [budgets, amounts, categories, tags] = await Promise.all([
    db
      .selectFrom('budgets')
      .select([
        'id',
        'name',
        'kind',
        'category_id',
        'tag_id',
        'mode',
        'leftover',
        'started_on',
        'ended_on',
      ])
      .where('user_id', '=', userId)
      .orderBy('created_at')
      .orderBy('id')
      .execute(),
    db
      .selectFrom('budget_amounts')
      .select(['budget_id', 'effective_on', 'amount_minor', 'currency'])
      .where('user_id', '=', userId)
      .orderBy('effective_on')
      .execute(),
    db
      .selectFrom('categories')
      .select(['id', 'parent_id', 'merged_into_id'])
      .where('user_id', '=', userId)
      .execute(),
    db
      .selectFrom('transaction_tags')
      .select(['transaction_id', 'tag_id'])
      .where('user_id', '=', userId)
      .orderBy('tag_id')
      .execute(),
  ]);
  const planned = new Map<string, Budget['amounts'][number][]>();
  for (const row of amounts) {
    const list = planned.get(row.budget_id) ?? [];
    list.push({
      from: localDate(row.effective_on),
      amount: money(row.amount_minor, row.currency),
    });
    planned.set(row.budget_id, list);
  }
  const entryTags = new Map<TransactionId, TagId[]>();
  for (const row of tags) {
    const id = transactionId(row.transaction_id);
    entryTags.set(id, [...(entryTags.get(id) ?? []), tagId(row.tag_id)]);
  }
  return {
    budgets: budgets.map((row): Budget => {
      const target: BudgetTarget =
        row.kind === 'category' && row.category_id !== null
          ? { kind: 'category', categoryId: categoryId(row.category_id) }
          : row.kind === 'tag' && row.tag_id !== null
            ? { kind: 'tag', tagId: tagId(row.tag_id) }
            : { kind: 'buffer' };
      return {
        id: budgetId(row.id),
        name: row.name,
        target,
        mode: row.mode === 'set-aside' ? 'set-aside' : 'daily',
        leftover: row.leftover === 'carry' ? 'carry' : 'free',
        startedOn: localDate(row.started_on),
        endedOn: row.ended_on === null ? null : localDate(row.ended_on),
        amounts: planned.get(row.id) ?? [],
      };
    }),
    categories: new Map(
      categories.map((row): [ReturnType<typeof categoryId>, CategoryNode] => [
        categoryId(row.id),
        {
          parent: row.parent_id === null ? null : categoryId(row.parent_id),
          mergedInto:
            row.merged_into_id === null ? null : categoryId(row.merged_into_id),
        },
      ]),
    ),
    entryTags,
  };
}

function notFound(): RequestProblem {
  return new RequestProblem(
    404,
    'budget_not_found',
    'There is no such budget.',
  );
}

// The amount in force in a period: the last one set before it ended.
function amountInForce(budget: Budget, to: LocalDate): Money | null {
  return budget.amounts.findLast((a) => a.from < to)?.amount ?? null;
}

export function budgetStatusView(
  db: Kysely<DB>,
  userId: string,
  now: Date,
): Promise<BudgetStatusView> {
  return db.transaction().execute((trx) => readStatus(trx, userId, now));
}

async function readStatus(
  db: Db,
  userId: string,
  now: Date,
): Promise<BudgetStatusView> {
  const { view } = await loadView(db, userId);
  const today = await userToday(db, userId, now);
  const status = budgetStatus(view, today);
  return {
    today,
    period: status.period,
    periodRule: view.settings.budgetPeriod ?? 'cycle',
    daysLeft: status.daysLeft,
    budgets: status.lines.map((line): BudgetView => ({
      id: line.budget.id,
      name: line.budget.name,
      target:
        line.budget.target.kind === 'category'
          ? { kind: 'category', categoryId: line.budget.target.categoryId }
          : line.budget.target.kind === 'tag'
            ? { kind: 'tag', tagId: line.budget.target.tagId }
            : { kind: 'buffer' },
      mode: line.budget.mode,
      leftover: line.budget.leftover,
      startedOn: line.budget.startedOn,
      amount: amountInForce(line.budget, status.period.to) ?? line.planned,
      planned: line.planned,
      carriedIn: line.carriedIn,
      spent: line.spent,
      left: line.left,
      held: line.held,
    })),
    available: status.available,
    held: status.held,
    free: status.free,
    dailyLeft: status.dailyLeft,
    unbudgeted: status.unbudgeted,
    dailyMode: status.dailyMode,
    dailyNumber: status.dailyNumber,
    missingRates: [...status.missingRates],
  };
}

function problem(status: 400 | 404 | 409, code: string, detail: string) {
  return new RequestProblem(status, code, detail);
}

async function requireTarget(
  db: Db,
  userId: string,
  target: CreateBudgetBody['target'],
): Promise<void> {
  if (target.kind === 'category') {
    const row = await db
      .selectFrom('categories')
      .select(['kind', 'merged_into_id'])
      .where('user_id', '=', userId)
      .where('id', '=', target.categoryId)
      .executeTakeFirst();
    if (row === undefined) {
      throw problem(404, 'category_not_found', 'There is no such category.');
    }
    if (row.kind !== 'expense' || row.merged_into_id !== null) {
      throw problem(
        400,
        'invalid_budget_category',
        'A budget goes on an expense category that has not been merged.',
      );
    }
    return;
  }
  const tag = await db
    .selectFrom('tags')
    .select('id')
    .where('user_id', '=', userId)
    .where('id', '=', target.tagId)
    .executeTakeFirst();
  if (tag === undefined) {
    throw problem(404, 'tag_not_found', 'There is no such tag.');
  }
}

function checkAmount(amount: Money, defaultCurrency: string, buffer: boolean) {
  if (amount.currency !== defaultCurrency) {
    throw problem(
      400,
      'budget_currency',
      `Plan budgets in your default currency, ${defaultCurrency}.`,
    );
  }
  if (amount.amountMinor < 0 || (amount.amountMinor === 0 && !buffer)) {
    throw problem(
      400,
      'invalid_amount',
      buffer
        ? 'The amount cannot be negative.'
        : 'The amount must be more than zero.',
    );
  }
}

const taken = () =>
  problem(
    409,
    'budget_taken',
    'This name, category or tag already has a budget in use.',
  );

export async function createBudget(
  db: Kysely<DB>,
  userId: string,
  input: CreateBudgetBody,
  now: Date,
): Promise<BudgetStatusView> {
  const id = randomUUID();
  await db.transaction().execute(async (trx) => {
    const [settings, today] = await Promise.all([
      readLedgerSettings(trx, userId),
      userToday(trx, userId, now),
    ]);
    checkAmount(input.amount, settings.defaultCurrency, false);
    await requireTarget(trx, userId, input.target);
    const mode = input.mode ?? 'daily';
    const at = now.toISOString();
    await uniquely(async () => {
      await trx
        .insertInto('budgets')
        .values({
          id,
          user_id: userId,
          name: input.name,
          kind: input.target.kind,
          category_id:
            input.target.kind === 'category' ? input.target.categoryId : null,
          tag_id: input.target.kind === 'tag' ? input.target.tagId : null,
          mode,
          leftover: input.leftover ?? (mode === 'set-aside' ? 'carry' : 'free'),
          started_on: today,
          created_at: at,
          updated_at: at,
        })
        .execute();
      await trx
        .insertInto('budget_amounts')
        .values({
          id: randomUUID(),
          user_id: userId,
          budget_id: id,
          effective_on: today,
          amount_minor: input.amount.amountMinor,
          currency: input.amount.currency,
          created_at: at,
        })
        .execute();
    }, taken);
  });
  return budgetStatusView(db, userId, now);
}

export async function updateBudget(
  db: Kysely<DB>,
  userId: string,
  id: string,
  input: UpdateBudgetBody,
  now: Date,
): Promise<BudgetStatusView> {
  await db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('budgets')
      .select(['kind', 'ended_on'])
      .where('user_id', '=', userId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (row === undefined || row.ended_on !== null) throw notFound();
    const buffer = row.kind === 'buffer';
    if (buffer && (input.mode !== undefined || input.leftover !== undefined)) {
      throw problem(
        409,
        'budget_fixed',
        'The Buffer is always set aside and carries over.',
      );
    }
    const at = now.toISOString();
    if (input.amount !== undefined) {
      const [settings, today] = await Promise.all([
        readLedgerSettings(trx, userId),
        userToday(trx, userId, now),
      ]);
      checkAmount(input.amount, settings.defaultCurrency, buffer);
      await trx
        .insertInto('budget_amounts')
        .values({
          id: randomUUID(),
          user_id: userId,
          budget_id: id,
          effective_on: today,
          amount_minor: input.amount.amountMinor,
          currency: input.amount.currency,
          created_at: at,
        })
        .onConflict((oc) =>
          oc.columns(['budget_id', 'effective_on']).doUpdateSet({
            amount_minor: input.amount?.amountMinor ?? 0,
            currency: input.amount?.currency ?? settings.defaultCurrency,
          }),
        )
        .execute();
    }
    await uniquely(
      () =>
        trx
          .updateTable('budgets')
          .set({
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.mode === undefined ? {} : { mode: input.mode }),
            ...(input.leftover === undefined
              ? {}
              : { leftover: input.leftover }),
            updated_at: at,
          })
          .where('user_id', '=', userId)
          .where('id', '=', id)
          .execute(),
      taken,
    );
  });
  return budgetStatusView(db, userId, now);
}

/**
 * Ends a budget from the current period on; its earlier periods keep their
 * figures, and this period's spending counts as unbudgeted again.
 */
export async function endBudget(
  db: Kysely<DB>,
  userId: string,
  id: string,
  now: Date,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('budgets')
      .select(['kind', 'ended_on'])
      .where('user_id', '=', userId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (row === undefined || row.ended_on !== null) throw notFound();
    if (row.kind === 'buffer') {
      throw problem(409, 'budget_fixed', 'The Buffer cannot be removed.');
    }
    const today = await userToday(trx, userId, now);
    const { view } = await loadView(trx, userId);
    await trx
      .updateTable('budgets')
      .set({
        ended_on: addDays(budgetPeriodOn(view, today, today).from, -1),
        updated_at: now.toISOString(),
      })
      .where('user_id', '=', userId)
      .where('id', '=', id)
      .execute();
  });
}
