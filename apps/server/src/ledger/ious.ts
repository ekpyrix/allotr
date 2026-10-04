import { randomUUID } from 'node:crypto';
import {
  accountId,
  baseSystemRoles,
  borrow,
  categoryId,
  iouId,
  iouStatus,
  iouStatuses,
  iouTotals,
  lend,
  repayment,
  writeOffReceivable,
  type IouDirection,
  type IouStatus,
  type LedgerView,
  type SystemRole,
  type Transaction,
} from '@allotr/core';
import {
  localDate,
  money,
  type Money,
  type ConvertToIouBody,
  type CoverPreviewView,
  type CreateIouBody,
  type IouListView,
  type IouView,
  type RepaymentBody,
  type TransactionView,
  type UpdateIouBody,
  type WriteOffBody,
} from '@allotr/shared';
import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import { coverPreviewView } from './budgets.ts';
import {
  byIdempotencyKey,
  checkTags,
  getTransaction,
  insertReversal,
  resolveCategory,
  storeTransaction,
} from './transactions.ts';
import { iouLinks } from './iou-links.ts';
import {
  ensureSystemAccounts,
  newEntry,
  userToday,
  withSystemAccounts,
  type Db,
} from './store.ts';
import { loadView } from './today.ts';

// IOUs and split bills (ADR 0024, docs/domain.md "IOUs"). The money is in
// the ledger, built by core's `lend`, `borrow`, `repayment` and
// `writeOffReceivable`; the `ious` rows say who owes it and when, and
// `iou_settlements` which entry took how much off. Rows and entries are
// written in one database transaction, and every figure is read back through
// core, so they cannot drift apart.

/** A date after every entry: what is outstanding once all are counted. */
const endOfTime = localDate('9999-12-31');

function problem(status: 400 | 404 | 409, code: string, detail: string) {
  return new RequestProblem(status, code, detail);
}

const notFound = () => problem(404, 'iou_not_found', 'There is no such IOU.');

// ---------------------------------------------------------------- reading

function iouView(status: IouStatus, view: LedgerView): IouView {
  const reversed = new Set(
    view.ledger.flatMap((t) => (t.reversesId === null ? [] : [t.reversesId])),
  );
  const { iou } = status;
  return {
    id: iou.id,
    direction: iou.direction,
    person: iou.person,
    amount: iou.amount,
    repaid: status.repaid,
    writtenOff: status.writtenOff,
    outstanding: status.outstanding,
    settled: status.settled,
    originId: iou.originId,
    recordedOn: iou.recordedOn,
    dueOn: iou.dueOn,
    overdue: status.overdue,
    daysOverdue: status.daysOverdue,
    writeOffOfferedOn: status.writeOffOfferedOn,
    writeOffOffered: status.writeOffOffered,
    settlements: iou.settlements.map((s) => ({
      id: s.id,
      transactionId: s.transactionId,
      kind: s.kind,
      amount: s.amount,
      on: s.on,
      undone: reversed.has(s.transactionId),
    })),
  };
}

export function listIous(
  db: Kysely<DB>,
  userId: string,
  query: Readonly<{
    status: 'open' | 'settled' | 'all';
    person?: string | undefined;
  }>,
  now: Date,
): Promise<IouListView> {
  return db.transaction().execute(async (trx) => {
    const { view } = await loadView(trx, userId);
    const today = await userToday(trx, userId, now);
    const all = iouStatuses(view, today);
    const person = query.person?.toLowerCase();
    const shown = all.filter(
      (s) =>
        (person === undefined || s.iou.person.toLowerCase() === person) &&
        (query.status === 'all' || (query.status === 'settled') === s.settled),
    );
    // Open ones first by due date, as a list of what needs attention.
    const ordered =
      query.status === 'settled'
        ? shown
        : [...shown].sort(
            (a, b) =>
              (a.iou.dueOn ?? '9999-12-31').localeCompare(
                b.iou.dueOn ?? '9999-12-31',
              ) || a.iou.recordedOn.localeCompare(b.iou.recordedOn),
          );
    const totals = iouTotals(view, today, all);
    return {
      ious: ordered.map((s) => iouView(s, view)),
      totals: {
        owedToMe: totals.owedToMe,
        owedByMe: totals.owedByMe,
        missingRates: [...totals.missingRates],
      },
    };
  });
}

