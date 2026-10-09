import { z } from 'zod';
import { localDateSchema } from './dates.ts';
import { figureSchema, idSchema } from './ledger.ts';

// Request and response shapes for pools (ADR 0021, docs/domain.md "Pools").

const nameSchema = z.string().trim().min(1).max(100);

export const poolKindSchema = z.enum(['spending', 'savings']);
export type PoolKind = z.infer<typeof poolKindSchema>;

export const poolSchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: poolKindSchema,
  /** The pool's own switch. A savings pool also needs `countSavingsInDaily`. */
  countsTowardDaily: z.boolean(),
  /** Whether the pool counts toward the daily number today. */
  counts: z.boolean(),
  /**
   * `on` for Budget and `off` for Savings, the pools that moving an account
   * on or off budget uses; null for pools the user added.
   */
  defaultFor: z.enum(['on', 'off']).nullable(),
  archived: z.boolean(),
  /** Open accounts in the pool today. */
  accountIds: z.array(idSchema),
  /** What the open accounts hold, in the default currency at today's rates. */
  balance: figureSchema,
  /**
   * For a pool that counts toward the daily number: what its open accounts
   * had to work with this cycle (their balance at the end of the day before
   * it opened, plus the income they received since) and hold now, in the
   * default currency at today's rates. `left` exceeds `start` only when
   * money came in other than as income, such as a transfer from savings.
   * Null for pools that do not count, so savings carry no cycle figures.
   */
  cycle: z
    .object({
      start: figureSchema,
      left: figureSchema,
    })
    .nullable(),
});
export type PoolView = z.infer<typeof poolSchema>;

export const poolListSchema = z.object({
  pools: z.array(poolSchema),
  /** The setting that lets a savings pool count; off unless the user turns it on. */
  countSavingsInDaily: z.boolean(),
});
export type PoolListView = z.infer<typeof poolListSchema>;

export const listPoolsQuerySchema = z.object({
  includeArchived: z.stringbool().optional(),
});

export const createPoolBodySchema = z.object({
  name: nameSchema,
  kind: poolKindSchema,
  /** Defaults to on for a spending pool and off for a savings pool. */
  countsTowardDaily: z.boolean().optional(),
});
export type CreatePoolBody = z.input<typeof createPoolBodySchema>;

export const updatePoolBodySchema = z
  .object({
    name: nameSchema.optional(),
    countsTowardDaily: z.boolean().optional(),
    /** Only an empty pool that is not a default one can be archived. */
    archived: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    error: 'Change at least one field',
  });
export type UpdatePoolBody = z.input<typeof updatePoolBodySchema>;

export const moveAccountBodySchema = z.object({
  poolId: idSchema,
  /** The first day the account is in the pool; today when omitted. */
  effectiveOn: localDateSchema.optional(),
});
export type MoveAccountBody = z.output<typeof moveAccountBodySchema>;
