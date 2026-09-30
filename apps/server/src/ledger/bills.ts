import { randomUUID } from 'node:crypto';
import {
  billAmount,
  billId,
  transactionId,
  type Bill,
  type BillPayment,
} from '@allotr/core';
import {
  addDays,
  localDate,
  money,
  nextDayOfMonth,
  type BillView,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import { isUniqueViolation } from './sqlite-errors.ts';
import { insertReversal, recordTransaction } from './transactions.ts';
import { userToday, type Db } from './store.ts';

// Bills, only as far as the daily figure needs them (docs/domain.md "Daily
// usable"): each active bill due in the cycle is reserved from the day the
// cycle opens until a payment for that due date. A bill with a price in
// another currency reserves what its latest payment took, and marking it
// paid can record the entry. Cadence and reminders come in M4.

function notFound(): RequestProblem {
  return new RequestProblem(404, 'bill_not_found', 'There is no such bill.');
}

type BillRow = {
  id: string;
  name: string;
  amount_minor: number;
  currency: string;
  price_minor: number | null;
  price_currency: string | null;
  account_id: string;
  category_id: string | null;
  due_day: number;
  active: number;
  created_at: string;
};

type PaymentRow = {
  bill_id: string;
  due_on: string;
  paid_on: string;
  transaction_id: string | null;
  recorded: number;
};

// What a linked entry took from the bill's account, and the foreign price
// it recorded; absent once the entry was undone.
type Taken = { paid: Money | null; price: Money | null };

type Loaded = {
  bill: BillRow;
  payments: (PaymentRow & Taken)[];
};

async function rowsOf(
  db: Db,
  userId: string,
  filter: { id?: string; activeOnly?: boolean },
): Promise<Loaded[]> {
  let query = db
    .selectFrom('bills')
    .select([
      'id',
      'name',
      'amount_minor',
      'currency',
      'price_minor',
      'price_currency',
      'account_id',
      'category_id',
      'due_day',
      'active',
      'created_at',
    ])
    .where('user_id', '=', userId);
  if (filter.id !== undefined) query = query.where('id', '=', filter.id);
  if (filter.activeOnly === true) query = query.where('active', '=', 1);
  const bills = await query.orderBy('due_day').orderBy('name').execute();
  if (bills.length === 0) return [];
  const payments = await db
    .selectFrom('bill_payments')
    .select(['bill_id', 'due_on', 'paid_on', 'transaction_id', 'recorded'])
    .where('user_id', '=', userId)
    .where(
      'bill_id',
      'in',
      bills.map((bill) => bill.id),
    )
    .orderBy('due_on')
    .execute();
  const taken = await takenBy(
    db,
    userId,
    payments.flatMap((p) =>
      p.transaction_id === null ? [] : [p.transaction_id],
    ),
  );
  return bills.map((bill) => ({
    bill,
    payments: payments
      .filter((payment) => payment.bill_id === bill.id)
      .map((payment) => ({
        ...payment,
        ...takenFrom(bill, taken.get(payment.transaction_id ?? '')),
      })),
  }));
}

type Posting = { account_id: string; amount_minor: number; currency: string };

// The postings of linked entries that are still in effect, by entry.
async function takenBy(
  db: Db,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, Posting[]>> {
  const byEntry = new Map<string, Posting[]>();
  if (ids.length === 0) return byEntry;
  const undone = new Set(
    (
      await db
        .selectFrom('transactions')
        .select('reverses_id')
        .where('user_id', '=', userId)
        .where('reverses_id', 'in', ids)
        .execute()
    ).map((row) => row.reverses_id),
  );
  const postings = await db
    .selectFrom('postings')
    .select(['transaction_id', 'account_id', 'amount_minor', 'currency'])
    .where('user_id', '=', userId)
    .where('transaction_id', 'in', ids)
    .execute();
  for (const { transaction_id: id, ...posting } of postings) {
    if (undone.has(id)) continue;
    byEntry.set(id, [...(byEntry.get(id) ?? []), posting]);
  }
  return byEntry;
}

// What an entry took from the bill's account, and the price it recorded in
// the bill's price currency: the category side, which only that side
// posts as a positive amount in that currency.
function takenFrom(bill: BillRow, postings: Posting[] | undefined): Taken {
  if (postings === undefined) return { paid: null, price: null };
  let paid = 0;
  let price = 0;
  for (const posting of postings) {
    if (posting.account_id === bill.account_id) paid -= posting.amount_minor;
    else if (
      posting.currency === bill.price_currency &&
      posting.amount_minor > 0
    ) {
      price += posting.amount_minor;
    }
  }
  return {
    paid: paid > 0 ? money(paid, bill.currency) : null,
    price:
      price > 0 && bill.price_currency !== null
        ? money(price, bill.price_currency)
        : null,
  };
}

function toBill({ bill, payments }: Loaded): Bill {
  return {
    id: billId(bill.id),
    amount: money(bill.amount_minor, bill.currency),
    dueDay: bill.due_day,
    variable: bill.price_minor !== null,
    payments: payments.map((payment): BillPayment => ({
      dueOn: localDate(payment.due_on),
      paidOn: localDate(payment.paid_on),
      transactionId:
        payment.transaction_id === null
          ? null
          : transactionId(payment.transaction_id),
      paid: payment.paid,
    })),
  };
}

function priceOf(
  bill: Pick<BillRow, 'price_minor' | 'price_currency'>,
): Money | null {
  return bill.price_minor === null || bill.price_currency === null
    ? null
    : money(bill.price_minor, bill.price_currency);
}

function toView(loaded: Loaded): BillView {
  const { bill, payments } = loaded;
  // The due date after the latest payment reserves what the bill reserves
  // from now on.
  const latest = payments.at(-1)?.due_on;
  return {
    id: bill.id,
    name: bill.name,
    amount: money(bill.amount_minor, bill.currency),
    price: priceOf(bill),
    reserve: billAmount(
      toBill(loaded),
      addDays(localDate(latest ?? '0001-01-01'), 1),
    ),
    accountId: bill.account_id,
    categoryId: bill.category_id,
    dueDay: bill.due_day,
    active: bill.active === 1,
    payments: payments.map((payment) => ({
      dueOn: localDate(payment.due_on),
      paidOn: localDate(payment.paid_on),
      transactionId: payment.transaction_id,
      recorded: payment.recorded === 1,
      paid: payment.paid,
      price: payment.price,
    })),
    createdAt: bill.created_at,
  };
}

export async function listBills(db: Db, userId: string): Promise<BillView[]> {
  return (await rowsOf(db, userId, {})).map(toView);
}

export async function getBill(
  db: Db,
  userId: string,
  id: string,
): Promise<BillView> {
  const [found] = await rowsOf(db, userId, { id });
  if (found === undefined) throw notFound();
  return toView(found);
}

/** Active bills with their payments, as the projections read them. */
export async function loadBills(db: Db, userId: string): Promise<Bill[]> {
  return (await rowsOf(db, userId, { activeOnly: true })).map(toBill);
}

// A bill is paid from an open user account, in that account's currency; a
// price is in another one.
async function checkAccount(
  db: Db,
  userId: string,
  accountId: string,
  amount: Money,
  price: Money | null,
): Promise<void> {
  const account = await db
    .selectFrom('accounts')
    .select(['currency', 'archived'])
    .where('user_id', '=', userId)
    .where('id', '=', accountId)
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
      'The account is archived. Choose an open account.',
    );
  }
  if (amount.currency !== account.currency) {
    throw new RequestProblem(
      400,
      'currency_mismatch',
      `The amount must be in the account's currency, ${account.currency}.`,
    );
  }
  if (price?.currency === account.currency) {
    throw new RequestProblem(
      400,
      'price_same_currency',
      `The price must be in another currency than the account's, ${account.currency}.`,
    );
  }
}

