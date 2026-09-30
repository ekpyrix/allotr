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
  /**
   * The latest day the bank's balance matched, directly or after an
   * adjustment that was not undone since.
   */
  lastReconciledOn: localDateSchema.nullable(),
});
export type AccountView = z.infer<typeof accountSchema>;

/** A sum in the default currency, and the currencies it leaves out. */
export const figureSchema = z.object({
  amount: moneySchema,
  /** Currencies without a rate to the default one, left out of `amount`. */
  missingRates: z.array(currencyCodeSchema),
});
export type FigureView = z.infer<typeof figureSchema>;

export const accountListSchema = z.object({
  accounts: z.array(accountSchema),
  /**
   * Open accounts' balances per budget group, in the default currency at
   * today's rates. Savings are never added to the on-budget total.
   */
  totals: z.object({ on: figureSchema, off: figureSchema }),
});
export type AccountListView = z.infer<typeof accountListSchema>;

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
export type CreateAccountBody = z.input<typeof createAccountBodySchema>;

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

/**
 * How much each way of clearing a balance before archiving would lower
 * today's "left today" figure, in the default currency. Negative when it
 * would raise it; zero when the account holds nothing.
 */
export const archiveImpactSchema = z.object({
  /** Today's left-today figure now, before archiving. */
  leftToday: moneySchema,
  writeOff: z.object({
    leftTodayDrop: moneySchema,
    /** Left today once the write-off is recorded. */
    leftTodayAfter: moneySchema,
  }),
  /** One entry per open account in the same currency. */
  transfers: z.array(
    z.object({
      toAccountId: idSchema,
      leftTodayDrop: moneySchema,
      /** Left today once the transfer is recorded. */
      leftTodayAfter: moneySchema,
    }),
  ),
});
export type ArchiveImpactView = z.infer<typeof archiveImpactSchema>;

export const reconcileBodySchema = z
  .object({
    /** The bank's balance at the end of `on`; negative for money owed. */
    balance: moneySchema.optional(),
    /**
     * Instead of `balance`: what a debt's statement shows as owed, a
     * positive amount (negative for a credit). Compared as its negative.
     */
    amountOwed: moneySchema.optional(),
    /** Today when omitted; never later. */
    on: localDateSchema.optional(),
    /** Post the difference as an Unrecorded expense or income. */
    adjust: z.boolean().optional(),
    /**
     * The difference the user saw; the adjustment is refused if it moved,
     * unless it moved to zero, which records a match.
     */
    expectedDifference: moneySchema.optional(),
  })
  .refine(
    (body) => (body.balance === undefined) !== (body.amountOwed === undefined),
    {
      error: 'Give either balance or amountOwed',
      path: ['balance'],
    },
  );
export type ReconcileBody = z.input<typeof reconcileBodySchema>;

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
export type TagView = z.infer<typeof tagSchema>;
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
  /** The copy that brought this entry back after it was undone. */
  restoredById: idSchema.nullable(),
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

/** One category's share of a split expense or income (FR-L5). */
export const splitLineSchema = z.object({
  categoryId: idSchema,
  /** In the foreign price's currency if there is one, else the account's. */
  amount: moneySchema,
});

const spendFields = {
  accountId: idSchema,
  /** In the account's currency. */
  amount: moneySchema,
  /** The entry's category; give this or `lines`. */
  categoryId: idSchema.optional(),
  /**
   * A split across categories instead of `categoryId`: two or more lines
   * with distinct categories that add up to the amount (or foreign price).
   */
  lines: z.array(splitLineSchema).min(2).max(20).optional(),
  /** The price in another currency, recorded as well (FR-X3). */
  foreignAmount: moneySchema.optional(),
  ...entryFields,
};

const oneCategorySide = (body: {
  categoryId?: string | undefined;
  lines?: unknown[] | undefined;
}) => (body.categoryId === undefined) !== (body.lines === undefined);
const oneCategorySideError = {
  error: 'Give either categoryId or lines',
  path: ['categoryId'],
};

export const createTransactionBodySchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('expense'), ...spendFields })
    .refine(oneCategorySide, oneCategorySideError),
  z
    .object({ kind: z.literal('income'), ...spendFields })
    .refine(oneCategorySide, oneCategorySideError),
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
  tagId: idSchema.optional(),
  /**
   * Finds entries whose note contains this text; case is ignored for
   * A–Z only. Undos match through the entry they undo, as with tags.
   */
  q: z.string().trim().min(1).max(100).optional(),
  /**
   * `hide` leaves out undone entries and their undos, as if deleted; the
   * pair nets to zero, so day totals are the same either way.
   */
  undone: z.enum(['show', 'hide']).default('show'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(500).optional(),
});

