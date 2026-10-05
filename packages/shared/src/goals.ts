import { z } from 'zod';
import { localDateSchema } from './dates.ts';
import { idSchema } from './ledger.ts';
import { moneySchema } from './money/schemas.ts';

// Request and response shapes for savings goals (ADR 0021, docs/domain.md
// "Goals").

const nameSchema = z.string().trim().min(1).max(100);

export const goalSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** The pool the goal is an earmark on; null when it is on one account. */
  poolId: idSchema.nullable(),
  /** The account the goal is an earmark on; null when it is on a pool. */
  accountId: idSchema.nullable(),
  target: moneySchema,
  targetOn: localDateSchema.nullable(),
  archived: z.boolean(),
  /** What the target holds today, in the target's currency. */
  saved: moneySchema,
  /** What is still missing; zero once the goal is reached. */
  remaining: moneySchema,
  reached: z.boolean(),
  /** Currencies in the target that have no rate to the goal's currency. */
  missingRates: z.array(z.string()),
});
export type GoalView = z.infer<typeof goalSchema>;

export const goalListSchema = z.object({ goals: z.array(goalSchema) });
export type GoalListView = z.infer<typeof goalListSchema>;

export const listGoalsQuerySchema = z.object({
  includeArchived: z.stringbool().optional(),
});

export const createGoalBodySchema = z
  .object({
    name: nameSchema,
    /** A savings pool. Give this or `accountId`, not both. */
    poolId: idSchema.optional(),
    /** An account in a savings pool. Give this or `poolId`, not both. */
    accountId: idSchema.optional(),
    target: moneySchema.refine((m) => m.amountMinor > 0, {
      error: 'The target must be more than zero',
    }),
    targetOn: localDateSchema.optional(),
  })
  .refine(
    (body) => (body.poolId === undefined) !== (body.accountId === undefined),
    {
      error: 'Give either a pool or an account',
    },
  );
export type CreateGoalBody = z.input<typeof createGoalBodySchema>;

export const updateGoalBodySchema = z
  .object({
    name: nameSchema.optional(),
    /** In the goal's own currency. */
    targetMinor: z.number().int().positive().optional(),
    /** Null clears the date. */
    targetOn: localDateSchema.nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    error: 'Change at least one field',
  });
export type UpdateGoalBody = z.input<typeof updateGoalBodySchema>;
