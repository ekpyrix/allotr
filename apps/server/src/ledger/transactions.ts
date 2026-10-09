import {
  accountId,
  categoryId,
  dayNetTotals,
  edit,
  entryGroupTotals,
  entryTotals,
  expense,
  income,
  payeeKey,
  reinstate,
  reverse,
  transactionId,
  transfer,
  type Chart,
  type Transaction,
  type TransactionId,
} from '@allotr/core';
import type {
  CreateTransactionBody,
  DayOrderView,
  LocalDate,
  MoveTransactionBody,
  TransactionListView,
  TransactionView,
} from '@allotr/shared';
import { isRank } from '@allotr/shared';
import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { atPath, RequestProblem } from '../http/domain-errors.ts';
import {
  refuseIouEdit,
  refuseUndoWithPayments,
  restoreIouRows,
} from './iou-links.ts';
import { moveInDay } from './entry-order.ts';
import { readLedgerSettings } from './ledger-settings.ts';
import { loadRates, recordImpliedRate, releaseImpliedRate } from './rates.ts';
import { isUniqueViolation } from './sqlite-errors.ts';
import {
  appendTransaction,
  ensureSystemAccounts,
  loadChart,
  loadLedger,
  newEntry,
  newTransactionId,
  userToday,
  type Db,
  type TransactionSource,
} from './store.ts';

// Recording, listing, undoing and editing entries (FR-L1, FR-L4, FR-X3).
// Every write goes through core's builders inside one database
// transaction, so a refused entry writes nothing. Nothing is updated or
// deleted: undo is a reversal, edit is a reversal plus a new entry, and
// restoring an undone entry records a copy of it.

type Kind = TransactionView['kind'];

function notFound(): RequestProblem {
  return new RequestProblem(
    404,
    'transaction_not_found',
    'There is no such entry.',
  );
}

// ---------------------------------------------------------------- reading

type TransactionRow = {
  id: string;
  kind: string;
  occurred_on: string;
  occurred_time: string | null;
  created_at: string;
  sort_rank: string;
  source: string;
  client: string | null;
  category_id: string | null;
  note: string | null;
  reverses_id: string | null;
  fx_rate_implied: string | null;
  switch_account_id: string | null;
  switch_budget_group: string | null;
};

const transactionColumns = [
  'transactions.id',
  'transactions.kind',
  'transactions.occurred_on',
  'transactions.occurred_time',
  'transactions.created_at',
  'transaction_ranks.sort_rank',
  'transactions.source',
  'transactions.client',
  'transactions.category_id',
  'transactions.note',
  'transactions.reverses_id',
  'transactions.fx_rate_implied',
  'transactions.switch_account_id',
  'transactions.switch_budget_group',
] as const;

// A user's entries with their place in the day. Every entry has a rank row
// (migration 0014), so the inner join loses none.
function selectEntries(db: Db, userId: string) {
  return db
    .selectFrom('transactions')
    .innerJoin(
      'transaction_ranks',
      'transaction_ranks.transaction_id',
      'transactions.id',
    )
    .select(transactionColumns)
    .where('transactions.user_id', '=', userId);
}

