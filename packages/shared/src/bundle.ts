import { z } from 'zod';
import { localDateSchema } from './dates.ts';
import {
  budgetGroupSchema,
  categoryKindSchema,
  createAccountBodySchema,
} from './ledger.ts';
import {
  currencyCodeSchema,
  moneySchema,
  rateSchema,
} from './money/schemas.ts';

// The import bundle, version 1 (docs/architecture.md "Import bundle"). Items
// refer to each other by name, as a person writes them: account names,
// category paths ("Fun", "Food/Coffee") and tag names. Every object is
// strict, so a later version can add fields without guessing.

export const bundleLimits = { transactions: 50_000, items: 1_000 } as const;

const nameSchema = z.string().trim().min(1).max(100);
const categoryNameSchema = nameSchema.refine((name) => !name.includes('/'), {
  error: 'A category name in a bundle cannot contain "/"',
});
/** "Top" or "Top/Child". */
const categoryPathSchema = z.string().trim().min(1).max(201);
const refSchema = z.string().trim().min(1).max(100);

const settingsSchema = z.strictObject({
  locale: z.string().trim().min(2).max(35).optional(),
  timeZone: z.string().trim().min(1).max(64).optional(),
  defaultCurrency: currencyCodeSchema.optional(),
  paydayDay: z.int().min(1).max(31).optional(),
  paydayOverride: localDateSchema.nullable().optional(),
});

const categorySchema = z.strictObject({
  name: categoryNameSchema,
  /** A top-level category, declared in the bundle or already present. */
  parent: categoryNameSchema.optional(),
  /** Required for a new top-level category; a child takes its parent's. */
  kind: categoryKindSchema.optional(),
  /** New categories default to false; a match keeps its own. */
  isPaycheck: z.boolean().optional(),
});

const accountSchema = z.strictObject({
  ...createAccountBodySchema.shape,
  /** Archived once everything else is in; the balance must then be zero. */
  archived: z.boolean().optional(),
  /**
   * Later moves on or off budget, in order. `budgetGroup` above is the
   * group the account started in.
   */
  switches: z
    .array(
      z.strictObject({ on: localDateSchema, budgetGroup: budgetGroupSchema }),
    )
    .max(bundleLimits.items)
    .optional(),
});

const rateItemSchema = z
  .strictObject({
    base: currencyCodeSchema,
    quote: currencyCodeSchema,
    rate: rateSchema,
    asOf: localDateSchema,
  })
  .refine((rate) => rate.base !== rate.quote, {
    error: 'The two currencies must differ',
    path: ['quote'],
  });

const entryFields = {
  /** Lets a bill payment link to this entry; unique in the bundle. */
  ref: refSchema.optional(),
  occurredOn: localDateSchema,
  note: z.string().trim().min(1).max(500).optional(),
  tags: z.array(nameSchema).max(20).optional(),
};

const spendFields = {
  account: nameSchema,
  /** In the account's currency. */
  amount: moneySchema,
  /** Give this or `lines`. */
  category: categoryPathSchema.optional(),
  /** A split (FR-L5): each line in the category side's currency. */
  lines: z
    .array(
      z.strictObject({ category: categoryPathSchema, amount: moneySchema }),
    )
    .min(2)
    .max(20)
    .optional(),
  foreignAmount: moneySchema.optional(),
  ...entryFields,
};

const oneCategorySide = (entry: {
  category?: string | undefined;
  lines?: unknown[] | undefined;
}) => (entry.category === undefined) !== (entry.lines === undefined);
const oneCategorySideError = {
  error: 'Give either category or lines',
  path: ['category'],
};

const transactionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('write_off'),
    account: nameSchema,
    /** The balance written off to Expenses; negative for a debt. */
    balance: moneySchema.refine((m) => m.amountMinor !== 0, {
      error: 'A write-off is not zero',
    }),
    ...entryFields,
  }),
  z
    .strictObject({ kind: z.literal('expense'), ...spendFields })
    .refine(oneCategorySide, oneCategorySideError),
  z
    .strictObject({ kind: z.literal('income'), ...spendFields })
    .refine(oneCategorySide, oneCategorySideError),
  z.strictObject({
    kind: z.literal('transfer'),
    from: nameSchema,
    to: nameSchema,
    sent: moneySchema,
    received: moneySchema.optional(),
    category: categoryPathSchema.optional(),
    ...entryFields,
  }),
]);

const billSchema = z.strictObject({
  name: nameSchema,
  account: nameSchema,
  amount: moneySchema.refine((m) => m.amountMinor > 0, {
    error: 'A bill amount is greater than zero',
  }),
  dueDay: z.int().min(1).max(31),
  active: z.boolean().default(true),
  payments: z
    .array(
      z.strictObject({
        dueOn: localDateSchema,
        paidOn: localDateSchema,
        /** The `ref` of the entry that paid it. */
        transaction: refSchema.optional(),
      }),
    )
    .max(bundleLimits.items)
    .default([]),
});

const reconciliationSchema = z.strictObject({
  account: nameSchema,
  on: localDateSchema,
  /** The bank's balance, in the account's currency. */
  stated: moneySchema,
  /** The ledger's balance at the end of `on` before any adjustment. */
  computed: moneySchema,
  /** The `ref` of the entry that adjusted the difference. */
  adjustment: refSchema.optional(),
});

function list<T extends z.ZodType>(item: T, max: number = bundleLimits.items) {
  return z.array(item).max(max).default([]);
}

export const bundleSchema = z.strictObject({
  format: z.literal('allotr.bundle'),
  version: z.literal(1),
  settings: settingsSchema.optional(),
  categories: list(categorySchema),
  accounts: list(accountSchema),
  rates: list(rateItemSchema),
  transactions: list(transactionSchema, bundleLimits.transactions),
  bills: list(billSchema),
  reconciliations: list(reconciliationSchema, bundleLimits.transactions),
});
export type Bundle = z.infer<typeof bundleSchema>;
export type BundleTransaction = Bundle['transactions'][number];

export const exportFormatSchema = z.enum(['json', 'csv', 'beancount']);
export type ExportFormat = z.infer<typeof exportFormatSchema>;
export const exportQuerySchema = z.object({
  format: exportFormatSchema.default('json'),
});

export const importResultSchema = z.object({
  accounts: z.int(),
  categoriesCreated: z.int(),
  /** Bundle categories that matched one the user already had. */
  categoriesMatched: z.int(),
  rates: z.int(),
  tags: z.int(),
  transactions: z.int(),
  bills: z.int(),
  billPayments: z.int(),
  reconciliations: z.int(),
});
export type ImportResult = z.infer<typeof importResultSchema>;