// A bill's payments are recorded under one of the user's expense categories.
async function checkCategory(
  db: Db,
  userId: string,
  categoryId: string,
): Promise<void> {
  const category = await db
    .selectFrom('categories')
    .select('kind')
    .where('user_id', '=', userId)
    .where('id', '=', categoryId)
    .where('merged_into_id', 'is', null)
    .executeTakeFirst();
  if (category?.kind !== 'expense') {
    throw new RequestProblem(
      400,
      'invalid_category',
      'Choose one of your expense categories.',
    );
  }
}

export type CreateBill = Readonly<{
  name: string;
  amount: Money;
  price?: Money | undefined;
  accountId: string;
  categoryId?: string | undefined;
  dueDay: number;
}>;

/** Inserts a bill inside the caller's database transaction. */
export async function insertBill(
  db: Db,
  userId: string,
  input: CreateBill & { active?: boolean | undefined },
  now: Date,
): Promise<string> {
  const id = randomUUID();
  await checkAccount(
    db,
    userId,
    input.accountId,
    input.amount,
    input.price ?? null,
  );
  if (input.categoryId !== undefined) {
    await checkCategory(db, userId, input.categoryId);
  }
  const at = now.toISOString();
  await db
    .insertInto('bills')
    .values({
      id,
      user_id: userId,
      name: input.name,
      amount_minor: input.amount.amountMinor,
      currency: input.amount.currency,
      price_minor: input.price?.amountMinor ?? null,
      price_currency: input.price?.currency ?? null,
      account_id: input.accountId,
      category_id: input.categoryId ?? null,
      due_day: input.dueDay,
      active: input.active === false ? 0 : 1,
      created_at: at,
      updated_at: at,
    })
    .execute();
  return id;
}

