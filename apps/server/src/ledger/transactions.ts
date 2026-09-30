import {
  accountId,
  categoryId,
  dayNetTotals,
  edit,
  expense,
  income,
  reverse,
  transactionId,
  transfer,
  type Chart,
  type Transaction,
} from '@allotr/core';
import type {
  CreateTransactionBody,
  LocalDate,
  TransactionListView,
  TransactionView,
} from '@allotr/shared';
import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { atPath, RequestProblem } from '../http/domain-errors.ts';
import { readLedgerSettings } from './ledger-settings.ts';
import { loadRates } from './rates.ts';
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
// deleted: undo is a reversal, edit is a reversal plus a new entry.

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
  created_at: string;
  source: string;
  category_id: string | null;
  note: string | null;
  reverses_id: string | null;
  fx_rate_implied: string | null;
  switch_account_id: string | null;
  switch_budget_group: string | null;
};

const transactionColumns = [
  'id',
  'kind',
  'occurred_on',
  'created_at',
  'source',
  'category_id',
  'note',
  'reverses_id',
  'fx_rate_implied',
  'switch_account_id',
  'switch_budget_group',
] as const;

/** Views for transaction rows, with their postings, tags and undo. */
async function views(
  db: Db,
  userId: string,
  rows: readonly TransactionRow[],
): Promise<TransactionView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [postings, tags, reversals] = await Promise.all([
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
  ]);
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

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as Kind,
    occurredOn: row.occurred_on as LocalDate,
    createdAt: row.created_at,
    source: row.source as TransactionView['source'],
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
  const rows = await db
    .selectFrom('transactions')
    .select(transactionColumns)
    .where('user_id', '=', userId)
    .where('id', 'in', ids)
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
  accountId?: string | undefined;
  categoryId?: string | undefined;
  tagId?: string | undefined;
  q?: string | undefined;
  limit: number;
  cursor?: string | undefined;
}>;

type Cursor = [occurredOn: string, createdAt: string, id: string];

function encodeCursor(view: TransactionView): string {
  const cursor: Cursor = [view.occurredOn, view.createdAt, view.id];
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
      value.every((part) => typeof part === 'string')
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
  id: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom('categories')
    .select(['id', 'parent_id', 'merged_into_id'])
    .where('user_id', '=', userId)
    .execute();
  if (!rows.some((row) => row.id === id)) {
    throw new RequestProblem(
      404,
      'category_not_found',
      'There is no such category.',
    );
  }
  const family = new Set([id]);
  for (const row of rows) if (row.parent_id === id) family.add(row.id);
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
  let query = db
    .selectFrom('transactions')
    .select(transactionColumns)
    .where('user_id', '=', userId);
  if (filter.from !== undefined) {
    query = query.where('occurred_on', '>=', filter.from);
  }
  if (filter.to !== undefined)
    query = query.where('occurred_on', '<=', filter.to);
  if (filter.accountId !== undefined) {
    const account = filter.accountId;
    query = query.where((eb) =>
      eb.or([
        eb('switch_account_id', '=', account),
        eb.exists(
          eb
            .selectFrom('postings')
            .select('postings.id')
            .whereRef('postings.transaction_id', '=', 'transactions.id')
            .where('postings.user_id', '=', userId)
            .where('postings.account_id', '=', account),
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
  return query;
}

export async function listTransactions(
  db: Db,
  userId: string,
  filter: ListFilter,
): Promise<TransactionListView> {
  let query = await matching(db, userId, filter);
  if (filter.cursor !== undefined) {
    const [occurredOn, createdAt, id] = decodeCursor(filter.cursor);
    query = query.where(
      sql<boolean>`(occurred_on, created_at, id) < (${occurredOn}, ${createdAt}, ${id})`,
    );
  }
  const rows = await query
    .orderBy('occurred_on', 'desc')
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
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
      .where('occurred_on', 'in', days)
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
    filter.accountId === undefined ? undefined : accountId(filter.accountId),
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
async function resolveCategory(
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

async function checkTags(
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
): Promise<{ transaction: Transaction; chart: Chart; tagIds: string[] }> {
  const chart = await ensureSystemAccounts(
    db,
    userId,
    await loadChart(db, userId),
    currenciesOf(body),
    now,
  );
  const tagIds = await checkTags(db, userId, body.tagIds ?? []);
  const entry = newEntry(
    now,
    body.occurredOn ?? (await userToday(db, userId, now)),
    body.note,
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
): Promise<void> {
  await appendTransaction(db, userId, transaction, { source, idempotencyKey });
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
  const { transaction, tagIds } = await build(db, userId, body, now);
  await storeTransaction(db, userId, transaction, tagIds, null, source);
  return transaction.id;
}

async function byIdempotencyKey(
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

/** Undoes an entry with a reversal that carries its date (FR-L4). */
export async function reverseTransaction(
  db: Kysely<DB>,
  userId: string,
  id: string,
  note: string | undefined,
  now: Date,
): Promise<TransactionView> {
  const reversalId = await db.transaction().execute(async (trx) => {
    const chart = await loadChart(trx, userId);
    const ledger = await loadLedger(trx, userId, chart);
    const reversal = reverse(chart, ledger, transactionId(id), {
      id: newTransactionId(),
      createdAt: now.toISOString(),
      note: note ?? null,
    });
    await storeTransaction(trx, userId, reversal, [], null, 'api');
    return reversal.id;
  });
  return getTransaction(db, userId, reversalId);
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
      );
      return [reversal.id, replacement.id] as const;
    });
  const [reversal, replacement] = await viewsByIds(db, userId, [
    reversalId,
    replacementId,
  ]);
  if (reversal === undefined || replacement === undefined) throw notFound();
  return { reversal, replacement };
}