/** Views for transaction rows, with their postings, tags and undo. */
async function views(
  db: Db,
  userId: string,
  rows: readonly TransactionRow[],
): Promise<TransactionView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [postings, tags, reversals, restores, replacements] = await Promise.all(
    [
      db
        .selectFrom('postings')
        .innerJoin('accounts', 'accounts.id', 'postings.account_id')
        .select([
          'postings.transaction_id',
          'postings.account_id',
          'postings.amount_minor',
          'postings.currency',
          'postings.category_id',
          'accounts.system_role',
        ])
        .where('postings.user_id', '=', userId)
        .where('postings.transaction_id', 'in', ids)
        .orderBy('postings.transaction_id')
        .orderBy('postings.position')
        .execute(),
      db
        .selectFrom('transaction_tags')
        .select(['transaction_id', 'tag_id'])
        .where('user_id', '=', userId)
        .where('transaction_id', 'in', ids)
        .orderBy('tag_id')
        .execute(),
      db
        .selectFrom('transactions')
        .select(['id', 'reverses_id'])
        .where('user_id', '=', userId)
        .where('reverses_id', 'in', ids)
        .execute(),
      db
        .selectFrom('transactions')
        .select(['id', 'idempotency_key'])
        .where('user_id', '=', userId)
        .where('idempotency_key', 'in', ids.map(restoreKey))
        .execute(),
      db
        .selectFrom('transaction_replacements')
        .select(['replacement_id', 'original_id'])
        .where('user_id', '=', userId)
        .where((eb) =>
          eb.or([
            eb('replacement_id', 'in', ids),
            eb('original_id', 'in', ids),
          ]),
        )
        .execute(),
    ],
  );
  const group = <T extends { transaction_id: string }>(items: T[]) => {
    const map = new Map<string, T[]>();
    for (const item of items) {
      map.set(item.transaction_id, [
        ...(map.get(item.transaction_id) ?? []),
        item,
      ]);
    }
    return map;
  };
  const legs = group(postings);
  const tagsOf = group(tags);
  const undoneBy = new Map(reversals.map((r) => [r.reverses_id, r.id]));
  const restoredBy = new Map(restores.map((r) => [r.idempotency_key, r.id]));
  const replaces = new Map(
    replacements.map((r) => [r.replacement_id, r.original_id]),
  );
  const replacedBy = new Map(
    replacements.map((r) => [r.original_id, r.replacement_id]),
  );

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as Kind,
    occurredOn: row.occurred_on as LocalDate,
    occurredTime: row.occurred_time as TransactionView['occurredTime'],
    createdAt: row.created_at,
    sortRank: row.sort_rank,
    source: (row.client ?? row.source) as TransactionView['source'],
    categoryId: row.category_id,
    note: row.note,
    postings: (legs.get(row.id) ?? []).map((p) => ({
      accountId: p.account_id,
      systemRole:
        p.system_role as TransactionView['postings'][number]['systemRole'],
      amount: { amountMinor: p.amount_minor, currency: p.currency },
      categoryId: p.category_id,
    })) as TransactionView['postings'],
    reversesId: row.reverses_id,
    reversedById: undoneBy.get(row.id) ?? null,
    restoredById: restoredBy.get(restoreKey(row.id)) ?? null,
    replacesId: replaces.get(row.id) ?? null,
    replacedById: replacedBy.get(row.id) ?? null,
    impliedRate: row.fx_rate_implied as TransactionView['impliedRate'],
    budgetSwitch:
      row.switch_account_id === null
        ? null
        : {
            accountId: row.switch_account_id,
            budgetGroup: row.switch_budget_group as 'on' | 'off',
          },
    tagIds: (tagsOf.get(row.id) ?? []).map((t) => t.tag_id),
  }));
}

async function viewsByIds(
  db: Db,
  userId: string,
  ids: readonly string[],
): Promise<TransactionView[]> {
  const rows = await selectEntries(db, userId)
    .where('transactions.id', 'in', ids)
    .execute();
  const found = await views(db, userId, rows);
  return ids.flatMap((id) => found.filter((view) => view.id === id));
}

export async function getTransaction(
  db: Db,
  userId: string,
  id: string,
): Promise<TransactionView> {
  const [view] = await viewsByIds(db, userId, [id]);
  if (view === undefined) throw notFound();
  return view;
}

export type ListFilter = Readonly<{
  from?: LocalDate | undefined;
  to?: LocalDate | undefined;
  accountId?: readonly string[] | undefined;
  categoryId?: readonly string[] | undefined;
  tagId?: string | undefined;
  q?: string | undefined;
  payee?: string | undefined;
  type?: 'expense' | 'income' | 'transfer' | undefined;
  undone?: 'show' | 'hide' | undefined;
  group?: 'none' | 'day' | 'category' | undefined;
  limit: number;
  cursor?: string | undefined;
}>;

type Cursor = [occurredOn: string, sortRank: string, id: string];

