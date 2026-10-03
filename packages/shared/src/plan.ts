import { z } from 'zod';
import { localDateSchema } from './dates.ts';
import { idSchema } from './ledger.ts';
import { currencyCodeSchema, moneySchema } from './money/schemas.ts';
import { budgetStatusSchema } from './budgets.ts';

// Request and response shapes for the payday plan and insights (ADR 0021,
// docs/domain.md "Payday plan and insights").

const missing = z.array(currencyCodeSchema);

export const planLineSchema = z.object({
  /** The budget it changes, or null when it would plan a new one. */
  budgetId: idSchema.nullable(),
  categoryId: idSchema.nullable(),
  tagId: idSchema.nullable(),
  /** What the budget plans this period; zero for a new line. */
  current: moneySchema,
  /** Average spending in the category over past cycles. */
  suggested: moneySchema,
  /** What the sheet fills in: the plan so far, else the suggestion. */
  prefill: moneySchema,
});

export const paydayPlanSchema = z.object({
  today: localDateSchema,
  /** Paychecks that opened or joined the current cycle. */
  income: moneySchema,
  /** The savings line, first in the plan; zero when none is set. */
  savings: moneySchema,
  /** The rest of the paycheck after savings. */
  toPlan: moneySchema,
  lines: z.array(planLineSchema),
  /** Past cycles the suggestions average over; zero means none yet. */
  historyCycles: z.int(),
  missingRates: missing,
});
export type PaydayPlanView = z.infer<typeof paydayPlanSchema>;

export const confirmPlanBodySchema = z.object({
  /** One line per budget to change (`budgetId`) or to plan (`categoryId`). */
  budgets: z
    .array(
      z
        .object({
          budgetId: idSchema.optional(),
          categoryId: idSchema.optional(),
          amount: moneySchema,
        })
        .refine(
          (line) =>
            (line.budgetId === undefined) !== (line.categoryId === undefined),
          {
            error: 'Give either budgetId or categoryId',
            path: ['budgetId'],
          },
        ),
    )
    .max(100),
  /** Moves the savings line into a savings account as a transfer. */
  savings: z
    .object({
      fromAccountId: idSchema,
      toAccountId: idSchema,
      /** The savings line from the plan when omitted. */
      amount: moneySchema.optional(),
    })
    .optional(),
});
export type ConfirmPlanBody = z.output<typeof confirmPlanBodySchema>;

export const confirmPlanResultSchema = z.object({
  /** The transfer entry; null when there was no savings line to move. */
  savingsEntryId: idSchema.nullable(),
  budgets: budgetStatusSchema,
});

export const emergencyFundSchema = z.object({
  /** Average spending per cycle over past cycles; zero without history. */
  monthlyExpenses: moneySchema,
  historyCycles: z.int(),
  months: z.int(),
  target: moneySchema,
  /** The usual range: three and six months of expenses. */
  targetLow: moneySchema,
  targetHigh: moneySchema,
  /** What the accounts that do not count toward the daily number hold. */
  saved: moneySchema,
  /** Saved over target in hundredths of a percent, capped at 10000. */
  progressBasisPoints: z.int(),
  /** Months of expenses the savings cover; null without history. */
  monthsCovered: z.number().nullable(),
  missingRates: missing,
});

export type EmergencyFundView = z.infer<typeof emergencyFundSchema>;

export const netWorthQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(731).optional(),
});

export const netWorthSchema = z.object({
  today: localDateSchema,
  /** Every account, savings included; debts count with their sign. */
  amount: moneySchema,
  /** One point a day, oldest first, ending today. */
  series: z.array(z.object({ date: localDateSchema, amount: moneySchema })),
  missingRates: missing,
});

export type NetWorthView = z.infer<typeof netWorthSchema>;

export const weeklyReviewSchema = z.object({
  /** The seven days ending today. */
  from: localDateSchema,
  to: localDateSchema,
  spent: moneySchema,
  /** The seven days before. */
  previousSpent: moneySchema,
  /** Largest spending categories of the week, biggest first (at most three). */
  topCategories: z.array(
    z.object({ categoryId: idSchema.nullable(), amount: moneySchema }),
  ),
  entries: z.int(),
  leftToday: moneySchema,
  free: moneySchema,
  daysLeft: z.int(),
  /** Budgets whose spending passed what they had this period. */
  overBudget: z.int(),
  /** Shortfall this period that cover paid, and what nothing covered. */
  covered: moneySchema,
  uncovered: moneySchema,
  missingRates: missing,
});
export type WeeklyReviewView = z.infer<typeof weeklyReviewSchema>;
