import { randomUUID } from 'node:crypto';
import {
  accountId,
  categoryId,
  chartOf,
  restore,
  systemAccountsNeeded,
  transactionId,
  type Account,
  type BudgetGroup,
  type Chart,
  type PostingDraft,
  type SystemRole,
  type Transaction,
  type TransactionKind,
  type UserAccountKind,
} from '@allotr/core';
import {
  currencyCode,
  localDate,
  localDateIn,
  money,
  parseRate,
  type CurrencyCode,
  type LocalDate,
} from '@allotr/shared';
import type { Kysely, Transaction as KyselyTransaction } from 'kysely';
import type { DB } from '../db/schema.ts';

// Persistence for the ledger. Rows are always read and written for one
// user (invariant 7); transactions and postings are only ever inserted
// (invariant 2). Core builds and checks every entry before it gets here.

export type Db = Kysely<DB> | KyselyTransaction<DB>;

export type TransactionSource = 'api' | 'import' | 'system';

const systemAccountKinds = {
  expenses: 'expense',
  income: 'income',
  opening: 'equity',
  conversion: 'equity',
} as const satisfies Record<SystemRole, string>;

const systemAccountNames = {
  expenses: 'Expenses',
  income: 'Income',
  opening: 'Equity:Opening',
  conversion: 'Equity:Conversion',
} as const satisfies Record<SystemRole, string>;

type AccountRow = {
  id: string;
  kind: string;
  system_role: string | null;
  budget_group: string | null;
  currency: string;
  archived: number;
};

function toAccount(row: AccountRow): Account {
  const base = {
    id: accountId(row.id),
    currency: currencyCode(row.currency),
    archived: row.archived === 1,
  };
  if (row.system_role === null) {
    return {
      ...base,
      kind: row.kind as UserAccountKind,
      systemRole: null,
      budgetGroup: row.budget_group as BudgetGroup,
    };
  }
  const role = row.system_role as SystemRole;
  return {
    ...base,
    kind: systemAccountKinds[role],
    systemRole: role,
    budgetGroup: null,
  };
}

export async function loadChart(db: Db, userId: string): Promise<Chart> {
  const rows = await db
    .selectFrom('accounts')
    .select([
      'id',
      'kind',
      'system_role',
      'budget_group',
      'currency',
      'archived',
    ])
    .where('user_id', '=', userId)
    .execute();
  return chartOf(rows.map(toAccount));
}

/** Every committed transaction of a user, rebuilt through core. */
export async function loadLedger(
  db: Db,
  userId: string,
  chart: Chart,
): Promise<Transaction[]> {
  const [transactions, postings] = await Promise.all([
    db
      .selectFrom('transactions')
      .selectAll()
      .where('user_id', '=', userId)
      .execute(),
    db
      .selectFrom('postings')
      .select([
        'transaction_id',
        'account_id',
        'amount_minor',
        'currency',
        'category_id',
      ])
      .where('user_id', '=', userId)
      .orderBy('transaction_id')
      .orderBy('position')
      .execute(),
  ]);
  const legs = new Map<string, PostingDraft[]>();
  for (const row of postings) {
    const list = legs.get(row.transaction_id) ?? [];
    list.push({
      accountId: accountId(row.account_id),
      amount: money(row.amount_minor, row.currency),
      categoryId: row.category_id === null ? null : categoryId(row.category_id),
    });
    legs.set(row.transaction_id, list);
  }
  return transactions.map((row) =>
    restore(chart, {
      meta: {
        id: transactionId(row.id),
        occurredOn: localDate(row.occurred_on),
        createdAt: row.created_at,
        note: row.note,
      },
      kind: row.kind as TransactionKind,
      postings: legs.get(row.id) ?? [],
      categoryId: row.category_id === null ? null : categoryId(row.category_id),
      reversesId:
        row.reverses_id === null ? null : transactionId(row.reverses_id),
      impliedRate:
        row.fx_rate_implied === null ? null : parseRate(row.fx_rate_implied),
      budgetSwitch:
        row.switch_account_id === null
          ? null
          : {
              accountId: accountId(row.switch_account_id),
              budgetGroup: row.switch_budget_group as BudgetGroup,
            },
    }),
  );
}

/**
 * Creates the balancing accounts that entries in these currencies may need
 * and returns the chart including them.
 */
export async function ensureSystemAccounts(
  db: Db,
  userId: string,
  chart: Chart,
  currencies: Iterable<CurrencyCode>,
  now: Date,
): Promise<Chart> {
  const missing = systemAccountsNeeded(chart, currencies);
  if (missing.length === 0) return chart;
  const at = now.toISOString();
  const rows = missing.map(({ role, currency }) => ({
    id: randomUUID(),
    user_id: userId,
    name: `${systemAccountNames[role]}:${currency}`,
    kind: systemAccountKinds[role],
    system_role: role,
    budget_group: null,
    currency,
    created_at: at,
    updated_at: at,
  }));
  await db.insertInto('accounts').values(rows).execute();
  return chartOf([
    ...chart.values(),
    ...rows.map((row) => toAccount({ ...row, archived: 0 })),
  ]);
}

export type AppendOptions = Readonly<{
  source: TransactionSource;
  idempotencyKey?: string | null;
}>;

/** Inserts a committed transaction and its postings. */
export async function appendTransaction(
  db: Db,
  userId: string,
  transaction: Transaction,
  options: AppendOptions,
): Promise<void> {
  await db
    .insertInto('transactions')
    .values({
      id: transaction.id,
      user_id: userId,
      kind: transaction.kind,
      occurred_on: transaction.occurredOn,
      created_at: transaction.createdAt,
      source: options.source,
      category_id: transaction.categoryId,
      note: transaction.note,
      reverses_id: transaction.reversesId,
      idempotency_key: options.idempotencyKey ?? null,
      fx_rate_implied: transaction.impliedRate,
      switch_account_id: transaction.budgetSwitch?.accountId ?? null,
      switch_budget_group: transaction.budgetSwitch?.budgetGroup ?? null,
    })
    .execute();
  if (transaction.postings.length === 0) return;
  await db
    .insertInto('postings')
    .values(
      transaction.postings.map((posting, position) => ({
        id: randomUUID(),
        user_id: userId,
        transaction_id: transaction.id,
        account_id: posting.accountId,
        amount_minor: posting.amount.amountMinor,
        currency: posting.amount.currency,
        category_id: posting.categoryId,
        position,
      })),
    )
    .execute();
}

/** The user's local calendar day at `now` (code-style rule "Dates and time"). */
export async function userToday(
  db: Db,
  userId: string,
  now: Date,
): Promise<LocalDate> {
  const { tz } = await db
    .selectFrom('users')
    .select('tz')
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  return localDateIn(now, tz);
}

export function newTransactionId() {
  return transactionId(randomUUID());
}

/** Metadata for a new entry: a fresh ID and the current instant. */
export function newEntry(
  now: Date,
  occurredOn: LocalDate,
  note?: string | null,
) {
  return {
    id: newTransactionId(),
    occurredOn,
    createdAt: now.toISOString(),
    note: note ?? null,
  };
}