function encodeCursor(view: TransactionView): string {
  const cursor: Cursor = [view.occurredOn, view.sortRank, view.id];
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(text: string): Cursor {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(text, 'base64url').toString(),
    );
    if (
      Array.isArray(value) &&
      value.length === 3 &&
      value.every((part) => typeof part === 'string') &&
      // Cursors from before entries had ranks held a timestamp here.
      isRank(value[1] ?? '')
    ) {
      return value as Cursor;
    }
  } catch {
    // Reported below.
  }
  throw new RequestProblem(
    400,
    'invalid_cursor',
    'The page cursor is invalid.',
  );
}

// The category, its subcategories and every category merged into them.
async function categoryFamily(
  db: Db,
  userId: string,
  ids: readonly string[],
): Promise<string[]> {
  const rows = await db
    .selectFrom('categories')
    .select(['id', 'parent_id', 'merged_into_id'])
    .where('user_id', '=', userId)
    .execute();
  for (const id of ids) {
    if (!rows.some((row) => row.id === id)) {
      throw new RequestProblem(
        404,
        'category_not_found',
        'There is no such category.',
      );
    }
  }
  const family = new Set(ids);
  for (const row of rows) {
    if (row.parent_id !== null && ids.includes(row.parent_id)) {
      family.add(row.id);
    }
  }
  for (const row of rows) {
    if (row.merged_into_id !== null && family.has(row.merged_into_id)) {
      family.add(row.id);
    }
  }
  return [...family];
}

async function checkTagExists(
  db: Db,
  userId: string,
  id: string,
): Promise<void> {
  const row = await db
    .selectFrom('tags')
    .select('id')
    .where('user_id', '=', userId)
    .where('id', '=', id)
    .executeTakeFirst();
  if (row === undefined) {
    throw new RequestProblem(404, 'tag_not_found', 'There is no such tag.');
  }
}