export async function createBill(
  db: Kysely<DB>,
  userId: string,
  input: CreateBill,
  now: Date,
): Promise<BillView> {
  const id = await db
    .transaction()
    .execute((trx) => insertBill(trx, userId, input, now));
  return getBill(db, userId, id);
}

export type UpdateBill = Readonly<{
  name?: string | undefined;
  amount?: Money | undefined;
  price?: Money | null | undefined;
  dueDay?: number | undefined;
  accountId?: string | undefined;
  categoryId?: string | null | undefined;
  active?: boolean | undefined;
}>;

export async function updateBill(
  db: Kysely<DB>,
  userId: string,
  id: string,
  patch: UpdateBill,
  now: Date,
): Promise<BillView> {
  await db.transaction().execute(async (trx) => {
    const bill = await trx
      .selectFrom('bills')
      .select([
        'account_id',
        'amount_minor',
        'currency',
        'price_minor',
        'price_currency',
      ])
      .where('user_id', '=', userId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (bill === undefined) throw notFound();
    // The amount, the price and the account must agree on the currencies,
    // whichever of them changes.
    if (
      patch.amount !== undefined ||
      patch.accountId !== undefined ||
      patch.price !== undefined
    ) {
      await checkAccount(
        trx,
        userId,
        patch.accountId ?? bill.account_id,
        patch.amount ?? money(bill.amount_minor, bill.currency),
        patch.price === undefined ? priceOf(bill) : patch.price,
      );
    }
    if (patch.categoryId !== undefined && patch.categoryId !== null) {
      await checkCategory(trx, userId, patch.categoryId);
    }
    await trx
      .updateTable('bills')
      .set({
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.amount === undefined
          ? {}
          : {
              amount_minor: patch.amount.amountMinor,
              currency: patch.amount.currency,
            }),
        ...(patch.price === undefined
          ? {}
          : {
              price_minor: patch.price?.amountMinor ?? null,
              price_currency: patch.price?.currency ?? null,
            }),
        ...(patch.dueDay === undefined ? {} : { due_day: patch.dueDay }),
        ...(patch.accountId === undefined
          ? {}
          : { account_id: patch.accountId }),
        ...(patch.categoryId === undefined
          ? {}
          : { category_id: patch.categoryId }),
        ...(patch.active === undefined ? {} : { active: patch.active ? 1 : 0 }),
        updated_at: now.toISOString(),
      })
      .where('user_id', '=', userId)
      .where('id', '=', id)
      .execute();
  });
  return getBill(db, userId, id);
}

/** Deletes a bill and its payments; the ledger keeps every entry. */
export async function deleteBill(
  db: Db,
  userId: string,
  id: string,
): Promise<void> {
  const result = await db
    .deleteFrom('bills')
    .where('user_id', '=', userId)
    .where('id', '=', id)
    .executeTakeFirst();
  if (result.numDeletedRows === 0n) throw notFound();
}

export type PayBill = Readonly<{
  dueOn: LocalDate;
  paidOn?: LocalDate | undefined;
  transactionId?: string | undefined;
  /** The linked entry was recorded with the mark (import). */
  recorded?: boolean | undefined;
  /** Records an expense for this amount from the bill's account. */
  paid?: Money | undefined;
  price?: Money | undefined;
  categoryId?: string | undefined;
}>;

