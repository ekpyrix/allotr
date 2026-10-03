import {
  accountId,
  cyclesOf,
  emergencyFund,
  netWorthOn,
  netWorthSeries,
  paydayPlan,
  savingsLine,
  weeklyReview,
} from '@allotr/core';
import {
  addDays,
  money,
  type ConfirmPlanBody,
  type PaydayPlanView,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import { budgetStatusView, createBudget, updateBudget } from './budgets.ts';
import { userToday } from './store.ts';
import { createTransaction } from './transactions.ts';
import { loadView } from './today.ts';

// The payday plan and insights (ADR 0021): computed by core from the ledger
// and settings on every read. Confirming the plan only writes budget amounts
// and, when asked, one savings transfer.

async function read(db: Kysely<DB>, userId: string, now: Date) {
  return db.transaction().execute(async (trx) => {
    const { view } = await loadView(trx, userId);
    return { view, today: await userToday(trx, userId, now) };
  });
}

export async function getPaydayPlan(
  db: Kysely<DB>,
  userId: string,
  now: Date,
): Promise<PaydayPlanView> {
  const { view, today } = await read(db, userId, now);
  const plan = paydayPlan(view, today);
  return {
    ...plan,
    lines: [...plan.lines],
    missingRates: [...plan.missingRates],
  };
}

/**
 * Applies the payday sheet: budget amounts first, then the savings line as a
 * transfer. Everything is checked before anything is written. The transfer
 * carries an idempotency key for the cycle, so a second tap records nothing.
 */
export async function confirmPaydayPlan(
  db: Kysely<DB>,
  userId: string,
  body: ConfirmPlanBody,
  now: Date,
) {
  const { view, today } = await read(db, userId, now);
  const currency = view.settings.defaultCurrency;
  body.budgets.forEach((line, i) => {
    if (line.amount.currency !== currency || line.amount.amountMinor <= 0) {
      throw new RequestProblem(
        400,
        'invalid_amount',
        `Plan each budget in ${currency}, with more than zero.`,
        [{ path: `/budgets/${String(i)}/amount`, message: 'Not allowed.' }],
      );
    }
  });
  const plan = paydayPlan(view, today);
  let transfer: { from: string; to: string; amount: number } | null = null;
  if (body.savings !== undefined) {
    const amount =
      body.savings.amount ??
      savingsLine(view.settings.payYourselfFirst, plan.income);
    for (const id of [body.savings.fromAccountId, body.savings.toAccountId]) {
      const account = [...view.chart.values()].find((a) => a.id === id);
      if (account === undefined || account.systemRole !== null) {
        throw new RequestProblem(
          404,
          'account_not_found',
          'There is no such account.',
        );
      }
    }
    if (amount.amountMinor > 0) {
      transfer = {
        from: body.savings.fromAccountId,
        to: body.savings.toAccountId,
        amount: amount.amountMinor,
      };
      const from = view.chart.get(accountId(body.savings.fromAccountId));
      if (from !== undefined && from.currency !== amount.currency) {
        throw new RequestProblem(
          400,
          'currency_mismatch',
          `Give the savings amount in ${from.currency}, the source account's currency.`,
        );
      }
    }
  }

  for (const line of body.budgets) {
    if (line.budgetId !== undefined) {
      await updateBudget(
        db,
        userId,
        line.budgetId,
        { amount: line.amount },
        now,
      );
    } else if (line.categoryId !== undefined) {
      await createBudget(
        db,
        userId,
        {
          name: await categoryName(db, userId, line.categoryId),
          target: { kind: 'category', categoryId: line.categoryId },
          amount: line.amount,
        },
        now,
      );
    }
  }
  let savingsEntryId: string | null = null;
  if (transfer !== null && body.savings !== undefined) {
    const cycle = cyclesOf(view, today).at(-1);
    const sent = money(
      transfer.amount,
      view.chart.get(accountId(body.savings.fromAccountId))?.currency ??
        currency,
    );
    const { transaction } = await createTransaction(
      db,
      userId,
      {
        kind: 'transfer',
        fromAccountId: transfer.from,
        toAccountId: transfer.to,
        sent,
        occurredOn: today,
      },
      `payday-plan:${cycle?.openedOn ?? today}`,
      now,
    );
    savingsEntryId = transaction.id;
  }
  return {
    savingsEntryId,
    budgets: await budgetStatusView(db, userId, now),
  };
}

async function categoryName(db: Kysely<DB>, userId: string, id: string) {
  const row = await db
    .selectFrom('categories')
    .select(['name', 'kind'])
    .where('user_id', '=', userId)
    .where('id', '=', id)
    .executeTakeFirst();
  if (row === undefined) {
    throw new RequestProblem(
      404,
      'category_not_found',
      'There is no such category.',
    );
  }
  return row.name;
}

export async function getEmergencyFund(
  db: Kysely<DB>,
  userId: string,
  now: Date,
) {
  const { view, today } = await read(db, userId, now);
  const fund = emergencyFund(view, today);
  return { ...fund, missingRates: [...fund.missingRates] };
}

export async function getNetWorth(
  db: Kysely<DB>,
  userId: string,
  days: number,
  now: Date,
) {
  const { view, today } = await read(db, userId, now);
  const now_ = netWorthOn(view, today);
  const series = netWorthSeries(view, addDays(today, -(days - 1)), today);
  return {
    today,
    amount: now_.amount,
    series: series.points,
    missingRates: [
      ...new Set([...now_.missingRates, ...series.missingRates]),
    ].sort(),
  };
}

export async function getWeeklyReview(
  db: Kysely<DB>,
  userId: string,
  now: Date,
) {
  const { view, today } = await read(db, userId, now);
  const review = weeklyReview(view, today);
  return {
    ...review,
    topCategories: [...review.topCategories],
    missingRates: [...review.missingRates],
  };
}