/** Entries newest first, by date, then time of entry, then ID. */
// The entries a filter matches, before paging.
async function matching(db: Db, userId: string, filter: ListFilter) {
  let query = selectEntries(db, userId);
  if (filter.from !== undefined) {
    query = query.where('transactions.occurred_on', '>=', filter.from);
  }
  if (filter.to !== undefined)
    query = query.where('transactions.occurred_on', '<=', filter.to);
  if (filter.accountId !== undefined) {
    const accounts = filter.accountId;
    query = query.where((eb) =>
      eb.or([
        eb('switch_account_id', 'in', accounts),
        eb.exists(
          eb
            .selectFrom('postings')
            .select('postings.id')
            .whereRef('postings.transaction_id', '=', 'transactions.id')
            .where('postings.user_id', '=', userId)
            .where('postings.account_id', 'in', accounts),
        ),
      ]),
    );
  }
  // A split's lines are on its postings; a transfer's category only on
  // the entry itself.
  if (filter.categoryId !== undefined) {
    const family = await categoryFamily(db, userId, filter.categoryId);
    query = query.where((eb) =>
      eb.or([
        eb('category_id', 'in', family),
        eb.exists(
          eb
            .selectFrom('postings')
            .select('postings.id')
            .whereRef('postings.transaction_id', '=', 'transactions.id')
            .where('postings.user_id', '=', userId)
            .where('postings.category_id', 'in', family),
        ),
      ]),
    );
  }
  // Undos are stored without tags or a note, so they match through the
  // entry they undo; account and category are copied onto them already.
  if (filter.tagId !== undefined) {
    await checkTagExists(db, userId, filter.tagId);
    const tag = filter.tagId;
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom('transaction_tags')
          .select('transaction_tags.tag_id')
          .where('transaction_tags.user_id', '=', userId)
          .where('transaction_tags.tag_id', '=', tag)
          .where((inner) =>
            inner.or([
              inner(
                'transaction_tags.transaction_id',
                '=',
                inner.ref('transactions.id'),
              ),
              inner(
                'transaction_tags.transaction_id',
                '=',
                inner.ref('transactions.reverses_id'),
              ),
            ]),
          ),
      ),
    );
  }
  // An edit's earlier version and its undo are history, not deletes: they
  // are listed in neither view, only reached from the entry.
  query = query.where((eb) =>
    eb.not(
      eb.exists(
        eb
          .selectFrom('transaction_replacements as replaced')
          .select('replaced.original_id')
          .where('replaced.user_id', '=', userId)
          .where((inner) =>
            inner.or([
              inner('replaced.original_id', '=', inner.ref('transactions.id')),
              inner(
                'replaced.original_id',
                '=',
                inner.ref('transactions.reverses_id'),
              ),
            ]),
          ),
      ),
    ),
  );
  if (filter.undone === 'hide') {
    query = query.where((eb) =>
      eb.and([
        eb('kind', '!=', 'reversal'),
        eb.not(
          eb.exists(
            eb
              .selectFrom('transactions as undo')
              .select('undo.id')
              .where('undo.user_id', '=', userId)
              .whereRef('undo.reverses_id', '=', 'transactions.id'),
          ),
        ),
      ]),
    );
  }
  if (filter.q !== undefined) {
    const pattern = `%${filter.q.replace(/[\\%_]/g, '\\$&')}%`;
    query = query.where((eb) =>
      eb.or([
        sql<boolean>`transactions.note like ${pattern} escape '\\'`,
        eb.exists(
          eb
            .selectFrom('transactions as original')
            .select('original.id')
            .whereRef('original.id', '=', 'transactions.reverses_id')
            .where('original.user_id', '=', userId)
            .where(sql<boolean>`original.note like ${pattern} escape '\\'`),
        ),
      ]),
    );
  }
  // The same key the payee report ranks by, so "same payee" lists exactly
  // the entries counted under it.
  const key = filter.payee === undefined ? null : payeeKey(filter.payee);
  if (key !== null) {
    query = query.where((eb) =>
      eb.or([
        sql<boolean>`payee_key(transactions.note) = ${key}`,
        eb.exists(
          eb
            .selectFrom('transactions as original')
            .select('original.id')
            .whereRef('original.id', '=', 'transactions.reverses_id')
            .where('original.user_id', '=', userId)
            .where(sql<boolean>`payee_key(original.note) = ${key}`),
        ),
      ]),
    );
  }
  // Spending and income are read from the postings, as `totals` reads
  // them, so the types' spent figures add up to the unfiltered one. An
  // undo posts the same legs negated, so it matches with its entry.
  if (filter.type === 'transfer') {
    query = query.where((eb) =>
      eb.or([
        eb('kind', '=', 'transfer'),
        eb.exists(
          eb
            .selectFrom('transactions as original')
            .select('original.id')
            .whereRef('original.id', '=', 'transactions.reverses_id')
            .where('original.user_id', '=', userId)
            .where('original.kind', '=', 'transfer'),
        ),
      ]),
    );
  } else if (filter.type !== undefined) {
    const role = filter.type === 'expense' ? 'expenses' : 'income';
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom('postings')
          .innerJoin('accounts', 'accounts.id', 'postings.account_id')
          .select('postings.id')
          .whereRef('postings.transaction_id', '=', 'transactions.id')
          .where('postings.user_id', '=', userId)
          .where('accounts.user_id', '=', userId)
          .where('accounts.system_role', '=', role),
      ),
    );
  }
  return query;
}

export async function listTransactions(
  db: Db,
  userId: string,
  filter: ListFilter,
): Promise<TransactionListView> {
  let query = await matching(db, userId, filter);
  if (filter.cursor !== undefined) {
    const [occurredOn, sortRank, id] = decodeCursor(filter.cursor);
    query = query.where(
      sql<boolean>`(transactions.occurred_on, transaction_ranks.sort_rank, transactions.id) < (${occurredOn}, ${sortRank}, ${id})`,
    );
  }
  const rows = await query
    .orderBy('transactions.occurred_on', 'desc')
    .orderBy('transaction_ranks.sort_rank', 'desc')
    .orderBy('transactions.id', 'desc')
    .limit(filter.limit + 1)
    .execute();
  const page = await views(db, userId, rows.slice(0, filter.limit));
  const last = page.at(-1);
  return {
    transactions: page,
    nextCursor:
      rows.length > filter.limit && last !== undefined
        ? encodeCursor(last)
        : null,
    dayTotals: await dayTotalsFor(db, userId, filter, page),
    ...(await totalsFor(db, userId, filter)),
  };
}

/**
 * Count, spent, income and net of every matching entry, and the same per
 * day or category, ignoring paging. Per currency, with no rates applied.
 */
