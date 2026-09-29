import { randomUUID } from 'node:crypto';
import {
  accountBalances,
  accountId,
  balanceOf,
  budgetGroupsOn,
  budgetSwitch,
  opening,
  totalOn,
  transfer,
  writeOff,
  type AccountId,
  type BudgetGroup,
  type Chart,
  type Transaction,
} from '@allotr/core';
import {
  formatMoney,
  money,
  type AccountListView,
  type AccountView,
  type FigureView,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import { readLedgerSettings } from './ledger-settings.ts';
import { loadRates } from './rates.ts';
import { uniquely } from './sqlite-errors.ts';
import {
  appendTransaction,
  ensureSystemAccounts,
  loadChart,
  loadLedger,
  newEntry,
  userToday,
  type Db,
  type TransactionSource,
} from './store.ts';

// Ledger accounts (FR-L2, FR-L3, FR-L8). Every query is scoped to the user;
// another user's account is reported as not found.

type UserAccountKind = AccountView['kind'];

function notFound(): RequestProblem {
  return new RequestProblem(
    404,
    'account_not_found',
    'There is no such account.',
  );
}

function nameTaken(): RequestProblem {
  return new RequestProblem(
    409,
    'account_name_taken',
    'Another open account already has this name.',
  );
}

type LedgerState = { chart: Chart; ledger: Transaction[]; today: LocalDate };

async function state(db: Db, userId: string, now: Date): Promise<LedgerState> {
  const chart = await loadChart(db, userId);
  return {
    chart,
    ledger: await loadLedger(db, userId, chart),
    today: await userToday(db, userId, now),
  };
}

/**
 * Each account's latest reconciled date. A reconciliation whose adjustment
 * was undone (or edited) no longer counts.
 */
async function lastReconciled(
  db: Db,
  userId: string,
): Promise<Map<string, LocalDate>> {
  const rows = await db
    .selectFrom('reconciliations as r')
    .leftJoin('transactions as undo', (join) =>
      join
        .onRef('undo.reverses_id', '=', 'r.adjustment_transaction_id')
        .onRef('undo.user_id', '=', 'r.user_id'),
    )
    .select(['r.account_id', sql<LocalDate>`max(r.on_date)`.as('on_date')])
    .where('r.user_id', '=', userId)
    .where('undo.id', 'is', null)
    .groupBy('r.account_id')
    .execute();
  return new Map(rows.map((row) => [row.account_id, row.on_date]));
}

async function views(
  db: Db,
  userId: string,
  now: Date,
  filter: { id?: string; includeArchived?: boolean },
): Promise<AccountView[]> {
  let query = db
    .selectFrom('accounts')
    .select(['id', 'name', 'kind', 'currency', 'archived', 'created_at'])
    .where('user_id', '=', userId)
    .where('system_role', 'is', null)
    .orderBy('created_at')
    .orderBy('id');
  if (filter.id !== undefined) query = query.where('id', '=', filter.id);
  if (filter.includeArchived !== true && filter.id === undefined) {
    query = query.where('archived', '=', 0);
  }
  const rows = await query.execute();
  if (rows.length === 0) return [];

  const { chart, ledger, today } = await state(db, userId, now);
  const reconciled = await lastReconciled(db, userId);
  const balances = accountBalances(ledger);
  const groups = budgetGroupsOn(chart, ledger, today);
  return rows.map((row) => {
    const id = accountId(row.id);
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as UserAccountKind,
      currency: row.currency as CurrencyCode,
      budgetGroup: groups.get(id) ?? 'on',
      balance: balances.get(id) ?? money(0, row.currency),
      archived: row.archived === 1,
      createdAt: row.created_at,
      lastReconciledOn: reconciled.get(row.id) ?? null,
    };
  });
}

/**
 * The accounts, and the open ones' balances per budget group in the default
 * currency at today's rates, read in one transaction.
 */
export function listAccounts(
  db: Kysely<DB>,
  userId: string,
  now: Date,
  includeArchived: boolean,
): Promise<AccountListView> {
  return db.transaction().execute(async (trx) => {
    const [accounts, settings, rates, today] = await Promise.all([
      views(trx, userId, now, { includeArchived }),
      readLedgerSettings(trx, userId),
      loadRates(trx, userId),
      userToday(trx, userId, now),
    ]);
    const total = (group: BudgetGroup): FigureView => {
      const figure = totalOn(
        rates,
        accounts
          .filter((a) => !a.archived && a.budgetGroup === group)
          .map((a) => a.balance),
        settings.defaultCurrency,
        today,
      );
      return { amount: figure.amount, missingRates: [...figure.missingRates] };
    };
    return { accounts, totals: { on: total('on'), off: total('off') } };
  });
}

export async function getAccount(
  db: Db,
  userId: string,
  id: string,
  now: Date,
): Promise<AccountView> {
  const [view] = await views(db, userId, now, { id });
  if (view === undefined) throw notFound();
  return view;
}

export type CreateAccount = Readonly<{
  name: string;
  kind: UserAccountKind;
  currency: CurrencyCode;
  budgetGroup: BudgetGroup;
  openingBalance?: Money | undefined;
  openedOn?: LocalDate | undefined;
}>;

/**
 * Inserts an account and its opening entry inside the caller's database
 * transaction.
 */
