import { z } from 'zod';
import { localDateSchema } from './dates.ts';
import { idSchema } from './ledger.ts';
import { currencyCodeSchema, moneySchema } from './money/schemas.ts';

// Request and response shapes for budgets (ADR 0021, docs/domain.md
// "Budgets").

const nameSchema = z.string().trim().min(1).max(100);

/** What the daily number divides (docs/domain.md "Daily usable"). */
export const dailyModes = [
  'free',
  'pool-minus-bills',
  'daily-budgets',
] as const;
export const dailyModeSchema = z.enum(dailyModes);
export type DailyMode = z.infer<typeof dailyModeSchema>;

/** Budgets follow the cycle by default, or calendar months. */
export const budgetPeriodRuleSchema = z.enum(['cycle', 'month']);
export type BudgetPeriodRule = z.infer<typeof budgetPeriodRuleSchema>;

export const budgetModeSchema = z.enum(['daily', 'set-aside']);
export const budgetLeftoverSchema = z.enum(['free', 'carry']);

export const budgetTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('category'), categoryId: idSchema }),
  z.object({ kind: z.literal('tag'), tagId: idSchema }),
  /** The Buffer: no entries count toward it; it only holds money. */
  z.object({ kind: z.literal('buffer') }),
]);

/** One budget's definition, and its figures for the current period. */
export const budgetSchema = z.object({
  id: idSchema,
  name: z.string(),
  target: budgetTargetSchema,
  /** Daily budgets stay in the daily number; set-aside ones are held out of it. */
  mode: budgetModeSchema,
  /** What happens to what is left at the end of a period. */
  leftover: budgetLeftoverSchema,
  startedOn: localDateSchema,
  /** The planned amount in force for the current period, in its own currency. */
  amount: moneySchema,
  /** The same in the default currency; zero when no rate is known. */
  planned: moneySchema,
  /** Left over from earlier periods, when the budget carries. */
  carriedIn: moneySchema,
  spent: moneySchema,
  /** Planned plus carried in, less spent. Negative when overspent. */
  left: moneySchema,
  /** What a set-aside budget still holds out of free money; zero otherwise. */
  held: moneySchema,
});
export type BudgetView = z.infer<typeof budgetSchema>;

export const budgetStatusSchema = z.object({
  today: localDateSchema,
  /** The period the figures are for: `from` up to, not including, `to`. */
  period: z.object({ from: localDateSchema, to: localDateSchema }),
  periodRule: budgetPeriodRuleSchema,
  daysLeft: z.int(),
  budgets: z.array(budgetSchema),
  /** Counted accounts less unpaid reserved bills. */
  available: moneySchema,
  /** Set-aside budgets' holds, Buffer included. */
  held: moneySchema,
  /** `available` less `held`. */
  free: moneySchema,
  /** What the daily budgets have left in total. */
  dailyLeft: moneySchema,
  /** Spending in the period that no budget counts. */
  unbudgeted: moneySchema,
  dailyMode: dailyModeSchema,
  /** The daily number: what `dailyMode` divides, over the days left. */
  dailyNumber: moneySchema,
  missingRates: z.array(currencyCodeSchema),
});
export type BudgetStatusView = z.infer<typeof budgetStatusSchema>;

export const createBudgetBodySchema = z.object({
  name: nameSchema,
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('category'), categoryId: idSchema }),
    z.object({ kind: z.literal('tag'), tagId: idSchema }),
  ]),
  /** Per period, in the default currency. */
  amount: moneySchema,
  /** Daily when omitted. */
  mode: budgetModeSchema.optional(),
  /** Return to free money for a daily budget, carry over for a set-aside one. */
  leftover: budgetLeftoverSchema.optional(),
});
export type CreateBudgetBody = z.output<typeof createBudgetBodySchema>;

export const updateBudgetBodySchema = z
  .object({
    name: nameSchema.optional(),
    /** Applies from the current period; earlier periods keep theirs. */
    amount: moneySchema.optional(),
    mode: budgetModeSchema.optional(),
    leftover: budgetLeftoverSchema.optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    error: 'Change at least one field',
  });
export type UpdateBudgetBody = z.output<typeof updateBudgetBodySchema>;