async function totalsFor(
  db: Db,
  userId: string,
  filter: ListFilter,
): Promise<Pick<TransactionListView, 'totals' | 'groups'>> {
  const [rows, chart] = await Promise.all([
    (await matching(db, userId, filter)).execute(),
    loadChart(db, userId),
  ]);
  const entries = (await views(db, userId, rows)).map((view) => ({
    occurredOn: view.occurredOn,
    categoryId: view.categoryId === null ? null : categoryId(view.categoryId),
    postings: view.postings.map((posting) => ({
      accountId: accountId(posting.accountId),
      amount: posting.amount,
      categoryId:
        posting.categoryId === null ? null : categoryId(posting.categoryId),
    })),
  }));
  const grouping = filter.group ?? 'none';
  return {
    totals: entryTotals(chart, entries),
    groups:
      grouping === 'none' ? [] : entryGroupTotals(chart, entries, grouping),
  };
}

/**
 * The net total of every matching entry on each day the page shows, not
 * only the entries on this page, so a day split across pages still shows
 * its whole total (spec §11.2).
 */
async function dayTotalsFor(
  db: Db,
  userId: string,
  filter: ListFilter,
  page: readonly TransactionView[],
): Promise<TransactionListView['dayTotals']> {
  const days = [...new Set(page.map((view) => view.occurredOn))];
  if (days.length === 0) return [];
  const [rows, chart, rates, settings] = await Promise.all([
    (await matching(db, userId, filter))
      .where('transactions.occurred_on', 'in', days)
      .execute(),
    loadChart(db, userId),
    loadRates(db, userId),
    readLedgerSettings(db, userId),
  ]);
  const entries = (await views(db, userId, rows)).map((view) => ({
    occurredOn: view.occurredOn,
    postings: view.postings.map((posting) => ({
      accountId: accountId(posting.accountId),
      amount: posting.amount,
    })),
  }));
  return dayNetTotals(
    chart,
    entries,
    rates,
    settings.defaultCurrency,
    // The net of one account is its own; several are the user's whole.
    filter.accountId?.length === 1 && filter.accountId[0] !== undefined
      ? accountId(filter.accountId[0])
      : undefined,
  ).map((total) => ({
    date: total.date,
    net: total.net,
    missingRates: [...total.missingRates],
  }));
}

// ---------------------------------------------------------------- writing

const categoryKinds = {
  expense: 'expense',
  income: 'income',
  transfer: 'transfer',
} as const;

// The category an entry is filed under. A merged category files under the
// one it was merged into, so a queued offline entry still lands.
export async function resolveCategory(
  db: Db,
  userId: string,
  id: string,
  kind: keyof typeof categoryKinds,
): Promise<string> {
  const row = await db
    .selectFrom('categories as c')
    .leftJoin('categories as target', 'target.id', 'c.merged_into_id')
    .select([
      sql<string>`coalesce(target.id, c.id)`.as('id'),
      sql<string>`coalesce(target.kind, c.kind)`.as('kind'),
    ])
    .where('c.user_id', '=', userId)
    .where('c.id', '=', id)
    .executeTakeFirst();
  if (row?.kind !== categoryKinds[kind]) {
    throw new RequestProblem(
      400,
      'invalid_category',
      `Choose one of your ${categoryKinds[kind]} categories.`,
    );
  }
  return row.id;
}

export async function checkTags(
  db: Db,
  userId: string,
  tagIds: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(tagIds)];
  if (unique.length === 0) return unique;
  const found = await db
    .selectFrom('tags')
    .select('id')
    .where('user_id', '=', userId)
    .where('id', 'in', unique)
    .execute();
  if (found.length !== unique.length) {
    throw new RequestProblem(
      400,
      'unknown_tag',
      'One of the tags does not exist.',
    );
  }
  return unique;
}

function currenciesOf(body: CreateTransactionBody) {
  return body.kind === 'transfer'
    ? [body.sent.currency, ...(body.received ? [body.received.currency] : [])]
    : [
        body.amount.currency,
        ...(body.foreignAmount ? [body.foreignAmount.currency] : []),
      ];
}

