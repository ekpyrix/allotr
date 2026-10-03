import { randomUUID } from 'node:crypto';
import {
  accountId,
  budgetCovers,
  budgetId,
  budgetPeriodOn,
  budgetStatus,
  categoryId,
  coverPreview,
  expense,
  tagId,
  transactionId,
  type Budget,
  type BudgetSetup,
  type BudgetTarget,
  type CategoryNode,
  type CoverRequest,
  type CoverSource,
  type LedgerView,
  type TagId,
  type Transaction,
  type TransactionId,
} from '@allotr/core';
import {
  addDays,
  localDate,
  money,
  type BudgetStatusView,
  type BudgetView,
  type CoverOverrideBody,
  type CoverPreviewBody,
  type CoverPreviewView,
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
import { newEntry, userToday, withSystemAccounts, type Db } from './store.ts';
import { loadView } from './today.ts';

// Budgets (ADR 0021): the user's plan per category or tag. They are virtual;
// the figures come from core, folded from the ledger on every read. Every
// query is scoped to the user.

const coverOrderKey = 'cover_order';

// 'free' or a budget ID; the one type for both, as in core.
const sourceOf = (id: string): CoverSource =>
  id === 'free' ? 'free' : budgetId(id);

// A stored order that no longer parses is ignored: the default order applies.
function parseOrder(value: string | undefined): CoverSource[] {
  if (value === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.flatMap((id) => (typeof id === 'string' ? [sourceOf(id)] : []))
      : [];
  } catch {
    return [];
  }
}

/** Budgets, category tree, entry tags and cover as core reads them. */
export async function loadBudgetSetup(
  db: Db,
  userId: string,
): Promise<BudgetSetup> {
  const [budgets, amounts, categories, tags, order, overrides] =
    await Promise.all([
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
      db
        .selectFrom('user_settings')
        .select('value')
        .where('user_id', '=', userId)
        .where('key', '=', coverOrderKey)
        .executeTakeFirst(),
      db
        .selectFrom('cover_overrides')
        .select(['transaction_id', 'source', 'amount_minor', 'currency'])
        .where('user_id', '=', userId)
        .orderBy('transaction_id')
        .orderBy('position')
        .execute(),
    ]);
  const coverOverrides = new Map<TransactionId, CoverRequest[]>();
  for (const row of overrides) {
    const id = transactionId(row.transaction_id);
    coverOverrides.set(id, [
      ...(coverOverrides.get(id) ?? []),
      {
        source: sourceOf(row.source),
        amount: money(row.amount_minor, row.currency),
      },
    ]);
  }
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
    coverOrder: parseOrder(order?.value),
    coverOverrides,
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
  const names = namesOf(view.budgets);
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
      overflow: line.overflow,
      coveredOut: line.coveredOut,
      restored: line.restored,
      held: line.held,
    })),
    available: status.available,
    held: status.held,
    free: status.free,
    dailyLeft: status.dailyLeft,
    unbudgeted: status.unbudgeted,
    dailyMode: status.dailyMode,
    dailyNumber: status.dailyNumber,
    coverOrder: status.coverOrder.map((source) => orderItem(source, names)),
    covered: status.covered,
    missingRates: [...status.missingRates],
  };
}

type Names = ReadonlyMap<string, { name: string; buffer: boolean }>;

function namesOf(setup: BudgetSetup | undefined): Names {
  return new Map(
    (setup?.budgets ?? []).map((b) => [
      b.id,
      { name: b.name, buffer: b.target.kind === 'buffer' },
    ]),
  );
}