export const transactionListSchema = z.object({
  transactions: z.array(transactionSchema),
  /** Pass as `cursor` for the next, older page; null on the last one. */
  nextCursor: z.string().nullable(),
  /**
   * For each day on this page, newest first: the net change the day's
   * matching entries (all of them, not only this page's) made to the
   * user's own accounts, or to the filtered account, in the default
   * currency at that day's rate.
   */
  dayTotals: z.array(
    z.object({
      date: localDateSchema,
      net: moneySchema,
      /** Currencies without a rate that day, left out of `net`. */
      missingRates: z.array(currencyCodeSchema),
    }),
  ),
});
export type TransactionListView = z.infer<typeof transactionListSchema>;

// Ledger settings, today's figures, exchange rates and bills (FR-C2,
// FR-C4, FR-C5, FR-X2). Bills are only what the reserve needs until M4.

/**
 * How the next payday is predicted (docs/domain.md "Policies"): a fixed day
 * of the month, the last Monday-to-Friday of the month, or a date the user
 * sets each cycle.
 */
export const paydayRules = ['fixed', 'last-working-day', 'manual'] as const;
export const paydayRuleSchema = z.enum(paydayRules);
export type PaydayRule = z.infer<typeof paydayRuleSchema>;

export const ledgerSettingsSchema = z.object({
  /** BCP 47 locale for formatting, such as `en-US`. */
  locale: z.string(),
  /** IANA time zone that decides the user's calendar day. */
  timeZone: z.string(),
  /** Figures are reported in it; the ledger is never rewritten. */
  defaultCurrency: currencyCodeSchema,
  /** How the next payday is predicted; `fixed` until the user picks another. */
  paydayRule: paydayRuleSchema,
  /**
   * Day of the month that payday falls on; shorter months use their last
   * day. Used by `fixed`, and by `manual` until the date is set.
   */
  paydayDay: z.int().min(1).max(31),
  /** The next payday, when it differs from the predicted one. */
  paydayOverride: localDateSchema.nullable(),
});
export type LedgerSettingsView = z.infer<typeof ledgerSettingsSchema>;

export const updateLedgerSettingsBodySchema = z
  .object({
    locale: z.string().trim().min(2).max(35).optional(),
    timeZone: z.string().trim().min(1).max(64).optional(),
    defaultCurrency: currencyCodeSchema.optional(),
    paydayRule: paydayRuleSchema.optional(),
    paydayDay: z.int().min(1).max(31).optional(),
    /** null clears the override. */
    paydayOverride: localDateSchema.nullable().optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    error: 'Change at least one field',
  });

// Setup after first sign-in (FR-W7): the steps to a first daily number, in
// order. A step is handled once it was saved or skipped.

export const setupSteps = [
  'region',
  'payday',
  'spending',
  'savings',
  'bills',
] as const;
export const setupStepSchema = z.enum(setupSteps);
export type SetupStep = z.infer<typeof setupStepSchema>;

export const setupSchema = z.object({
  /** Setup is over: completed or the rest skipped. */
  finished: z.boolean(),
  /** Steps saved or skipped; resume opens the first step not listed. */
  handled: z
    .array(setupStepSchema)
    .max(setupSteps.length)
    .refine((steps) => new Set(steps).size === steps.length, {
      error: 'List each step once',
    }),
});
export type SetupState = z.infer<typeof setupSchema>;

export const cycleSchema = z.object({
  openedOn: localDateSchema,
  /** The paycheck that opened it; null for the first cycle. */
  openedBy: idSchema.nullable(),
  /** The payday it runs to: the override or the predicted day. */
  payday: localDateSchema,
});