/** Marks a due date paid inside the caller's database transaction. */
export async function insertBillPayment(
  db: Db,
  userId: string,
  id: string,
  input: PayBill,
  now: Date,
): Promise<void> {
  const bill = await db
    .selectFrom('bills')
    .select([
      'name',
      'due_day',
      'account_id',
      'currency',
      'price_minor',
      'price_currency',
      'category_id',
    ])
    .where('user_id', '=', userId)
    .where('id', '=', id)
    .executeTakeFirst();
  if (bill === undefined) throw notFound();
  if (nextDayOfMonth(addDays(input.dueOn, -1), bill.due_day) !== input.dueOn) {
    throw new RequestProblem(
      400,
      'not_a_due_date',
      `The bill is not due on ${input.dueOn}; it is due on day ${String(bill.due_day)} of each month.`,
    );
  }
  if (input.transactionId !== undefined) {
    const entry = await db
      .selectFrom('transactions')
      .select('id')
      .where('user_id', '=', userId)
      .where('id', '=', input.transactionId)
      .executeTakeFirst();
    if (entry === undefined) {
      throw new RequestProblem(
        404,
        'transaction_not_found',
        'There is no such entry.',
      );
    }
  }
  const paidOn = input.paidOn ?? (await userToday(db, userId, now));
  const recorded =
    input.paid === undefined
      ? null
      : await recordPayment(
          db,
          userId,
          bill,
          { ...input, paid: input.paid, paidOn },
          now,
        );
  try {
    await db
      .insertInto('bill_payments')
      .values({
        id: randomUUID(),
        user_id: userId,
        bill_id: id,
        due_on: input.dueOn,
        paid_on: paidOn,
        transaction_id: recorded ?? input.transactionId ?? null,
        recorded: recorded !== null || input.recorded === true ? 1 : 0,
        created_at: now.toISOString(),
      })
      .execute();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    throw new RequestProblem(
      409,
      'bill_already_paid',
      `The bill due on ${input.dueOn} is already marked paid.`,
    );
  }
}

// The expense a payment records: what it took from the bill's account, the
// price it paid in the bill's price currency, under the bill's category.
async function recordPayment(
  db: Db,
  userId: string,
  bill: {
    name: string;
    account_id: string;
    currency: string;
    price_minor: number | null;
    price_currency: string | null;
    category_id: string | null;
  },
  input: PayBill & { paid: Money; paidOn: LocalDate },
  now: Date,
): Promise<string> {
  if (input.paid.currency !== bill.currency) {
    throw new RequestProblem(
      400,
      'currency_mismatch',
      `The amount paid must be in the account's currency, ${bill.currency}.`,
    );
  }
  const categoryId = input.categoryId ?? bill.category_id;
  if (categoryId === null) {
    throw new RequestProblem(
      400,
      'category_required',
      'Choose the category to record the payment under.',
    );
  }
  const price = input.price ?? priceOf(bill) ?? undefined;
  return recordTransaction(
    db,
    userId,
    {
      kind: 'expense',
      accountId: bill.account_id,
      amount: input.paid,
      categoryId,
      ...(price === undefined ? {} : { foreignAmount: price }),
      occurredOn: input.paidOn,
      note: bill.name,
    },
    'api',
    now,
  );
}

/** Marks one due date paid, which releases its reserve from `paidOn`. */
export async function payBill(
  db: Kysely<DB>,
  userId: string,
  id: string,
  input: PayBill,
  now: Date,
): Promise<BillView> {
  await db
    .transaction()
    .execute((trx) => insertBillPayment(trx, userId, id, input, now));
  return getBill(db, userId, id);
}

/**
 * Undoes a payment: the due date is reserved again. An entry recorded with
 * the mark is undone too, unless it already was; a linked one stays.
 */
export async function unpayBill(
  db: Kysely<DB>,
  userId: string,
  id: string,
  dueOn: LocalDate,
  now: Date,
): Promise<BillView> {
  await db.transaction().execute(async (trx) => {
    const payment = await trx
      .selectFrom('bill_payments')
      .select(['id', 'transaction_id', 'recorded'])
      .where('user_id', '=', userId)
      .where('bill_id', '=', id)
      .where('due_on', '=', dueOn)
      .executeTakeFirst();
    if (payment === undefined) {
      await getBill(trx, userId, id);
      throw new RequestProblem(
        404,
        'payment_not_found',
        `The bill due on ${dueOn} is not marked paid.`,
      );
    }
    await trx
      .deleteFrom('bill_payments')
      .where('user_id', '=', userId)
      .where('id', '=', payment.id)
      .execute();
    if (payment.recorded === 0 || payment.transaction_id === null) return;
    const undone = await trx
      .selectFrom('transactions')
      .select('id')
      .where('user_id', '=', userId)
      .where('reverses_id', '=', payment.transaction_id)
      .executeTakeFirst();
    if (undone === undefined) {
      await insertReversal(trx, userId, payment.transaction_id, undefined, now);
    }
  });
  return getBill(db, userId, id);
}