export async function insertAccount(
  db: Db,
  userId: string,
  input: CreateAccount,
  now: Date,
  source: TransactionSource,
): Promise<string> {
  const { openingBalance } = input;
  if (
    openingBalance !== undefined &&
    openingBalance.currency !== input.currency
  ) {
    throw new RequestProblem(
      400,
      'currency_mismatch',
      `The opening balance must be in ${input.currency}.`,
    );
  }
  const id = randomUUID();
  const at = now.toISOString();
  await uniquely(
    () =>
      db
        .insertInto('accounts')
        .values({
          id,
          user_id: userId,
          name: input.name,
          kind: input.kind,
          system_role: null,
          budget_group: input.budgetGroup,
          currency: input.currency,
          created_at: at,
          updated_at: at,
        })
        .execute(),
    nameTaken,
  );
  if (openingBalance === undefined || openingBalance.amountMinor === 0) {
    return id;
  }
  const chart = await ensureSystemAccounts(
    db,
    userId,
    await loadChart(db, userId),
    [input.currency],
    now,
  );
  const on = input.openedOn ?? (await userToday(db, userId, now));
  const entry = opening(chart, newEntry(now, on), {
    accountId: accountId(id),
    amount: openingBalance,
  });
  await appendTransaction(db, userId, entry, { source });
  return id;
}

export async function createAccount(
  db: Kysely<DB>,
  userId: string,
  input: CreateAccount,
  now: Date,
): Promise<AccountView> {
  const id = await db
    .transaction()
    .execute((trx) => insertAccount(trx, userId, input, now, 'api'));
  return getAccount(db, userId, id, now);
}

async function findOwned(db: Db, userId: string, id: string) {
  const row = await db
    .selectFrom('accounts')
    .select(['id', 'archived', 'currency'])
    .where('user_id', '=', userId)
    .where('id', '=', id)
    .where('system_role', 'is', null)
    .executeTakeFirst();
  if (row === undefined) throw notFound();
  return row;
}

function archivedProblem(): RequestProblem {
  return new RequestProblem(
    409,
    'account_archived',
    'This account is archived.',
  );
}

export type UpdateAccount = Readonly<{
  name?: string | undefined;
  budgetGroup?: BudgetGroup | undefined;
}>;

export async function updateAccount(
  db: Kysely<DB>,
  userId: string,
  id: string,
  input: UpdateAccount,
  now: Date,
): Promise<AccountView> {
  await db.transaction().execute(async (trx) => {
    const row = await findOwned(trx, userId, id);
    if (input.name !== undefined) {
      await uniquely(
        () =>
          trx
            .updateTable('accounts')
            .set({ name: input.name, updated_at: now.toISOString() })
            .where('user_id', '=', userId)
            .where('id', '=', id)
            .execute(),
        nameTaken,
      );
    }
    if (input.budgetGroup === undefined) return;
    if (row.archived === 1) throw archivedProblem();
    const { chart, ledger, today } = await state(trx, userId, now);
    const current = budgetGroupsOn(chart, ledger, today).get(accountId(id));
    if (current === input.budgetGroup) return;
    // Effective today, as a dated system transaction (docs/domain.md
    // "Edge cases").
    const entry = budgetSwitch(chart, ledger, newEntry(now, today), {
      accountId: accountId(id),
      budgetGroup: input.budgetGroup,
    });
    await appendTransaction(trx, userId, entry, { source: 'system' });
  });
  return getAccount(db, userId, id, now);
}

export type Settle =
  | Readonly<{ method: 'transfer'; toAccountId: string }>
  | Readonly<{ method: 'write_off' }>;

// The entry that brings an account's balance to zero.
function settlement(
  chart: Chart,
  from: AccountId,
  balance: Money,
  settle: Settle,
  entry: ReturnType<typeof newEntry>,
): Transaction {
  if (settle.method === 'write_off') {
    return writeOff(chart, entry, { accountId: from, balance });
  }
  const to = accountId(settle.toAccountId);
  const target = chart.get(to);
  if (target === undefined || target.systemRole !== null) throw notFound();
  if (target.archived) throw archivedProblem();
  if (target.currency !== balance.currency) {
    throw new RequestProblem(
      400,
      'currency_mismatch',
      `Transfer the balance to an account in ${balance.currency}.`,
    );
  }
  const positive = balance.amountMinor > 0;
  return transfer(chart, entry, {
    fromId: positive ? from : to,
    toId: positive ? to : from,
    sent: money(Math.abs(balance.amountMinor), balance.currency),
  });
}

/**
 * Archives an account at zero balance (FR-L8). A remaining balance is
 * refused unless `settle` moves it to another account or writes it off in
 * the same database transaction.
 */
export async function archiveAccount(
  db: Kysely<DB>,
  userId: string,
  id: string,
  settle: Settle | undefined,
  now: Date,
): Promise<AccountView> {
  await db.transaction().execute(async (trx) => {
    const row = await findOwned(trx, userId, id);
    if (row.archived === 1) return;
    const { chart, ledger, today } = await state(trx, userId, now);
    const balance = balanceOf(chart, ledger, accountId(id));
    if (balance.amountMinor !== 0) {
      if (settle === undefined) {
        const { locale } = await trx
          .selectFrom('users')
          .select('locale')
          .where('id', '=', userId)
          .executeTakeFirstOrThrow();
        throw new RequestProblem(
          409,
          'account_not_empty',
          `The account still holds ${formatMoney(balance, locale)}. Transfer it to another account in ${balance.currency} or write it off, then archive the account.`,
        );
      }
      const withSystem = await ensureSystemAccounts(
        trx,
        userId,
        chart,
        [balance.currency],
        now,
      );
      const entry = settlement(
        withSystem,
        accountId(id),
        balance,
        settle,
        newEntry(now, today),
      );
      await appendTransaction(trx, userId, entry, { source: 'api' });
    }
    await trx
      .updateTable('accounts')
      .set({ archived: 1, updated_at: now.toISOString() })
      .where('user_id', '=', userId)
      .where('id', '=', id)
      .execute();
  });
  return getAccount(db, userId, id, now);
}