export const todaySchema = z.object({
  /** The user's calendar day. */
  today: localDateSchema,
  cycle: cycleSchema,
  /** The payday, or tomorrow while payday is overdue. */
  cycleEnd: localDateSchema,
  /** Payday has passed without a paycheck. */
  overdue: z.boolean(),
  daysLeft: z.int().min(1),
  /** On-budget money minus unpaid reserved bills, now. */
  available: moneySchema,
  /** On-budget balances now. */
  onBudget: moneySchema,
  /** Unpaid reserved bills now; always exactly `onBudget − available`. */
  reserved: moneySchema,
  /** Available before today's spending. */
  startOfDay: moneySchema,
  spentToday: moneySchema,
  /** The start of the day split over the days left, rounded down. */
  todayAllowance: moneySchema,
  leftToday: moneySchema,
  /** Available now split over the days left, rounded down. */
  liveDaily: moneySchema,
  /** Spending since the cycle opened, today included. */
  cycleSpent: moneySchema,
  /**
   * `cycleSpent` without payments linked to a bill and reconcile
   * adjustments, which still lower `available`: what the pace reads.
   */
  paceSpent: moneySchema,
  /** Unpaid due dates in this cycle on or before today, earliest first. */
  billsDue: z.array(
    z.object({
      billId: idSchema,
      name: z.string(),
      dueOn: localDateSchema,
      /** In the currency of the account it is paid from. */
      amount: moneySchema,
    }),
  ),
  /** Every due date this cycle reserves, paid or not, earliest first. */
  cycleBills: z.array(
    z.object({
      billId: idSchema,
      dueOn: localDateSchema,
      amount: moneySchema,
      /** When it was marked paid; null while it is still reserved. */
      paidOn: localDateSchema.nullable(),
    }),
  ),
  /** Currencies without a rate to the default one, left out of the figures. */
  missingRates: z.array(currencyCodeSchema),
});
export type TodayView = z.infer<typeof todaySchema>;

export const cycleParamSchema = z.object({ openedOn: localDateSchema });

const groupTotalsSchema = z.object({ on: moneySchema, off: moneySchema });

/**
 * A cycle's snapshot (FR-C1), computed from the ledger when read. Amounts
 * are in the default currency at the rate on `lastDay`.
 */
export const cycleSummarySchema = z.object({
  openedOn: localDateSchema,
  /** The paycheck that opened it; null for the first cycle. */
  openedBy: idSchema.nullable(),
  /** The day the next cycle opened; null for the current cycle. */
  closedOn: localDateSchema.nullable(),
  /** The last day it covers: the day before it closed, or today. */
  lastDay: localDateSchema,
  payday: localDateSchema,
  income: moneySchema,
  /** Every entry in an expense category, whichever account paid. */
  spending: moneySchema,
  /** Available budget at the end of `lastDay`. */
  leftover: moneySchema,
  /** Change in the off-budget total over the cycle. */
  savingsNetChange: moneySchema,
  /** The off-budget total at the end of `lastDay`. */
  offBudgetClosing: moneySchema,
  /** An entry dated in it was recorded after it closed. */
  amended: z.boolean(),
  /** Currencies without a rate on `lastDay`, left out of the figures. */
  missingRates: z.array(currencyCodeSchema),
});
export type CycleSummaryView = z.infer<typeof cycleSummarySchema>;

export const cycleListSchema = z.object({
  /** Newest first; the current cycle comes first. */
  cycles: z.array(cycleSummarySchema),
});
export type CycleListView = z.infer<typeof cycleListSchema>;

const categoryTotalSchema = z.object({
  /** A merged category counts as the one it was merged into. */
  categoryId: idSchema.nullable(),
  amount: moneySchema,
});

export const cycleDetailSchema = cycleSummarySchema.extend({
  /** At the end of the day before it opened, plus accounts opened during it. */
  opening: groupTotalsSchema,
  /** At the end of `lastDay`. */
  closing: groupTotalsSchema,
  /** Largest first. */
  incomeByCategory: z.array(categoryTotalSchema),
  spendingByCategory: z.array(categoryTotalSchema),
  /**
   * For charts: the six largest spending categories, and the rest summed
   * into one (null when at most one was left, which is then in `top`).
   */
  spendingTop: z.object({
    top: z.array(categoryTotalSchema),
    other: z
      .object({ count: z.number().int().min(2), amount: moneySchema })
      .nullable(),
  }),
  /** Entries dated in the cycle that were recorded after it closed. */
  amendments: z.array(
    z.object({
      transactionId: idSchema,
      kind: transactionKindSchema,
      occurredOn: localDateSchema,
      recordedAt: z.iso.datetime(),
      note: z.string().nullable(),
    }),
  ),
});
export type CycleDetailView = z.infer<typeof cycleDetailSchema>;

export const cycleDaySchema = z.object({
  date: localDateSchema,
  /** Pace spending dated that day; null after today. */
  spent: moneySchema.nullable(),
  /** Pace spending from the cycle's first day through `date`; null after today. */
  cumulativeSpent: moneySchema.nullable(),
  /** Even-pace cumulative spending by the end of `date`, rounded down. */
  pace: moneySchema,
  /** Available budget at the end of `date`; null after today. */
  availableEnd: moneySchema.nullable(),
  /** That day's allowance as of its start; null after today. */
  allowance: moneySchema.nullable(),
});
export type CycleDayView = z.infer<typeof cycleDaySchema>;