/** Names used before, the most recently used first, for autocomplete. */
export async function listPeople(
  db: Kysely<DB>,
  userId: string,
  query: Readonly<{ query?: string | undefined; limit: number }>,
): Promise<{ people: string[] }> {
  const prefix = (query.query ?? '').toLowerCase();
  const escaped = prefix.replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = await db
    .selectFrom('ious')
    .select([
      'person',
      (eb) => eb.fn.max('created_at').as('last'),
      sql<string>`lower(person)`.as('key'),
    ])
    .where('user_id', '=', userId)
    .where(sql<boolean>`lower(person) LIKE ${`${escaped}%`} ESCAPE '\\'`)
    .groupBy('key')
    .orderBy('last', 'desc')
    .orderBy('key')
    .limit(query.limit)
    .execute();
  return { people: rows.map((row) => row.person) };
}

async function viewsOf(
  db: Db,
  userId: string,
  ids: readonly string[],
  now: Date,
): Promise<IouView[]> {
  const { view } = await loadView(db, userId);
  const today = await userToday(db, userId, now);
  const found = (view.ious?.ious ?? []).filter((i) => ids.includes(i.id));
  // A future-dated IOU is shown as of its own day.
  return found
    .map((i) =>
      iouView(
        iouStatus(view, i, i.recordedOn > today ? i.recordedOn : today),
        view,
      ),
    )
    .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

// ---------------------------------------------------------------- writing

function systemRolesFor(
  direction: IouDirection,
  split: boolean,
): readonly SystemRole[] {
  return [
    direction === 'owed-to-me' ? 'receivables' : 'payables',
    ...(split ? (['expenses'] as const) : []),
  ];
}

function userAccountOf(
  chart: LedgerView['chart'],
  id: string,
): ReturnType<typeof accountId> {
  const account = chart.get(accountId(id));
  if (account === undefined || account.systemRole !== null) {
    throw problem(404, 'account_not_found', 'There is no such account.');
  }
  return account.id;
}

function checkCurrency(body: CreateIouBody, currency: string): void {
  const bad = [
    ...body.people.map(
      (p, i) => [`/people/${String(i)}/amount`, p.amount] as const,
    ),
    ...(body.ownShare === undefined
      ? []
      : ([['/ownShare/amount', body.ownShare.amount]] as const)),
  ].filter(([, amount]) => amount.currency !== currency);
  if (bad.length > 0) {
    throw new RequestProblem(
      400,
      'currency_mismatch',
      `Give every amount in ${currency}, the account's currency.`,
      bad.map(([path]) => ({
        path,
        message: `Use ${currency}.`,
      })),
    );
  }
}

type Built = Readonly<{ transaction: Transaction; tagIds: string[] }>;

async function buildCreate(
  db: Db,
  userId: string,
  body: CreateIouBody,
  now: Date,
): Promise<Built> {
  const loaded = await loadView(db, userId);
  const account = userAccountOf(loaded.view.chart, body.accountId);
  const currency = loaded.view.chart.get(account)?.currency;
  if (currency === undefined)
    throw problem(404, 'account_not_found', 'There is no such account.');
  checkCurrency(body, currency);
  const split = body.ownShare !== undefined;
  const chart = await ensureSystemAccounts(
    db,
    userId,
    loaded.view.chart,
    [currency],
    now,
    [...baseSystemRoles, ...systemRolesFor(body.direction, split)].filter(
      (role, i, all) => all.indexOf(role) === i,
    ),
  );
  const tagIds = await checkTags(db, userId, body.tagIds ?? []);
  const entry = newEntry(
    now,
    body.occurredOn ?? (await userToday(db, userId, now)),
    body.note,
  );
  const owed = body.people.map((p) => p.amount);
  if (body.direction === 'owed-by-me') {
    return {
      transaction: borrow(chart, entry, { accountId: account, owed }),
      tagIds,
    };
  }
  const own =
    body.ownShare === undefined
      ? undefined
      : {
          amount: body.ownShare.amount,
          categoryId: categoryId(
            await resolveCategory(
              db,
              userId,
              body.ownShare.categoryId,
              'expense',
            ),
          ),
        };
  return {
    transaction: lend(chart, entry, {
      accountId: account,
      owed,
      ...(own === undefined ? {} : { own }),
    }),
    tagIds,
  };
}

async function insertIous(
  db: Db,
  userId: string,
  body: CreateIouBody,
  transaction: Transaction,
  now: Date,
): Promise<string[]> {
  const at = now.toISOString();
  const rows = body.people.map((p) => ({
    id: randomUUID(),
    user_id: userId,
    direction: body.direction,
    person: p.person,
    amount_minor: p.amount.amountMinor,
    currency: p.amount.currency,
    origin_transaction_id: transaction.id,
    due_on: p.dueOn ?? null,
    created_at: at,
    updated_at: at,
  }));
  await db.insertInto('ious').values(rows).execute();
  return rows.map((row) => row.id);
}

async function iousOfOrigin(
  db: Db,
  userId: string,
  originId: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom('ious')
    .select('id')
    .where('user_id', '=', userId)
    .where('origin_transaction_id', '=', originId)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map((row) => row.id);
}

export type IouSource = 'api' | 'import';

/**
 * Lends, borrows or splits a bill inside the caller's transaction: one entry
 * and one IOU row per person.
 */
export async function createIouIn(
  trx: Db,
  userId: string,
  body: CreateIouBody,
  idempotencyKey: string | null,
  source: IouSource,
  now: Date,
): Promise<{ id: string; ious: string[]; replayed: boolean }> {
  if (idempotencyKey !== null) {
    const earlier = await byIdempotencyKey(trx, userId, idempotencyKey);
    if (earlier !== undefined) {
      return {
        id: earlier.id,
        ious: await iousOfOrigin(trx, userId, earlier.id),
        replayed: true,
      };
    }
  }
  const { transaction, tagIds } = await buildCreate(trx, userId, body, now);
  await storeTransaction(
    trx,
    userId,
    transaction,
    tagIds,
    idempotencyKey,
    source,
  );
  const ious = await insertIous(trx, userId, body, transaction, now);
  return { id: transaction.id, ious, replayed: false };
}

/**
 * Lends, borrows or splits a bill: one entry and one IOU row per person.
 * With an idempotency key, a repeat returns what the key first created.
 */
export async function createIou(
  db: Kysely<DB>,
  userId: string,
  body: CreateIouBody,
  idempotencyKey: string | undefined,
  now: Date,
): Promise<{
  transaction: TransactionView;
  ious: IouView[];
  replayed: boolean;
}> {
  const done = await db
    .transaction()
    .execute((trx) =>
      createIouIn(trx, userId, body, idempotencyKey ?? null, 'api', now),
    );
  return {
    transaction: await getTransaction(db, userId, done.id),
    ious: await viewsOf(db, userId, done.ious, now),
    replayed: done.replayed,
  };
}

/**
 * Turns a logged expense into a split bill or a loan: the expense is undone
 * and an IOU entry with the same account, amount and date replaces it, so
 * the account's line is unchanged. Only a live expense in one category,
 * paid in the account's own currency and tied to no IOU, can be turned.
 */
export async function convertToIou(
  db: Kysely<DB>,
  userId: string,
  id: string,
  body: ConvertToIouBody,
  idempotencyKey: string | undefined,
  now: Date,
): Promise<{
  reversal: TransactionView;
  transaction: TransactionView;
  ious: IouView[];
  replayed: boolean;
}> {
  const done = await db.transaction().execute(async (trx) => {
    const key = idempotencyKey ?? null;
    if (key !== null) {
      const earlier = await byIdempotencyKey(trx, userId, key);
      if (earlier !== undefined) {
        const original = await getTransaction(trx, userId, id);
        if (original.reversedById === null)
          throw problem(
            409,
            'idempotency_conflict',
            'This key was used for another request.',
          );
        return {
          reversalId: original.reversedById,
          id: earlier.id,
          ious: await iousOfOrigin(trx, userId, earlier.id),
          replayed: true,
        };
      }
    }
    const original = await getTransaction(trx, userId, id);
    const paid = original.postings.find((p) => p.systemRole === null);
    const spent = original.postings.find((p) => p.systemRole === 'expenses');
    const links = await iouLinks(trx, userId, id);
    if (
      original.kind !== 'expense' ||
      original.reversesId !== null ||
      original.reversedById !== null ||
      original.categoryId === null ||
      original.postings.length !== 2 ||
      paid === undefined ||
      spent === undefined ||
      paid.amount.currency !== spent.amount.currency ||
      links.origin ||
      links.settles
    ) {
      throw problem(
        409,
        'not_plain_expense',
        'Only a live expense in one category, in the account’s currency, can be split with people.',
      );
    }
    const total = spent.amount.amountMinor;
    const currency = spent.amount.currency;
    const owed = body.people.reduce((sum, p) => sum + p.amount.amountMinor, 0);
    if (body.people.some((p) => p.amount.currency !== currency))
      throw problem(
        400,
        'currency_mismatch',
        'People owe in the account’s currency.',
      );
    if (owed > total)
      throw problem(
        400,
        'owed_exceeds_total',
        'People owe more than the expense.',
      );
    const own = total - owed;
    const reversalId = await insertReversal(trx, userId, id, undefined, now);
    const created = await createIouIn(
      trx,
      userId,
      {
        direction: 'owed-to-me',
        accountId: paid.accountId,
        people: body.people,
        ...(own === 0
          ? {}
          : {
              ownShare: {
                amount: money(own, currency),
                categoryId: body.categoryId ?? original.categoryId,
              },
            }),
        occurredOn: original.occurredOn,
        ...(original.note === null ? {} : { note: original.note }),
        ...(original.tagIds.length === 0 ? {} : { tagIds: original.tagIds }),
      },
      key,
      'api',
      now,
    );
    return { reversalId, ...created };
  });
  return {
    reversal: await getTransaction(db, userId, done.reversalId),
    transaction: await getTransaction(db, userId, done.id),
    ious: await viewsOf(db, userId, done.ious, now),
    replayed: done.replayed,
  };
}

/** What recording the same request would take, without recording it. */
export async function previewIouCover(
  db: Kysely<DB>,
  userId: string,
  body: CreateIouBody,
  now: Date,
): Promise<CoverPreviewView> {
  if (body.direction !== 'owed-to-me') {
    throw problem(
      400,
      'no_cover_needed',
      'Borrowing brings money in and needs no cover.',
    );
  }
  return db.transaction().execute(async (trx) => {
    const { view } = await loadView(trx, userId);
    const today = await userToday(trx, userId, now);
    const account = userAccountOf(view.chart, body.accountId);
    const currency = view.chart.get(account)?.currency;
    if (currency === undefined)
      throw problem(404, 'account_not_found', 'There is no such account.');
    checkCurrency(body, currency);
    const tagIds = await checkTags(trx, userId, body.tagIds ?? []);
    const chart = withSystemAccounts(view.chart, [currency], now, [
      ...baseSystemRoles,
      'receivables',
    ]);
    const own =
      body.ownShare === undefined
        ? undefined
        : {
            amount: body.ownShare.amount,
            categoryId: categoryId(
              await resolveCategory(
                trx,
                userId,
                body.ownShare.categoryId,
                'expense',
              ),
            ),
          };
    const entry = lend(chart, newEntry(now, body.occurredOn ?? today), {
      accountId: account,
      owed: body.people.map((p) => p.amount),
      ...(own === undefined ? {} : { own }),
    });
    return coverPreviewView({ ...view, chart }, today, entry, tagIds);
  });
}

/**
 * A payment from or to a person without naming an IOU settles their oldest
 * open IOU first (by the day it was recorded), the surplus going to the next.
 * More than they owe is refused.
 */
function oldestFirst(
  byId: ReadonlyMap<string, IouStatus>,
  body: RepaymentBody,
  currency: string,
): { iouId: string; amount: Money }[] {
  const person = (body.person ?? '').toLowerCase();
  const open = [...byId.values()]
    .filter(
      (s) =>
        s.iou.person.toLowerCase() === person &&
        s.iou.direction === body.direction &&
        s.iou.amount.currency === currency &&
        !s.settled,
    )
    .sort(
      (a, b) =>
        a.iou.recordedOn.localeCompare(b.iou.recordedOn) ||
        a.iou.id.localeCompare(b.iou.id),
    );
  let rest = body.amount?.amountMinor ?? 0;
  const lines: { iouId: string; amount: Money }[] = [];
  for (const status of open) {
    if (rest <= 0) break;
    const take = Math.min(rest, status.outstanding.amountMinor);
    lines.push({ iouId: status.iou.id, amount: money(take, currency) });
    rest -= take;
  }
  if (lines.length === 0) {
    throw problem(
      404,
      'iou_not_found',
      `Nothing in ${currency} is open with ${body.person ?? 'that person'}.`,
    );
  }
  if (rest > 0) {
    throw problem(409, 'over_settled', 'That is more than is still owed.');
  }
  return lines;
}

/**
 * Records a payment that settles IOUs, each by the amount named. Money paid
 * back to the user refills what the loan's cover took; money the user pays
 * releases the reserve.
 */
export async function recordRepaymentIn(
  trx: Db,
  userId: string,
  body: RepaymentBody,
  source: IouSource,
  now: Date,
): Promise<{ id: string; ious: string[] }> {
  const { view } = await loadView(trx, userId);
  const account = userAccountOf(view.chart, body.accountId);
  const currency = view.chart.get(account)?.currency;
  if (currency === undefined)
    throw problem(404, 'account_not_found', 'There is no such account.');
  const date = body.occurredOn ?? (await userToday(trx, userId, now));
  const byId = new Map(iouStatuses(view, endOfTime).map((s) => [s.iou.id, s]));
  const settles = body.settles ?? oldestFirst(byId, body, currency);
  const ids = settles.map((s) => s.iouId);
  if (new Set(ids).size !== ids.length) {
    throw problem(400, 'duplicate_iou', 'Name each IOU once.');
  }
  let direction: IouDirection | undefined;
  let total = 0;
  for (const [i, line] of settles.entries()) {
    const status = byId.get(iouId(line.iouId));
    const path = `/settles/${String(i)}`;
    if (status === undefined) {
      throw new RequestProblem(404, 'iou_not_found', 'There is no such IOU.', [
        { path: `${path}/iouId`, message: 'Not found.' },
      ]);
    }
    direction ??= status.iou.direction;
    if (status.iou.direction !== direction) {
      throw problem(
        400,
        'mixed_directions',
        'Settle money owed to you and money you owe in separate entries.',
      );
    }
    if (
      line.amount.currency !== currency ||
      status.iou.amount.currency !== currency
    ) {
      throw new RequestProblem(
        400,
        'currency_mismatch',
        `Give every amount in ${currency}, the account's currency.`,
        [{ path: `${path}/amount`, message: `Use ${currency}.` }],
      );
    }
    if (date < status.iou.recordedOn) {
      throw problem(
        400,
        'before_iou',
        'A payment cannot be dated before the IOU it settles.',
      );
    }
    if (line.amount.amountMinor > status.outstanding.amountMinor) {
      throw new RequestProblem(
        409,
        'over_settled',
        'That is more than is still owed.',
        [{ path: `${path}/amount`, message: 'More than is still owed.' }],
      );
    }
    total += line.amount.amountMinor;
  }
  if (direction === undefined) throw problem(400, 'no_iou', 'Name an IOU.');
  const chart = await ensureSystemAccounts(
    trx,
    userId,
    view.chart,
    [currency],
    now,
    systemRolesFor(direction, false),
  );
  const tagIds = await checkTags(trx, userId, body.tagIds ?? []);
  const transaction = repayment(chart, newEntry(now, date, body.note), {
    accountId: account,
    direction,
    amount: money(total, currency),
  });
  await storeTransaction(trx, userId, transaction, tagIds, null, source);
  await trx
    .insertInto('iou_settlements')
    .values(
      settles.map((line) => ({
        id: randomUUID(),
        user_id: userId,
        iou_id: line.iouId,
        transaction_id: transaction.id,
        kind: 'repayment',
        amount_minor: line.amount.amountMinor,
        currency,
        created_at: now.toISOString(),
      })),
    )
    .execute();
  return { id: transaction.id, ious: ids };
}

export async function recordRepayment(
  db: Kysely<DB>,
  userId: string,
  body: RepaymentBody,
  now: Date,
): Promise<{ transaction: TransactionView; ious: IouView[] }> {
  const done = await db
    .transaction()
    .execute((trx) => recordRepaymentIn(trx, userId, body, 'api', now));
  return {
    transaction: await getTransaction(db, userId, done.id),
    ious: await viewsOf(db, userId, done.ious, now),
  };
}

/**
 * Gives up what a person still owes, once the configured time has passed:
 * the remainder becomes an expense in the chosen category.
 */
export async function writeOffIouIn(
  trx: Db,
  userId: string,
  id: string,
  body: WriteOffBody,
  source: IouSource,
  now: Date,
): Promise<string> {
  const { view } = await loadView(trx, userId);
  const date = body.occurredOn ?? (await userToday(trx, userId, now));
  const found = (view.ious?.ious ?? []).find((i) => i.id === id);
  if (found === undefined) throw notFound();
  const status = iouStatus(view, found, endOfTime);
  if (!status.active) throw notFound();
  if (found.direction !== 'owed-to-me') {
    throw problem(
      409,
      'not_owed_to_you',
      'Only money owed to you can be written off.',
    );
  }
  if (status.settled) {
    throw problem(409, 'iou_settled', 'This IOU is already settled.');
  }
  if (date < found.recordedOn) {
    throw problem(
      400,
      'before_iou',
      'A write-off cannot be dated before the IOU.',
    );
  }
  const remainder = status.outstanding;
  const chart = await ensureSystemAccounts(
    trx,
    userId,
    view.chart,
    [remainder.currency],
    now,
    ['receivables', 'expenses'],
  );
  const category = await resolveCategory(
    trx,
    userId,
    body.categoryId,
    'expense',
  );
  const transaction = writeOffReceivable(
    chart,
    newEntry(now, date, body.note),
    { amount: remainder, categoryId: categoryId(category) },
  );
  await storeTransaction(trx, userId, transaction, [], null, source);
  await trx
    .insertInto('iou_settlements')
    .values({
      id: randomUUID(),
      user_id: userId,
      iou_id: id,
      transaction_id: transaction.id,
      kind: 'write-off',
      amount_minor: remainder.amountMinor,
      currency: remainder.currency,
      created_at: now.toISOString(),
    })
    .execute();
  return transaction.id;
}

export async function writeOffIou(
  db: Kysely<DB>,
  userId: string,
  id: string,
  body: WriteOffBody,
  now: Date,
): Promise<{ transaction: TransactionView; iou: IouView }> {
  const done = await db
    .transaction()
    .execute((trx) => writeOffIouIn(trx, userId, id, body, 'api', now));
  const [iou] = await viewsOf(db, userId, [id], now);
  if (iou === undefined) throw notFound();
  return { transaction: await getTransaction(db, userId, done), iou };
}

/** Corrects a name or sets or clears the due date. */
export async function updateIou(
  db: Kysely<DB>,
  userId: string,
  id: string,
  body: UpdateIouBody,
  now: Date,
): Promise<IouView> {
  const result = await db
    .updateTable('ious')
    .set({
      ...(body.person === undefined ? {} : { person: body.person }),
      ...(body.dueOn === undefined ? {} : { due_on: body.dueOn }),
      updated_at: now.toISOString(),
    })
    .where('user_id', '=', userId)
    .where('id', '=', id)
    .executeTakeFirst();
  if (result.numUpdatedRows === 0n) throw notFound();
  const [iou] = await viewsOf(db, userId, [id], now);
  if (iou === undefined) throw notFound();
  return iou;
}
