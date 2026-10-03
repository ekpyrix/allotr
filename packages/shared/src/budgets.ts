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
  /**
   * What is left to spend: planned plus carried in and restored, less what
   * the budget paid itself and what other budgets' shortfalls took from it.
   * Never negative.
   */
  left: moneySchema,
  /** The part of `spent` that went past what it had left, so others covered it. */
  overflow: moneySchema,
  /** What other budgets' shortfalls took from it. */
  coveredOut: moneySchema,
  /** What came back to it as a refill. */
  restored: moneySchema,
  /** What a set-aside budget still holds out of free money; zero otherwise. */
  held: moneySchema,
});
export type BudgetView = z.infer<typeof budgetSchema>;

/** Free money, or a budget's ID (the Buffer's included). */
export const coverSourceSchema = z.string().min(1).max(64);

export const coverOrderItemSchema = z.object({
  id: coverSourceSchema,
  name: z.string(),
  kind: z.enum(['free', 'buffer', 'budget']),
});

/** How much of the period's shortfall was covered, and by whom. */
export const coveredSchema = z.object({
  /** Spending past what its own budget had left, or in no budget at all. */
  shortfall: moneySchema,
  fromFree: moneySchema,
  fromBuffer: moneySchema,
  fromBudgets: moneySchema,
  /** What nothing covered: it lowered the daily number. */
  uncovered: moneySchema,
});

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
  /** Who covers a shortfall, first to last. Bills are never used. */
  coverOrder: z.array(coverOrderItemSchema),
  /** Cover in the current period. */
  covered: coveredSchema,
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

export const coverOrderBodySchema = z.object({
  /**
   * `free` and budget IDs, first to last. Anything left out is placed by the
   * default rule: free money first, the Buffer next, then new budgets last.
   */
  order: z.array(coverSourceSchema).min(1).max(200),
});

const coverTakeSchema = z.object({
  source: coverSourceSchema,
  name: z.string(),
  amount: moneySchema,
});

/** One entry's cover, in the default currency. */
export const coverLineSchema = z.object({
  entryId: idSchema,
  date: localDateSchema,
  budgetId: idSchema.nullable(),
  amount: moneySchema,
  /** What its own budget paid. */
  own: moneySchema,
  covers: z.array(coverTakeSchema),
  uncovered: moneySchema,
  /** The user chose this split. */
  overridden: z.boolean(),
});

export const coverListSchema = z.object({
  period: z.object({ from: localDateSchema, to: localDateSchema }),
  covers: z.array(coverLineSchema),
});

export const coverOverrideBodySchema = z.object({
  /**
   * What each source should cover of the entry's shortfall. Each is capped
   * at what the source had; any shortfall left goes down the cover order.
   * Setting it changes no entry.
   */
  covers: z
    .array(z.object({ source: coverSourceSchema, amount: moneySchema }))
    .min(1)
    .max(20),
});
export type CoverOverrideBody = z.output<typeof coverOverrideBodySchema>;

export const coverPreviewBodySchema = z.object({
  /** The account that would pay. */
  accountId: idSchema,
  /** In the account's currency. */
  amount: moneySchema,
  categoryId: idSchema,
  tagIds: z.array(idSchema).max(20).optional(),
  /** Today when omitted. */
  occurredOn: localDateSchema.optional(),
});
export type CoverPreviewBody = z.output<typeof coverPreviewBodySchema>;

export const coverPreviewSchema = z.object({
  /** False when no budget counts it, such as spending from a savings account. */
  counted: z.boolean(),
  budgetId: idSchema.nullable(),
  /** In the default currency. */
  amount: moneySchema,
  /** What its own budget would pay. */
  own: moneySchema,
  covers: z.array(
    coverTakeSchema.extend({
      /** The source is a set-aside budget or the Buffer. */
      setAside: z.boolean(),
    }),
  ),
  /** What nothing would cover: the daily number goes lower. */
  uncovered: moneySchema,
  /** The cover reaches into a set-aside budget or the Buffer. */
  reachesSetAside: z.boolean(),
  overspend: z.boolean(),
  /** Show the cover in a warning colour and ask for a second tap. */
  needsConfirmation: z.boolean(),
  leftToday: z.object({ before: moneySchema, after: moneySchema }),
});
export type CoverPreviewView = z.infer<typeof coverPreviewSchema>;