export const cycleDayListSchema = z.object({
  /** From the day the cycle opened to the day before payday, or through today while payday is overdue. */
  days: z.array(cycleDaySchema),
  /** What the pace line spreads: pace spending so far plus what is available. */
  budget: moneySchema,
  /** Currencies without a rate to the default one, left out of the figures. */
  missingRates: z.array(currencyCodeSchema),
});
export type CycleDayListView = z.infer<typeof cycleDayListSchema>;

export const accountHistoryQuerySchema = z.object({
  /** How many days back, today included. */
  days: z.coerce.number().int().min(7).max(365).default(30),
});

export const accountHistorySchema = z.object({
  /** One point per day, oldest first, ending today. */
  points: z.array(
    z.object({
      date: localDateSchema,
      /** End-of-day balance in the account's currency. */
      balance: moneySchema,
    }),
  ),
});
export type AccountHistoryView = z.infer<typeof accountHistorySchema>;

export const exchangeRateSchema = z.object({
  id: idSchema,
  base: currencyCodeSchema,
  quote: currencyCodeSchema,
  /** Units of `quote` one unit of `base` buys. */
  rate: rateSchema,
  /** Used for figures on and after this day, until a later rate. */
  asOf: localDateSchema,
  source: z.enum(['manual']),
  createdAt: z.iso.datetime(),
});
export type ExchangeRateView = z.infer<typeof exchangeRateSchema>;

export const exchangeRateListSchema = z.object({
  rates: z.array(exchangeRateSchema),
});

export const listRatesQuerySchema = z.object({
  /** Rates between these currencies, quoted either way round. */
  currency: currencyCodeSchema.optional(),
});

export const createRateBodySchema = z
  .object({
    base: currencyCodeSchema,
    quote: currencyCodeSchema,
    rate: rateSchema,
    /** Today when omitted. */
    asOf: localDateSchema.optional(),
  })
  .refine((body) => body.base !== body.quote, {
    error: 'The two currencies must differ',
    path: ['quote'],
  });

export const billPaymentSchema = z.object({
  /** The due date this payment settles. */
  dueOn: localDateSchema,
  paidOn: localDateSchema,
  /** The entry that paid it, if one is linked. */
  transactionId: idSchema.nullable(),
});

export const billSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** In the currency of the account it is paid from. */
  amount: moneySchema,
  accountId: idSchema,
  /** Day of the month; shorter months use their last day. */
  dueDay: z.int().min(1).max(31),
  /** Inactive bills are not reserved. */
  active: z.boolean(),
  payments: z.array(billPaymentSchema),
  createdAt: z.iso.datetime(),
});
export type BillView = z.infer<typeof billSchema>;

export const billListSchema = z.object({ bills: z.array(billSchema) });

export const createBillBodySchema = z.object({
  name: nameSchema,
  amount: moneySchema.refine((m) => m.amountMinor > 0, {
    error: 'A bill amount is greater than zero',
  }),
  accountId: idSchema,
  dueDay: z.int().min(1).max(31),
});

export const updateBillBodySchema = z
  .object({
    name: nameSchema.optional(),
    amount: moneySchema
      .refine((m) => m.amountMinor > 0, {
        error: 'A bill amount is greater than zero',
      })
      .optional(),
    dueDay: z.int().min(1).max(31).optional(),
    /** Moves the bill to another open account, in the amount's currency. */
    accountId: idSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    error: 'Change at least one field',
  });

export const createBillPaymentBodySchema = z.object({
  dueOn: localDateSchema,
  /** Today when omitted. */
  paidOn: localDateSchema.optional(),
  transactionId: idSchema.optional(),
});

export const billPaymentParamSchema = z.object({
  id: idSchema,
  dueOn: localDateSchema,
});

export type UpdateLedgerSettingsBody = z.input<
  typeof updateLedgerSettingsBodySchema
>;
export type CreateCategoryBody = z.input<typeof createCategoryBodySchema>;
export type UpdateCategoryBody = z.input<typeof updateCategoryBodySchema>;
export type CreateRateBody = z.input<typeof createRateBodySchema>;
export type CreateBillBody = z.input<typeof createBillBodySchema>;
export type UpdateBillBody = z.input<typeof updateBillBodySchema>;

export const reconcileResultSchema = z.object({
  on: localDateSchema,
  stated: moneySchema,
  /** The ledger's balance at the end of `on`, before any adjustment. */
  ledgerBalance: moneySchema,
  /** stated − ledgerBalance. */
  difference: moneySchema,
  /** False while a difference is left unadjusted; nothing was recorded. */
  reconciled: z.boolean(),
  adjustment: transactionSchema.nullable(),
});
export type ReconcileResultView = z.infer<typeof reconcileResultSchema>;