/** Builds (but does not store) the entry a request describes. */
async function build(
  db: Db,
  userId: string,
  body: CreateTransactionBody,
  now: Date,
  keepTime = false,
): Promise<{ transaction: Transaction; chart: Chart; tagIds: string[] }> {
  const chart = await ensureSystemAccounts(
    db,
    userId,
    await loadChart(db, userId),
    currenciesOf(body),
    now,
  );
  const tagIds = await checkTags(db, userId, body.tagIds ?? []);
  // A time is kept only when the user has entry times on, so a client that
  // always sends one (such as a chat parser) follows the setting. An import
  // keeps the times its history has.
  const { entryTimes } = await readLedgerSettings(db, userId);
  const entry = newEntry(
    now,
    body.occurredOn ?? (await userToday(db, userId, now)),
    body.note,
    entryTimes === 'off' && !keepTime ? null : (body.occurredTime ?? null),
  );
  if (body.kind === 'transfer') {
    const category =
      body.categoryId === undefined
        ? null
        : await resolveCategory(db, userId, body.categoryId, 'transfer');
    const transaction = transfer(chart, entry, {
      fromId: accountId(body.fromAccountId),
      toId: accountId(body.toAccountId),
      sent: body.sent,
      ...(body.received === undefined ? {} : { received: body.received }),
      categoryId: category === null ? null : categoryId(category),
    });
    return { transaction, chart, tagIds };
  }
  const make = body.kind === 'expense' ? expense : income;
  const kind = body.kind;
  const side =
    body.lines === undefined
      ? {
          categoryId: categoryId(
            await resolveCategory(db, userId, body.categoryId ?? '', kind),
          ),
        }
      : {
          lines: await Promise.all(
            body.lines.map(async (line, index) => {
              try {
                const id = await resolveCategory(
                  db,
                  userId,
                  line.categoryId,
                  kind,
                );
                return { categoryId: categoryId(id), amount: line.amount };
              } catch (error) {
                if (!(error instanceof RequestProblem)) throw error;
                throw atPath(error, `/lines/${String(index)}/categoryId`);
              }
            }),
          ),
        };
  const transaction = make(chart, entry, {
    accountId: accountId(body.accountId),
    amount: body.amount,
    ...side,
    ...(body.foreignAmount === undefined
      ? {}
      : { foreignAmount: body.foreignAmount }),
  });
  return { transaction, chart, tagIds };
}

/** Stores a built entry and its tags inside the caller's transaction. */
export async function storeTransaction(
  db: Db,
  userId: string,
  transaction: Transaction,
  tagIds: readonly string[],
  idempotencyKey: string | null,
  source: TransactionSource,
  placeAfter?: TransactionId,
): Promise<void> {
  await appendTransaction(db, userId, transaction, {
    source,
    idempotencyKey,
    ...(placeAfter === undefined ? {} : { placeAfter }),
  });
  if (transaction.reversesId !== null) {
    await releaseImpliedRate(db, userId, transaction.reversesId);
  } else {
    await recordImpliedRate(
      db,
      userId,
      transaction,
      new Date(transaction.createdAt),
    );
  }
  if (tagIds.length === 0) return;
  await db
    .insertInto('transaction_tags')
    .values(
      tagIds.map((tagId) => ({
        user_id: userId,
        transaction_id: transaction.id,
        tag_id: tagId,
      })),
    )
    .execute();
}

/** Builds and stores an entry inside the caller's database transaction. */
export async function recordTransaction(
  db: Db,
  userId: string,
  body: CreateTransactionBody,
  source: TransactionSource,
  now: Date,
): Promise<string> {
  const { transaction, tagIds } = await build(
    db,
    userId,
    body,
    now,
    source === 'import',
  );
  await storeTransaction(db, userId, transaction, tagIds, null, source);
  return transaction.id;
}

export async function byIdempotencyKey(
  db: Db,
  userId: string,
  key: string,
): Promise<TransactionView | undefined> {
  const row = await db
    .selectFrom('transactions')
    .select('id')
    .where('user_id', '=', userId)
    .where('idempotency_key', '=', key)
    .executeTakeFirst();
  return row === undefined ? undefined : getTransaction(db, userId, row.id);
}