function orderItem(source: CoverSource, names: Names) {
  if (source === 'free') {
    return { id: source, name: 'Free money', kind: 'free' as const };
  }
  const found = names.get(source);
  return {
    id: source,
    name: found?.name ?? '',
    kind: found?.buffer === true ? ('buffer' as const) : ('budget' as const),
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

// ---- Cover: order, per-entry overrides, the list and the preview ----------

async function usableSources(db: Db, userId: string): Promise<Set<string>> {
  const rows = await db
    .selectFrom('budgets')
    .select('id')
    .where('user_id', '=', userId)
    .where('ended_on', 'is', null)
    .execute();
  return new Set(['free', ...rows.map((row) => row.id)]);
}

/**
 * Saves the cover order, a setting of the user's. Free money and budgets left
 * out, and budgets planned later, are placed by core's default rule.
 */
export async function setCoverOrder(
  db: Kysely<DB>,
  userId: string,
  order: readonly string[],
  now: Date,
): Promise<BudgetStatusView> {
  await db.transaction().execute(async (trx) => {
    const usable = await usableSources(trx, userId);
    const unknown = order.findIndex((id) => !usable.has(id));
    if (unknown >= 0) {
      throw new RequestProblem(
        400,
        'unknown_budget',
        'The cover order names a budget that does not exist or has ended.',
        [{ path: `/order/${String(unknown)}`, message: 'Unknown budget.' }],
      );
    }
    if (new Set(order).size !== order.length) {
      throw problem(400, 'duplicate_source', 'A source appears twice.');
    }
    const value = JSON.stringify(order);
    const at = now.toISOString();
    await trx
      .insertInto('user_settings')
      .values({ user_id: userId, key: coverOrderKey, value, updated_at: at })
      .onConflict((oc) =>
        oc.columns(['user_id', 'key']).doUpdateSet({ value, updated_at: at }),
      )
      .execute();
  });
  return budgetStatusView(db, userId, now);
}

/** The entries in the current period that needed cover, newest first. */
export function listCovers(db: Kysely<DB>, userId: string, now: Date) {
  return db.transaction().execute(async (trx) => {
    const { view } = await loadView(trx, userId);
    const today = await userToday(trx, userId, now);
    const names = namesOf(view.budgets);
    const status = budgetStatus(view, today);
    const name = (source: CoverSource) => orderItem(source, names).name;
    return {
      period: status.period,
      covers: budgetCovers(view, today).map((cover) => ({
        entryId: cover.entryId,
        date: cover.date,
        budgetId: cover.budgetId,
        loan: cover.loan,
        amount: cover.amount,
        own: cover.own,
        covers: cover.covers.map((c) => ({
          source: c.source,
          name: name(c.source),
          amount: c.amount,
        })),
        uncovered: cover.uncovered,
        overridden: cover.overridden,
      })),
    };
  });
}

/**
 * Chooses how an entry's shortfall is covered. It is a setting on the entry:
 * no ledger row changes, and core still caps each source at what it had.
 */
export async function setCoverOverride(
  db: Kysely<DB>,
  userId: string,
  entryId: string,
  input: CoverOverrideBody,
  now: Date,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const entry = await trx
      .selectFrom('transactions')
      .select('kind')
      .where('user_id', '=', userId)
      .where('id', '=', entryId)
      .executeTakeFirst();
    if (entry === undefined) {
      throw problem(404, 'transaction_not_found', 'There is no such entry.');
    }
    if (entry.kind !== 'expense' && entry.kind !== 'write_off') {
      throw problem(
        400,
        'not_an_expense',
        'Only spending has a shortfall to cover.',
      );
    }
    const [settings, usable] = await Promise.all([
      readLedgerSettings(trx, userId),
      usableSources(trx, userId),
    ]);
    const seen = new Set<string>();
    input.covers.forEach((cover, i) => {
      if (!usable.has(cover.source) || seen.has(cover.source)) {
        throw new RequestProblem(
          400,
          'invalid_cover',
          'Each source must be free money or a budget in use, and appear once.',
          [{ path: `/covers/${String(i)}/source`, message: 'Not allowed.' }],
        );
      }
      seen.add(cover.source);
      checkAmount(cover.amount, settings.defaultCurrency, false);
    });
    await trx
      .deleteFrom('cover_overrides')
      .where('user_id', '=', userId)
      .where('transaction_id', '=', entryId)
      .execute();
    await trx
      .insertInto('cover_overrides')
      .values(
        input.covers.map((cover, position) => ({
          id: randomUUID(),
          user_id: userId,
          transaction_id: entryId,
          position,
          source: cover.source,
          amount_minor: cover.amount.amountMinor,
          currency: cover.amount.currency,
          created_at: now.toISOString(),
        })),
      )
      .execute();
  });
}

/** Goes back to the cover order for an entry. */
export async function clearCoverOverride(
  db: Kysely<DB>,
  userId: string,
  entryId: string,
): Promise<void> {
  await db
    .deleteFrom('cover_overrides')
    .where('user_id', '=', userId)
    .where('transaction_id', '=', entryId)
    .execute();
}

/**
 * What an expense would take from each source, before it is recorded. The
 * entry is built the way a real one is and left out of the ledger.
 */
export async function previewCover(
  db: Kysely<DB>,
  userId: string,
  input: CoverPreviewBody,
  now: Date,
): Promise<CoverPreviewView> {
  const { view } = await db
    .transaction()
    .execute((trx) => loadView(trx, userId));
  const today = await userToday(db, userId, now);
  const account = view.chart.get(accountId(input.accountId));
  if (account === undefined || account.systemRole !== null) {
    throw problem(404, 'account_not_found', 'There is no such account.');
  }
  if (account.archived) {
    throw problem(409, 'account_archived', 'This account is archived.');
  }
  if (account.currency !== input.amount.currency) {
    throw problem(
      400,
      'currency_mismatch',
      `Give the amount in ${account.currency}, the account's currency.`,
    );
  }
  const category = await db
    .selectFrom('categories')
    .select('kind')
    .where('user_id', '=', userId)
    .where('id', '=', input.categoryId)
    .executeTakeFirst();
  if (category === undefined || category.kind !== 'expense') {
    throw problem(
      400,
      'invalid_category',
      'Choose one of your expense categories.',
    );
  }
  const owned = new Set(
    (
      await db
        .selectFrom('tags')
        .select('id')
        .where('user_id', '=', userId)
        .execute()
    ).map((row) => row.id),
  );
  const tagIds = [...new Set(input.tagIds ?? [])];
  if (tagIds.some((id) => !owned.has(id))) {
    throw problem(400, 'unknown_tag', 'One of the tags does not exist.');
  }
  const chart = withSystemAccounts(view.chart, [account.currency], now);
  const entry = expense(chart, newEntry(now, input.occurredOn ?? today), {
    accountId: account.id,
    amount: input.amount,
    categoryId: categoryId(input.categoryId),
  });
  return coverPreviewView({ ...view, chart }, today, entry, tagIds);
}

/** What recording `entry` would take, with the names the entry sheet shows. */
export function coverPreviewView(
  view: LedgerView,
  today: LocalDate,
  entry: Transaction,
  tagIds: readonly string[],
): CoverPreviewView {
  const names = namesOf(view.budgets);
  const preview = coverPreview(view, today, entry, tagIds.map(tagId));
  return {
    ...preview,
    budgetId: preview.budgetId,
    covers: preview.covers.map((c) => ({
      source: c.source,
      name: orderItem(c.source, names).name,
      amount: c.amount,
      setAside: c.setAside,
    })),
  };
}
