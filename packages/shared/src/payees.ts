import { z } from 'zod';
import { localDateSchema } from './dates.ts';
import { currencyCodeSchema, moneySchema } from './money/schemas.ts';

// Top payees for a period (docs/ui.md §8 item 4): the same period
// parameters as the category report, plus a limit.

export const payeeReportQuerySchema = z.object({
  /** `cycle` (the default) follows paydays; `month` is a calendar month. */
  period: z.enum(['cycle', 'month']).default('cycle'),
  /** For `cycle`: the day the cycle opened. Defaults to the open cycle. */
  cycle: localDateSchema.optional(),
  /** For `month`: `YYYY-MM`. Defaults to the current month. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  /** How many payees to list per currency. */
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

const payeeTotalSchema = z.object({
  /** The note as written most often for this payee. */
  payee: z.string(),
  /** Entries, not postings. */
  count: z.number().int().min(1),
  total: moneySchema,
});

const currencyPayeesSchema = z.object({
  currency: currencyCodeSchema,
  /** Net spending of every entry in the period, named or not, listed or not. */
  total: moneySchema,
  /** Largest total first, then count, then name. */
  payees: z.array(payeeTotalSchema),
  /** Payees with spending that did not fit in `limit`. */
  more: z.number().int().min(0),
  /** Entries without a payee (no note); null when there were none. */
  unnamed: z
    .object({ count: z.number().int().min(1), total: moneySchema })
    .nullable(),
});

/**
 * Top payees for a period, each currency ranked on its own: nothing is
 * converted or added across currencies. Currencies are in code order.
 */
export const payeeReportSchema = z.object({
  period: z.enum(['cycle', 'month']),
  from: localDateSchema,
  to: localDateSchema,
  currencies: z.array(currencyPayeesSchema),
});
export type PayeeReportView = z.infer<typeof payeeReportSchema>;
