import {
  addDays,
  lastDayOfMonth,
  localDate,
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type {
  CategoryId,
  Transaction,
  TransactionId,
} from '../ledger/types.ts';
import { cycleEndOn, cycleOn, cyclesOf } from './cycles.ts';
import { groupsOn } from './pools.ts';
import { convertOn } from './rates.ts';
import type { LedgerView } from './types.ts';

// Budgets (ADR 0021, docs/domain.md "Budgets"): a planned amount per period
// on a category (a parent covers its children) or a tag. They are virtual:
// tied to no account, nothing is moved, no posting is tagged. Spent and left
// come from the entries, folded period by period in time order, so the same
// ledger always gives the same figures and a back-dated entry corrects the
// past through the same function.

declare const brand: unique symbol;
export type BudgetId = string & { readonly [brand]: 'BudgetId' };
export const budgetId = (id: string) => id as BudgetId;
export type TagId = string & { readonly [brand]: 'TagId' };
export const tagId = (id: string) => id as TagId;

export type BudgetTarget =
  | Readonly<{ kind: 'category'; categoryId: CategoryId }>
  | Readonly<{ kind: 'tag'; tagId: TagId }>
  /** The Buffer: no entries count toward it; it only holds money. */
  | Readonly<{ kind: 'buffer' }>;

/** Daily budgets stay in the daily number; set-aside ones are held out. */
export type BudgetMode = 'daily' | 'set-aside';

/** What happens to what is left when a period ends. */
export type BudgetLeftover = 'free' | 'carry';

/**
 * The planned amount from the day it was set; a later one replaces it for
 * the period it was set in and the periods after it.
 */
export type BudgetAmount = Readonly<{
  from: LocalDate;
  amount: Money;
}>;

export type Budget = Readonly<{
  id: BudgetId;
  name: string;
  target: BudgetTarget;
  mode: BudgetMode;
  leftover: BudgetLeftover;
  /** Counts from the period that contains this day; the Buffer, always. */
  startedOn: LocalDate;
  /** Counts until the period that contains this day; null while in use. */
  endedOn: LocalDate | null;
  /** At least one, oldest first. */
  amounts: readonly BudgetAmount[];
}>;

export type CategoryNode = Readonly<{
  parent: CategoryId | null;
  /** A merged category counts as the one it was merged into. */
  mergedInto: CategoryId | null;
}>;

export type BudgetSetup = Readonly<{
  /**
   * In the order that settles ties: when an entry has two tags that both
   * have a budget, the earlier one here wins.
   */
  budgets: readonly Budget[];
  categories: ReadonlyMap<CategoryId, CategoryNode>;
  /** Tags of each entry, which the ledger does not carry. */
  entryTags: ReadonlyMap<TransactionId, readonly TagId[]>;
}>;

/** The days a budget period covers: `from` up to, not including, `to`. */
export type BudgetPeriod = Readonly<{ from: LocalDate; to: LocalDate }>;

/** Periods follow the cycle by default, or calendar months (a setting). */
export type BudgetPeriodRule = 'cycle' | 'month';

/** What the daily number divides (docs/domain.md "Daily usable"). */
export type DailyMode = 'free' | 'pool-minus-bills' | 'daily-budgets';

function monthOf(date: LocalDate): BudgetPeriod {
  return {
    from: localDate(`${date.slice(0, 8)}01`),
    to: addDays(lastDayOfMonth(date), 1),
  };
}

/**
 * The periods from the one that holds `since` through the one that holds
 * `today`, oldest first; the last may run past today.
 */
export function budgetPeriods(
  view: LedgerView,
  since: LocalDate,
  today: LocalDate,
): BudgetPeriod[] {
  if (view.settings.budgetPeriod === 'month') {
    const periods: BudgetPeriod[] = [];
    let period = monthOf(since < today ? since : today);
    for (;;) {
      periods.push(period);
      if (period.to > today) return periods;
      period = monthOf(period.to);
    }
  }
  const cycles = cyclesOf(view, today);
  return cycles.flatMap((cycle, i): BudgetPeriod[] => {
    const next = cycles[i + 1];
    const to = next === undefined ? cycleEndOn(cycle, today) : next.openedOn;
    return to > since ? [{ from: cycle.openedOn, to }] : [];
  });
}

/** The period that holds `date` (as seen from `today`). */
export function budgetPeriodOn(
  view: LedgerView,
  date: LocalDate,
  today: LocalDate,
): BudgetPeriod {
  if (view.settings.budgetPeriod === 'month') return monthOf(date);
  const cycle = cycleOn(cyclesOf(view, today), date);
  return { from: cycle.openedOn, to: cycleEndOn(cycle, today) };
}

/** One expense line, in the default currency, with the budget it counts for. */
export type SpendLine = Readonly<{
  entryId: TransactionId;
  date: LocalDate;
  categoryId: CategoryId | null;
  amount: bigint;
  /** The budget it counts toward, or null. At most one, never two. */
  budgetId: BudgetId | null;
  /** The part paid out of a set-aside budget's hold rather than free money. */
  fromHold: bigint;
}>;

export type BudgetPeriodLine = Readonly<{
  budget: Budget;
  /** Planned for the period, in the default currency. */
  amount: bigint;
  /** Left over from earlier periods, when it carries. */
  carriedIn: bigint;
  spent: bigint;
}>;

export type BudgetFold = Readonly<{
  currency: CurrencyCode;
  /** The period that holds today. */
  period: BudgetPeriod;
  /** The budgets in use in that period, with their figures so far. */
  lines: readonly BudgetPeriodLine[];
  /** Every expense line counted, earliest first, in every period. */
  spend: readonly SpendLine[];
  /** Spending in the period no budget counts. */
  unbudgeted: bigint;
  missingRates: readonly CurrencyCode[];
}>;

/** What is left: planned, plus carried in, less spent. May be negative. */
export function leftOf(line: BudgetPeriodLine): bigint {
  return line.amount + line.carriedIn - line.spent;
}

/** What a set-aside budget still holds out of free money. */
export function heldBy(line: BudgetPeriodLine): bigint {
  if (line.budget.mode !== 'set-aside') return 0n;
  const left = leftOf(line);
  return left > 0n ? left : 0n;
}

function ordered(a: Transaction, b: Transaction): number {
  return (
    a.occurredOn.localeCompare(b.occurredOn) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

type Raw = Readonly<{
  entryId: TransactionId;
  date: LocalDate;
  categoryId: CategoryId | null;
  amount: bigint;
}>;

// The expense lines of every entry that was paid from a counted account and
// not undone, in time order. An undo cancels its entry, so neither counts.
// `excluded` entries, such as a payment of a bill that was already reserved,
// do not count: their money left free money when the cycle opened.
function rawSpend(
  view: LedgerView,
  today: LocalDate,
  excluded: ReadonlySet<TransactionId>,
  missing: Set<CurrencyCode>,
): Raw[] {
  const reversed = new Set(
    view.ledger.flatMap((t) => (t.reversesId === null ? [] : [t.reversesId])),
  );
  const expenses = new Set(
    [...view.chart.values()]
      .filter((a) => a.systemRole === 'expenses')
      .map((a) => a.id),
  );
  const groups = new Map<LocalDate, ReturnType<typeof groupsOn>>();
  const raw: Raw[] = [];
  for (const t of [...view.ledger].sort(ordered)) {
    if (
      t.kind === 'reversal' ||
      reversed.has(t.id) ||
      excluded.has(t.id) ||
      t.occurredOn > today
    ) {
      continue;
    }
    const lines = t.postings.filter(
      (p) => expenses.has(p.accountId) && p.amount.amountMinor > 0,
    );
    if (lines.length === 0) continue;
    let counted = groups.get(t.occurredOn);
    if (counted === undefined) {
      counted = groupsOn(view, t.occurredOn);
      groups.set(t.occurredOn, counted);
    }
    // Budgets count what leaves the counted accounts, as the daily number
    // does; spending from savings is a withdrawal, not budget spending.
    const paid = t.postings.some(
      (p) => counted.get(p.accountId) === 'on' && p.amount.amountMinor < 0,
    );
    if (!paid) continue;
    for (const line of lines) {
      // Converted at the rate of the day asked about, as the daily number
      // is, so the two always agree and a missing rate is flagged the same.
      const converted = convertOn(
        view.rates,
        line.amount,
        view.settings.defaultCurrency,
        today,
      );
      if (converted === null) {
        missing.add(line.amount.currency);
        continue;
      }
      raw.push({
        entryId: t.id,
        date: t.occurredOn,
        categoryId: line.categoryId,
        amount: BigInt(converted.amountMinor),
      });
    }
  }
  return raw;
}

function canonical(
  categories: BudgetSetup['categories'],
  id: CategoryId,
): CategoryId {
  let current = id;
  // Merges form a chain at worst; the bound guards against a bad cycle.
  for (let hops = 0; hops < 8; hops += 1) {
    const next = categories.get(current)?.mergedInto ?? null;
    if (next === null) break;
    current = next;
  }
  return current;
}

/**
 * The budget a line counts toward, if any: a tag budget beats a category
 * budget, and a child category beats its parent.
 */
function pick(
  setup: BudgetSetup,
  active: readonly Budget[],
  entryId: TransactionId,
  categoryId: CategoryId | null,
): Budget | null {
  const tags = new Set(setup.entryTags.get(entryId) ?? []);
  const byTag = active.find(
    (b) => b.target.kind === 'tag' && tags.has(b.target.tagId),
  );
  if (byTag !== undefined) return byTag;
  if (categoryId === null) return null;
  const own = canonical(setup.categories, categoryId);
  const parent = setup.categories.get(own)?.parent ?? null;
  const wanted = [
    own,
    ...(parent === null ? [] : [canonical(setup.categories, parent)]),
  ];
  for (const category of wanted) {
    const found = active.find(
      (b) => b.target.kind === 'category' && b.target.categoryId === category,
    );
    if (found !== undefined) return found;
  }
  return null;
}

function amountIn(
  view: LedgerView,
  budget: Budget,
  period: BudgetPeriod,
  today: LocalDate,
  missing: Set<CurrencyCode>,
): bigint {
  // The last amount set before the period ended, so a change made during a
  // period applies to all of it and never to one that was over.
  const planned = budget.amounts.findLast((a) => a.from < period.to);
  if (planned === undefined || planned.amount.amountMinor === 0) return 0n;
  const converted = convertOn(
    view.rates,
    planned.amount,
    view.settings.defaultCurrency,
    today,
  );
  if (converted === null) {
    missing.add(planned.amount.currency);
    return 0n;
  }
  return BigInt(converted.amountMinor);
}

/**
 * Folds the ledger into budget figures for every period up to the one that
 * holds `today`. Null when the view has no budgets. A budget's leftover
 * either returns to free money at the period's end or carries into the next
 * period; carrying one never goes below zero, as an overspend is not a debt
 * of the budget.
 */
export function foldBudgets(
  view: LedgerView,
  today: LocalDate,
  excluded: ReadonlySet<TransactionId> = new Set(),
): BudgetFold | null {
  const setup = view.budgets;
  if (setup === undefined || setup.budgets.length === 0) return null;
  // The Buffer exists from the start, so only the other budgets say when
  // the first period is.
  const since = setup.budgets.reduce(
    (first, b) =>
      b.target.kind !== 'buffer' && b.startedOn < first ? b.startedOn : first,
    today,
  );
  const missing = new Set<CurrencyCode>();
  const raw = rawSpend(view, today, excluded, missing);
  const periods = budgetPeriods(view, since, today);

  const spend: SpendLine[] = [];
  let carry = new Map<BudgetId, bigint>();
  let lines: BudgetPeriodLine[] = [];
  let unbudgeted = 0n;
  for (const period of periods) {
    const active = setup.budgets.filter(
      (b) =>
        b.target.kind === 'buffer' ||
        (period.to > b.startedOn &&
          (b.endedOn === null || period.from <= b.endedOn)),
    );
    const state = new Map<BudgetId, BudgetPeriodLine>(
      active.map((budget) => [
        budget.id,
        {
          budget,
          amount: amountIn(view, budget, period, today, missing),
          carriedIn: carry.get(budget.id) ?? 0n,
          spent: 0n,
        },
      ]),
    );
    unbudgeted = 0n;
    for (const line of raw) {
      if (line.date < period.from || line.date >= period.to) continue;
      const budget = pick(setup, active, line.entryId, line.categoryId);
      const current = budget === null ? undefined : state.get(budget.id);
      if (budget === null || current === undefined) {
        unbudgeted += line.amount;
        spend.push({ ...line, budgetId: null, fromHold: 0n });
        continue;
      }
      const left = leftOf(current);
      let fromHold = 0n;
      if (budget.mode === 'set-aside' && left > 0n) {
        fromHold = line.amount < left ? line.amount : left;
      }
      state.set(budget.id, { ...current, spent: current.spent + line.amount });
      spend.push({ ...line, budgetId: budget.id, fromHold });
    }
    lines = [...state.values()];
    carry = new Map(
      lines.map((l) => {
        const left = leftOf(l);
        return [
          l.budget.id,
          l.budget.leftover === 'carry' && left > 0n ? left : 0n,
        ];
      }),
    );
  }
  return {
    currency: view.settings.defaultCurrency,
    period: periods.at(-1) ?? budgetPeriodOn(view, today, today),
    lines,
    spend,
    unbudgeted,
    missingRates: [...missing].sort(),
  };
}

/** A bigint total in the default currency. */
export function asMoney(amount: bigint, currency: CurrencyCode): Money {
  return money(Number(amount), currency);
}
