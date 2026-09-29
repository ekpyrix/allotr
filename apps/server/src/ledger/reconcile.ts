import { randomUUID } from 'node:crypto';
import {
  accountId,
  categoryId,
  reconciliation,
  unrecordedAdjustment,
  type CategoryId,
} from '@allotr/core';
import type { LocalDate, Money, ReconcileResultView } from '@allotr/shared';
import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import { getAccount } from './accounts.ts';
import { insertCategory } from './categories.ts';
import {
  appendTransaction,
  ensureSystemAccounts,
  loadChart,
  loadLedger,
  newEntry,
  userToday,
  type Db,
} from './store.ts';
import { getTransaction } from './transactions.ts';

// Reconciling an account against the bank (FR-L9) with the default policy:
// a match is recorded; a difference is only reported until the user asks
// for the one-tap "Unrecorded" adjustment, which is recorded with it.

export type Reconcile = Readonly<{
  balance: Money;
  on?: LocalDate | undefined;
  adjust?: boolean | undefined;
  /** The difference the user saw; an adjustment is refused if it moved. */
  expectedDifference?: Money | undefined;
}>;

// The categories adjustments are filed under, created on first use and
// found again by ID so the user can rename or merge them.
const unrecorded = {
  expense: { key: 'reconcile_expense_category', name: 'Unrecorded' },
  income: { key: 'reconcile_income_category', name: 'Unrecorded income' },
} as const;

type AdjustmentKind = keyof typeof unrecorded;

async function storedCategory(
  db: Db,
  userId: string,
  kind: AdjustmentKind,
): Promise<string | undefined> {
  const setting = await db
    .selectFrom('user_settings')
    .select('value')
    .where('user_id', '=', userId)
    .where('key', '=', unrecorded[kind].key)
    .executeTakeFirst();
  let id: unknown;
  try {
    id = setting === undefined ? undefined : JSON.parse(setting.value);
  } catch {
    return undefined;
  }
  if (typeof id !== 'string') return undefined;
  // A merged category files under the one it was merged into.
  const row = await db
    .selectFrom('categories as c')
    .leftJoin('categories as target', 'target.id', 'c.merged_into_id')
    .select([
      sql<string>`coalesce(target.id, c.id)`.as('id'),
      sql<string>`coalesce(target.kind, c.kind)`.as('kind'),
      sql<number>`coalesce(target.is_paycheck, c.is_paycheck)`.as(
        'is_paycheck',
      ),
    ])
    .where('c.user_id', '=', userId)
    .where('c.id', '=', id)
    .executeTakeFirst();
  // A paycheck line would open a new cycle.
  return row?.kind === kind && row.is_paycheck === 0 ? row.id : undefined;
}

async function adjustmentCategory(
  db: Db,
  userId: string,
  kind: AdjustmentKind,
  now: Date,
): Promise<CategoryId> {
  const stored = await storedCategory(db, userId, kind);
  if (stored !== undefined) return categoryId(stored);

  const { key, name } = unrecorded[kind];
  const same = await db
    .selectFrom('categories')
    .select(['id', 'kind', 'is_paycheck'])
    .where('user_id', '=', userId)
    .where('parent_id', 'is', null)
    .where('merged_into_id', 'is', null)
    .where(sql`lower(name)`, '=', name.toLowerCase())
    .executeTakeFirst();
  if (same !== undefined && (same.kind !== kind || same.is_paycheck === 1)) {
    throw new RequestProblem(
      409,
      'reconcile_category_conflict',
      `Adjustments go to an ${kind} category named “${name}”, but yours is used otherwise. Rename it and try again.`,
    );
  }
  const id =
    same?.id ??
    (await insertCategory(db, userId, { name, kind, isPaycheck: false }, now));
  const value = JSON.stringify(id);
  const at = now.toISOString();
  await db
    .insertInto('user_settings')
    .values({ user_id: userId, key, value, updated_at: at })
    .onConflict((oc) =>
      oc.columns(['user_id', 'key']).doUpdateSet({ value, updated_at: at }),
    )
    .execute();
  return categoryId(id);
}

function stale(): RequestProblem {
  return new RequestProblem(
    409,
    'reconcile_stale',
    'The ledger changed since the check. Check the balance again.',
  );
}

/**
 * Compares the bank's balance with the ledger's at the end of `on` and
 * records a match. With `adjust`, a difference is posted as an Unrecorded
 * expense or income dated `on`, then recorded, in one database transaction.
 */
export async function reconcileAccount(
  db: Kysely<DB>,
  userId: string,
  id: string,
  input: Reconcile,
  now: Date,
): Promise<ReconcileResultView> {
  const result = await db.transaction().execute(async (trx) => {
    // Checks the account exists, is the user's and is not a system account.
    const account = await getAccount(trx, userId, id, now);
    if (account.archived) {
      throw new RequestProblem(
        409,
        'account_archived',
        'This account is archived.',
      );
    }
    const { balance, expectedDifference } = input;
    for (const [path, amount] of [
      ['/balance', balance],
      ['/expectedDifference', expectedDifference],
    ] as const) {
      if (amount !== undefined && amount.currency !== account.currency) {
        throw new RequestProblem(
          400,
          'currency_mismatch',
          `Give the balance in ${account.currency}.`,
          [{ path, message: `Expected ${account.currency}` }],
        );
      }
    }
    const today = await userToday(trx, userId, now);
    const on = input.on ?? today;
    if (on > today) {
      throw new RequestProblem(
        400,
        'future_date',
        'Reconcile against a balance from today or earlier.',
        [{ path: '/on', message: 'After today' }],
      );
    }
    let chart = await loadChart(trx, userId);
    const ledger = await loadLedger(trx, userId, chart);
    const check = reconciliation(chart, ledger, {
      accountId: accountId(id),
      stated: balance,
      on,
    });
    const matched = check.difference.amountMinor === 0;
    if (
      input.adjust === true &&
      expectedDifference !== undefined &&
      expectedDifference.amountMinor !== check.difference.amountMinor
    ) {
      throw stale();
    }
    if (!matched && input.adjust !== true) {
      return { on, check, reconciled: false, adjustmentId: null };
    }

    let adjustmentId: string | null = null;
    if (!matched) {
      chart = await ensureSystemAccounts(
        trx,
        userId,
        chart,
        [balance.currency],
        now,
      );
      const entry = unrecordedAdjustment(chart, newEntry(now, on), {
        accountId: accountId(id),
        difference: check.difference,
        expenseCategoryId: await adjustmentCategory(
          trx,
          userId,
          'expense',
          now,
        ),
        incomeCategoryId: await adjustmentCategory(trx, userId, 'income', now),
      });
      await appendTransaction(trx, userId, entry, { source: 'api' });
      adjustmentId = entry.id;
    }
    await trx
      .insertInto('reconciliations')
      .values({
        id: randomUUID(),
        user_id: userId,
        account_id: id,
        currency: balance.currency,
        on_date: on,
        stated_minor: balance.amountMinor,
        computed_minor: check.ledger.amountMinor,
        adjustment_transaction_id: adjustmentId,
        created_at: now.toISOString(),
      })
      .execute();
    return { on, check, reconciled: true, adjustmentId };
  });

  return {
    on: result.on,
    stated: result.check.stated,
    ledgerBalance: result.check.ledger,
    difference: result.check.difference,
    reconciled: result.reconciled,
    adjustment:
      result.adjustmentId === null
        ? null
        : await getTransaction(db, userId, result.adjustmentId),
  };
}