/**
 * Records an entry. With an idempotency key, a repeat returns the entry
 * the key first created instead of recording another (docs/domain.md
 * "Edge cases": offline entries arriving late).
 */
export async function createTransaction(
  db: Kysely<DB>,
  userId: string,
  body: CreateTransactionBody,
  idempotencyKey: string | undefined,
  now: Date,
): Promise<{ transaction: TransactionView; replayed: boolean }> {
  const key = idempotencyKey ?? null;
  try {
    const id = await db.transaction().execute(async (trx) => {
      if (key !== null) {
        const earlier = await byIdempotencyKey(trx, userId, key);
        if (earlier !== undefined) return null;
      }
      const { transaction, tagIds } = await build(trx, userId, body, now);
      await storeTransaction(trx, userId, transaction, tagIds, key, 'api');
      return transaction.id;
    });
    if (id !== null) {
      return {
        transaction: await getTransaction(db, userId, id),
        replayed: false,
      };
    }
  } catch (error) {
    // A concurrent request with the same key won the race.
    if (key === null || !isUniqueViolation(error)) throw error;
  }
  const earlier =
    key === null ? undefined : await byIdempotencyKey(db, userId, key);
  if (earlier === undefined) throw notFound();
  return { transaction: earlier, replayed: true };
}

/** Stores the reversal of an entry inside the caller's transaction. */
export async function insertReversal(
  db: Db,
  userId: string,
  id: string,
  note: string | undefined,
  now: Date,
): Promise<string> {
  await refuseUndoWithPayments(db, userId, id);
  const chart = await loadChart(db, userId);
  const ledger = await loadLedger(db, userId, chart);
  const reversal = reverse(chart, ledger, transactionId(id), {
    id: newTransactionId(),
    createdAt: now.toISOString(),
    note: note ?? null,
  });
  await storeTransaction(db, userId, reversal, [], null, 'api');
  return reversal.id;
}

/** Undoes an entry with a reversal that carries its date (FR-L4). */
export async function reverseTransaction(
  db: Kysely<DB>,
  userId: string,
  id: string,
  note: string | undefined,
  now: Date,
): Promise<TransactionView> {
  const reversalId = await db
    .transaction()
    .execute((trx) => insertReversal(trx, userId, id, note, now));
  return getTransaction(db, userId, reversalId);
}

// A restored copy is stored under this key, so each undone entry is
// restored at most once and its view can point at the copy.
function restoreKey(id: string): string {
  return `restore:${id}`;
}

/**
 * Brings back an undone entry as a copy with the same date, category,
 * note, tags and postings.
 */
export async function restoreTransaction(
  db: Kysely<DB>,
  userId: string,
  id: string,
  now: Date,
): Promise<TransactionView> {
  const key = restoreKey(id);
  const copyId = await db.transaction().execute(async (trx) => {
    const earlier = await byIdempotencyKey(trx, userId, key);
    if (earlier !== undefined) {
      throw new RequestProblem(
        409,
        'already_restored',
        'This entry has already been restored.',
      );
    }
    const chart = await loadChart(trx, userId);
    const ledger = await loadLedger(trx, userId, chart);
    const copy = reinstate(chart, ledger, transactionId(id), {
      id: newTransactionId(),
      createdAt: now.toISOString(),
    });
    const tags = await trx
      .selectFrom('transaction_tags')
      .select('tag_id')
      .where('user_id', '=', userId)
      .where('transaction_id', '=', id)
      .execute();
    await storeTransaction(
      trx,
      userId,
      copy,
      tags.map((t) => t.tag_id),
      key,
      'api',
      transactionId(id),
    );
    await restoreIouRows(trx, userId, id, copy.id, now);
    return copy.id;
  });
  return getTransaction(db, userId, copyId);
}

/**
 * Notes that `replacementId` took the place of `originalId` in an edit,
 * inside the caller's transaction, so the original's undo is not listed
 * as a delete.
 */
export async function recordReplacement(
  db: Db,
  userId: string,
  originalId: string,
  replacementId: string,
): Promise<void> {
  await db
    .insertInto('transaction_replacements')
    .values({
      replacement_id: replacementId,
      original_id: originalId,
      user_id: userId,
    })
    .execute();
}

