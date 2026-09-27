import { z } from 'zod';
import { localDateSchema } from './dates.ts';
import {
  currencyCodeSchema,
  moneySchema,
  rateSchema,
} from './money/schemas.ts';

// Request and response shapes for ledger accounts, categories and tags
// (docs/domain.md "Accounts and double-entry", FR-L2, FR-L3, FR-L7, FR-L8).

export const idSchema = z.string().min(1).max(64);
const nameSchema = z.string().trim().min(1).max(100);

export const budgetGroupSchema = z.enum(['on', 'off']);
export const accountKindSchema = z.enum([
  'asset',
  'liability',
  'receivable',
  'payable',
]);

export const accountSchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: accountKindSchema,
  currency: currencyCodeSchema,
  /** The group it counts toward today. */
  budgetGroup: budgetGroupSchema,
  balance: moneySchema,
  archived: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type AccountView = z.infer<typeof accountSchema>;

export const accountListSchema = z.object({ accounts: z.array(accountSchema) });

export const listAccountsQuerySchema = z.object({
  includeArchived: z.stringbool().optional(),
});

export const createAccountBodySchema = z.object({
  name: nameSchema,
  kind: accountKindSchema.default('asset'),
  currency: currencyCodeSchema,
  budgetGroup: budgetGroupSchema.default('on'),
  /** Posted against Equity:Opening; negative for a debt. */
  openingBalance: moneySchema.optional(),
  /** The opening balance's date; today when omitted. */
  openedOn: localDateSchema.optional(),
});

export const updateAccountBodySchema = z
  .object({
    name: nameSchema.optional(),
    /** Moves the account on or off budget from today. */
    budgetGroup: budgetGroupSchema.optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    error: 'Change at least one field',
  });

export const archiveAccountBodySchema = z.object({
  /** Clears a remaining balance before archiving. */
  settle: z
    .discriminatedUnion('method', [
      z.object({ method: z.literal('transfer'), toAccountId: idSchema }),
      z.object({ method: z.literal('write_off') }),
    ])
    .optional(),
});

export const categoryKindSchema = z.enum(['expense', 'income', 'transfer']);

export const categorySchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: categoryKindSchema,
  parentId: idSchema.nullable(),
  isPaycheck: z.boolean(),
  position: z.int(),
  /** Set once merged; the category then only resolves old entries. */
  mergedIntoId: idSchema.nullable(),
});
export type CategoryView = z.infer<typeof categorySchema>;

export const categoryListSchema = z.object({
  categories: z.array(categorySchema),
});

export const listCategoriesQuerySchema = z.object({
  includeMerged: z.stringbool().optional(),
});

export const createCategoryBodySchema = z.object({
  name: nameSchema,
  /** Required for a top-level category; a subcategory takes its parent's. */
  kind: categoryKindSchema.optional(),
  parentId: idSchema.optional(),
  isPaycheck: z.boolean().default(false),
  position: z.int().min(0).max(10_000).optional(),
});

export const updateCategoryBodySchema = z
  .object({
    name: nameSchema.optional(),
    parentId: idSchema.nullable().optional(),
    isPaycheck: z.boolean().optional(),
    position: z.int().min(0).max(10_000).optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    error: 'Change at least one field',
  });

export const deleteCategoryQuerySchema = z.object({
  /** Required when the category is in use. */
  mergeInto: idSchema.optional(),
});

export const tagSchema = z.object({ id: idSchema, name: z.string() });
export const tagListSchema = z.object({ tags: z.array(tagSchema) });
export const tagBodySchema = z.object({ name: nameSchema });

export const idParamSchema = z.object({ id: idSchema });

// Transactions (FR-L1, FR-L4, FR-X3). Amounts are always money objects in
// minor units; the server builds every entry through core.

export const transactionKindSchema = z.enum([
  'expense',
  'income',
  'transfer',
  'opening',
  'write_off',
  'budget_switch',
  'reversal',
]);

export const postingSchema = z.object({
  accountId: idSchema,
  /** Set for balancing accounts: expenses, income, opening, conversion. */
  systemRole: z
    .enum(['expenses', 'income', 'opening', 'conversion'])
    .nullable(),
  amount: moneySchema,
  categoryId: idSchema.nullable(),
});

export const transactionSchema = z.object({
  id: idSchema,
  kind: transactionKindSchema,
  occurredOn: localDateSchema,
  createdAt: z.iso.datetime(),
  source: z.enum(['api', 'import', 'system']),
  categoryId: idSchema.nullable(),
  note: z.string().nullable(),
  postings: z.array(postingSchema),
  reversesId: idSchema.nullable(),
  /** The undo of this entry, if it was undone. */
  reversedById: idSchema.nullable(),
  /** Units received per unit sent, for cross-currency entries. */
  impliedRate: rateSchema.nullable(),
  budgetSwitch: z
    .object({ accountId: idSchema, budgetGroup: budgetGroupSchema })
    .nullable(),
  tagIds: z.array(idSchema),
});
export type TransactionView = z.infer<typeof transactionSchema>;

const entryFields = {
  /** The entry's date in the user's time zone; today when omitted. */
  occurredOn: localDateSchema.optional(),
  note: z.string().trim().min(1).max(500).optional(),
  tagIds: z.array(idSchema).max(20).optional(),
};

const spendFields = {
  accountId: idSchema,
  /** In the account's currency. */
  amount: moneySchema,
  categoryId: idSchema,
  /** The price in another currency, recorded as well (FR-X3). */
  foreignAmount: moneySchema.optional(),
  ...entryFields,
};

export const createTransactionBodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('expense'), ...spendFields }),
  z.object({ kind: z.literal('income'), ...spendFields }),
  z.object({
    kind: z.literal('transfer'),
    fromAccountId: idSchema,
    toAccountId: idSchema,
    /** In the source account's currency. */
    sent: moneySchema,
    /** In the target account's currency; required when it differs. */
    received: moneySchema.optional(),
    categoryId: idSchema.optional(),
    ...entryFields,
  }),
]);
export type CreateTransactionBody = z.infer<typeof createTransactionBodySchema>;

export const idempotencyHeaderSchema = z.object({
  'idempotency-key': z.string().min(1).max(200).optional(),
});

export const reverseTransactionBodySchema = z.object({
  note: z.string().trim().min(1).max(500).optional(),
});

export const editedTransactionSchema = z.object({
  reversal: transactionSchema,
  replacement: transactionSchema,
});

export const listTransactionsQuerySchema = z.object({
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  accountId: idSchema.optional(),
  /** Includes subcategories and categories merged into it. */
  categoryId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(500).optional(),
});

export const transactionListSchema = z.object({
  transactions: z.array(transactionSchema),
  /** Pass as `cursor` for the next, older page; null on the last one. */
  nextCursor: z.string().nullable(),
});
