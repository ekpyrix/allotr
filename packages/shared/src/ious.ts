import { z } from 'zod';
import { localDateSchema } from './dates.ts';
import { transactionSchema } from './ledger.ts';
import { currencyCodeSchema, moneySchema } from './money/schemas.ts';

// IOUs and split bills (ADR 0024, FR-L6, docs/domain.md "IOUs"). People are
// free-text names; the server builds every entry through core.

const idSchema = z.string().min(1).max(64);
const personSchema = z.string().trim().min(1).max(100);

export const iouDirectionSchema = z.enum(['owed-to-me', 'owed-by-me']);
export type IouDirectionView = z.infer<typeof iouDirectionSchema>;

const positiveMoney = moneySchema.refine((m) => m.amountMinor > 0, {
  error: 'The amount must be greater than zero',
});

export const iouSettlementSchema = z.object({
  id: idSchema,
  /** The entry that settled it. */
  transactionId: idSchema,
  kind: z.enum(['repayment', 'write-off']),
  amount: moneySchema,
  on: localDateSchema,
  /** The entry was undone, so it settles nothing. */
  undone: z.boolean(),
});

export const iouSchema = z.object({
  id: idSchema,
  direction: iouDirectionSchema,
  person: z.string(),
  /** What was lent or borrowed, in its own currency. */
  amount: moneySchema,
  repaid: moneySchema,
  writtenOff: moneySchema,
  /** What is still owed; zero once settled. */
  outstanding: moneySchema,
  settled: z.boolean(),
  /** The entry that lent or borrowed it. */
  originId: idSchema,
  recordedOn: localDateSchema,
  dueOn: localDateSchema.nullable(),
  /** Past its due date and not settled. */
  overdue: z.boolean(),
  daysOverdue: z.int(),
  /** The first day a debt to the user may be written off. */
  writeOffFrom: localDateSchema.nullable(),
  canWriteOff: z.boolean(),
  settlements: z.array(iouSettlementSchema),
});
export type IouView = z.infer<typeof iouSchema>;

export const iouListSchema = z.object({
  ious: z.array(iouSchema),
  /** Outstanding amounts in the default currency. */
  totals: z.object({
    owedToMe: moneySchema,
    owedByMe: moneySchema,
    /** Currencies without a rate to the default one, left out of the totals. */
    missingRates: z.array(currencyCodeSchema),
  }),
});
export type IouListView = z.infer<typeof iouListSchema>;

export const listIousQuerySchema = z.object({
  /** `open` (default): not settled. `settled`: settled ones. `all`. */
  status: z.enum(['open', 'settled', 'all']).default('open'),
  /** Only this person (case-insensitive). */
  person: personSchema.optional(),
});

export const peopleQuerySchema = z.object({
  /** Matches the start of a name, case-insensitive. */
  query: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export const peopleSchema = z.object({
  /** Names used before, most recent first. */
  people: z.array(z.string()),
});

const entryFields = {
  /** The entry's date in the user's time zone; today when omitted. */
  occurredOn: localDateSchema.optional(),
  note: z.string().trim().min(1).max(500).optional(),
  tagIds: z.array(idSchema).max(20).optional(),
};

const personLine = z.object({
  person: personSchema,
  amount: positiveMoney,
  dueOn: localDateSchema.optional(),
});

export const createIouBodySchema = z
  .object({
    /** `owed-to-me` lends money or splits a bill; `owed-by-me` borrows. */
    direction: iouDirectionSchema,
    /** The account that paid (lending) or received (borrowing). */
    accountId: idSchema,
    /** One line per person, in the account's currency. */
    people: z.array(personLine).min(1).max(20),
    /**
     * A split bill: the user's own share, an expense in this category. The
     * account pays the shares together; people's lines are what they owe.
     */
    ownShare: z
      .object({ amount: positiveMoney, categoryId: idSchema })
      .optional(),
    ...entryFields,
  })
  .refine((body) => body.direction === 'owed-to-me' || !body.ownShare, {
    error: 'Only money owed to you can be a split bill',
    path: ['ownShare'],
  });
export type CreateIouBody = z.output<typeof createIouBodySchema>;

export const createdIousSchema = z.object({
  transaction: transactionSchema,
  ious: z.array(iouSchema),
});

export const repaymentBodySchema = z.object({
  /** Where the money arrived, or left. */
  accountId: idSchema,
  /** The IOUs this settles, each with what it takes off. One direction. */
  settles: z
    .array(z.object({ iouId: idSchema, amount: positiveMoney }))
    .min(1)
    .max(20),
  ...entryFields,
});
export type RepaymentBody = z.output<typeof repaymentBodySchema>;

export const settledIousSchema = z.object({
  transaction: transactionSchema,
  ious: z.array(iouSchema),
});

export const writeOffBodySchema = z.object({
  /** The expense category the remainder is recorded under. */
  categoryId: idSchema,
  occurredOn: localDateSchema.optional(),
  note: z.string().trim().min(1).max(500).optional(),
});
export type WriteOffBody = z.output<typeof writeOffBodySchema>;

export const writtenOffIouSchema = z.object({
  transaction: transactionSchema,
  iou: iouSchema,
});

export const updateIouBodySchema = z
  .object({
    person: personSchema.optional(),
    /** null clears it. */
    dueOn: localDateSchema.nullable().optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    error: 'Change at least one field',
  });
export type UpdateIouBody = z.output<typeof updateIouBodySchema>;