/** Replaces an entry: its reversal plus a new entry (FR-L4). */
export async function editTransaction(
  db: Kysely<DB>,
  userId: string,
  id: string,
  body: CreateTransactionBody,
  now: Date,
): Promise<{ reversal: TransactionView; replacement: TransactionView }> {
  const [reversalId, replacementId] = await db
    .transaction()
    .execute(async (trx) => {
      await refuseIouEdit(trx, userId, id, 'edit');
      const built = await build(trx, userId, body, now);
      const ledger = await loadLedger(trx, userId, built.chart);
      const [reversal, replacement] = edit(
        built.chart,
        ledger,
        transactionId(id),
        { id: newTransactionId(), createdAt: now.toISOString() },
        built.transaction,
      );
      await storeTransaction(trx, userId, reversal, [], null, 'api');
      await storeTransaction(
        trx,
        userId,
        replacement,
        built.tagIds,
        null,
        'api',
        transactionId(id),
      );
      await recordReplacement(trx, userId, id, replacement.id);
      return [reversal.id, replacement.id] as const;
    });
  const [reversal, replacement] = await viewsByIds(db, userId, [
    reversalId,
    replacementId,
  ]);
  if (reversal === undefined || replacement === undefined) throw notFound();
  return { reversal, replacement };
}

/**
 * Goes back to an earlier version of an edited entry: the current version
 * is replaced by a copy of the earlier one, as an edit, so it can be
 * undone or edited like any other (FR-L4).
 */
export async function revertTransaction(
  db: Kysely<DB>,
  userId: string,
  versionId: string,
  now: Date,
): Promise<{ reversal: TransactionView; replacement: TransactionView }> {
  const [reversalId, copyId] = await db.transaction().execute(async (trx) => {
    const version = await getTransaction(trx, userId, versionId);
    if (version.replacedById === null)
      throw new RequestProblem(
        409,
        'not_replaced',
        'This is not an earlier version of an edited entry.',
      );
    // The version that stands now: follow the edits forward.
    let current = await getTransaction(trx, userId, version.replacedById);
    for (let hops = 0; current.replacedById !== null; hops += 1) {
      if (hops > 10_000) throw new Error('edit chain does not end');
      current = await getTransaction(trx, userId, current.replacedById);
    }
    if (current.reversedById !== null)
      throw new RequestProblem(
        409,
        'entry_deleted',
        'The entry has been deleted since. Restore it first.',
      );
    await refuseIouEdit(trx, userId, current.id, 'edit');
    const chart = await loadChart(trx, userId);
    const ledger = await loadLedger(trx, userId, chart);
    const meta = { id: newTransactionId(), createdAt: now.toISOString() };
    const reversal = reverse(chart, ledger, transactionId(current.id), meta);
    const copy = reinstate(chart, ledger, transactionId(versionId), {
      id: newTransactionId(),
      createdAt: meta.createdAt,
    });
    await storeTransaction(trx, userId, reversal, [], null, 'api');
    await storeTransaction(
      trx,
      userId,
      copy,
      version.tagIds,
      null,
      'api',
      transactionId(current.id),
    );
    await recordReplacement(trx, userId, current.id, copy.id);
    return [reversal.id, copy.id] as const;
  });
  const [reversal, replacement] = await viewsByIds(db, userId, [
    reversalId,
    copyId,
  ]);
  if (reversal === undefined || replacement === undefined) throw notFound();
  return { reversal, replacement };
}

/**
 * Moves an entry within its day (docs/domain.md "Order within a day").
 * Nothing in the entry changes, only its place; figures that follow the
 * order, such as which budget covered a shortfall, follow it too.
 */
export async function moveTransaction(
  db: Kysely<DB>,
  userId: string,
  id: string,
  body: MoveTransactionBody,
  now: Date,
): Promise<DayOrderView> {
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('transactions')
      .select('occurred_on')
      .where('user_id', '=', userId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (row === undefined) throw notFound();
    const occurredOn = row.occurred_on as LocalDate;
    const ids = await moveInDay(
      trx,
      userId,
      transactionId(id),
      occurredOn,
      body.afterId === null ? null : transactionId(body.afterId),
      now,
    );
    return { occurredOn, ids };
  });
}
