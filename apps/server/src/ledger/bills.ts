import { randomUUID } from 'node:crypto';
import { billId, transactionId, type Bill } from '@allotr/core';
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
import { userToday, type Db } from './store.ts';

// Bills, only as far as the daily figure needs them (docs/domain.md "Daily
// usable"): each active bill due in the cycle is reserved from the day the
// cycle opens until a payment for that due date. Cadence, reminders and
// payment flows come in M4.

function notFound(): RequestProblem {
  return new RequestProblem(404, 'bill_not_found', 'There is no such bill.');
}

type BillRow = {
  id: string;
  name: string;
  amount_minor: number;
  currency: string;
  account_id: string;
  due_day: number;
  active: number;
  created_at: string;
};

type PaymentRow = {
  bill_id: string;
  due_on: string;
  paid_on: string;
  transaction_id: string | null;
};

async function rowsOf(
  db: Db,
  userId: string,
  filter: { id?: string; activeOnly?: boolean },
): Promise<{ bill: BillRow; payments: PaymentRow[] }[]> {
  let query = db
    .selectFrom('bills')
    .select([
      'id',
      'name',
      'amount_minor',
      'currency',
      'account_id',
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
    .select(['bill_id', 'due_on', 'paid_on', 'transaction_id'])
    .where('user_id', '=', userId)
    .where(
      'bill_id',
      'in',
      bills.map((bill) => bill.id),
    )
    .orderBy('due_on')
    .execute();
  return bills.map((bill) => ({
    bill,
    payments: payments.filter((payment) => payment.bill_id === bill.id),
  }));
}

function toView({
  bill,
  payments,
}: {
  bill: BillRow;
  payments: PaymentRow[];
}): BillView {
  return {
    id: bill.id,
    name: bill.name,
    amount: money(bill.amount_minor, bill.currency),
    accountId: bill.account_id,
    dueDay: bill.due_day,
    active: bill.active === 1,
    payments: payments.map((payment) => ({
      dueOn: localDate(payment.due_on),
      paidOn: localDate(payment.paid_on),
      transactionId: payment.transaction_id,
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
  return (await rowsOf(db, userId, { activeOnly: true })).map(
    ({ bill, payments }) => ({
      id: billId(bill.id),
      amount: money(bill.amount_minor, bill.currency),
      dueDay: bill.due_day,
      payments: payments.map((payment) => ({
        dueOn: localDate(payment.due_on),
        paidOn: localDate(payment.paid_on),
        transactionId:
          payment.transaction_id === null
            ? null
            : transactionId(payment.transaction_id),
      })),
    }),
  );
}

// A bill is paid from an open user account, in that account's currency.
async function checkAccount(
  db: Db,
  userId: string,
  accountId: string,
  amount: Money,
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
}

export type CreateBill = Readonly<{
  name: string;
  amount: Money;
  accountId: string;
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
  await checkAccount(db, userId, input.accountId, input.amount);
  const at = now.toISOString();
  await db
    .insertInto('bills')
    .values({
      id,
      user_id: userId,
      name: input.name,
      amount_minor: input.amount.amountMinor,
      currency: input.amount.currency,
      account_id: input.accountId,
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
  dueDay?: number | undefined;
  accountId?: string | undefined;
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
      .select(['account_id', 'amount_minor', 'currency'])
      .where('user_id', '=', userId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (bill === undefined) throw notFound();
    // The amount and the account must agree on the currency, whichever of
    // the two changes.
    if (patch.amount !== undefined || patch.accountId !== undefined) {
      await checkAccount(
        trx,
        userId,
        patch.accountId ?? bill.account_id,
        patch.amount ?? money(bill.amount_minor, bill.currency),
      );
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
        ...(patch.dueDay === undefined ? {} : { due_day: patch.dueDay }),
        ...(patch.accountId === undefined
          ? {}
          : { account_id: patch.accountId }),
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
    .select('due_day')
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
  try {
    await db
      .insertInto('bill_payments')
      .values({
        id: randomUUID(),
        user_id: userId,
        bill_id: id,
        due_on: input.dueOn,
        paid_on: input.paidOn ?? (await userToday(db, userId, now)),
        transaction_id: input.transactionId ?? null,
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

/** Undoes a payment: the due date is reserved again. */
export async function unpayBill(
  db: Kysely<DB>,
  userId: string,
  id: string,
  dueOn: LocalDate,
): Promise<BillView> {
  const result = await db
    .deleteFrom('bill_payments')
    .where('user_id', '=', userId)
    .where('bill_id', '=', id)
    .where('due_on', '=', dueOn)
    .executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    await getBill(db, userId, id);
    throw new RequestProblem(
      404,
      'payment_not_found',
      `The bill due on ${dueOn} is not marked paid.`,
    );
  }
  return getBill(db, userId, id);
}
