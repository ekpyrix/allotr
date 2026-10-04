import {
  addDays,
  lastDayOfMonth,
  localDate,
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type { CategoryId, TransactionId } from '../ledger/types.ts';
import { cycleEndOn, cycleOn, cyclesOf } from './cycles.ts';
import { compareEntries } from '../ledger/order.ts';
import { iouReturns, loanKey } from './ious.ts';
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
  /**
   * The user's cover order: who pays when spending passes what a budget has
   * left, first to last. Free money and budgets not listed, or no longer in
   * use, are placed as `coverOrderOf` says.
   */
  coverOrder?: readonly CoverSource[];
  /**
   * Splits the user chose for an entry's shortfall. A setting on the entry,
   * not a ledger change: the entry itself stays as recorded.
   */
  coverOverrides?: ReadonlyMap<TransactionId, readonly CoverRequest[]>;
  /** Money coming back against earlier entries (a refund or a repayment). */
  returns?: readonly BudgetReturn[];
}>;

/** Where cover comes from: free money, or a budget (the Buffer included). */
export type CoverSource = 'free' | BudgetId;

/** What an entry's shortfall took from one source. */
export type CoverTake = Readonly<{ source: CoverSource; amount: bigint }>;

/** An amount the user wants a source to cover for an entry. */
export type CoverRequest = Readonly<{ source: CoverSource; amount: Money }>;

/**
 * Money that came back against an earlier entry. It restores what that
 * entry's cover took, in reverse order, and the rest goes to free money.
 */
export type BudgetReturn = Readonly<{
  id: string;
  against: TransactionId;
  amount: Money;
  on: LocalDate;
  /** ISO 8601 UTC instant; orders returns made on the same day. */
  at: string;
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
  /**
   * Money lent to people (ADR 0024): covered like spending, but never
   * spending itself, so it is left out of spent figures and reports.
   */
  loan: boolean;
  /** The part its own budget had left, paid from it. */
  own: bigint;
  /** What the shortfall took from each source, in the order taken. */
  covers: readonly CoverTake[];
  /** The shortfall nothing could cover: it lowers the daily number. */
  uncovered: bigint;
  /** The user chose the split of this entry's cover. */
  overridden: boolean;
  /**
   * The part paid out of money a set-aside budget was holding (its own
   * hold, or cover taken from a set-aside budget or the Buffer) rather than
   * out of free money.
   */
  fromHold: bigint;
}>;

export type BudgetPeriodLine = Readonly<{
  budget: Budget;
  /** Planned for the period, in the default currency. */
  amount: bigint;
  /** Left over from earlier periods, when it carries. */
  carriedIn: bigint;
  /** Everything counted toward it, covered or not. */
  spent: bigint;
  /** The part of `spent` that went past what it had left. */
  overflow: bigint;
  /** What other budgets' shortfalls took from it. */
  coveredOut: bigint;
  /** What came back to it as a refill. */
  restored: bigint;
}>;

/** What money coming back did: sources restored, and the rest to free money. */
export type Refill = Readonly<{
  returnId: string;
  restored: readonly CoverTake[];
  toFree: bigint;
}>;

export type BudgetFold = Readonly<{
  currency: CurrencyCode;
  /** The period that holds today. */
  period: BudgetPeriod;
  /** The budgets in use in that period, with their figures so far. */
  lines: readonly BudgetPeriodLine[];
  /** The cover order in that period, first to last. */
  order: readonly CoverSource[];
  /** Every expense line counted, earliest first, in every period. */
  spend: readonly SpendLine[];
  /** Every refill, earliest first, in every period. */
  refills: readonly Refill[];
  /** Spending in the period no budget counts. */
  unbudgeted: bigint;
  missingRates: readonly CurrencyCode[];
}>;

/**
 * What is left: planned, plus carried in and restored, less what it paid
 * itself and what others took from it. Never negative: a shortfall is
 * covered by another source, not carried as the budget's debt.
 */
export function leftOf(line: BudgetPeriodLine): bigint {
  return (
    line.amount +
    line.carriedIn +
    line.restored -
    (line.spent - line.overflow) -
    line.coveredOut
  );
}

/** What a set-aside budget still holds out of free money. */
export function heldBy(line: BudgetPeriodLine): bigint {
  if (line.budget.mode !== 'set-aside') return 0n;
  const left = leftOf(line);
  return left > 0n ? left : 0n;
}

const ordered = compareEntries;

export type CountedSpend = Readonly<{
  entryId: TransactionId;
  date: LocalDate;
  at: string;
  categoryId: CategoryId | null;
  amount: bigint;
  /** Money lent to people, not spending. */
  loan: boolean;
}>;

// The expense lines of every entry that was paid from a counted account and
// not undone, in time order. An undo cancels its entry, so neither counts.
// `excluded` entries, such as a payment of a bill that was already reserved,
// do not count: their money left free money when the cycle opened.
export function countedSpendLines(
  view: LedgerView,
  today: LocalDate,
  excluded: ReadonlySet<TransactionId>,
  missing: Set<CurrencyCode>,
): CountedSpend[] {
  const reversed = new Set(
    view.ledger.flatMap((t) => (t.reversesId === null ? [] : [t.reversesId])),
  );
  const expenses = new Set(
    [...view.chart.values()]
      .filter((a) => a.systemRole === 'expenses')
      .map((a) => a.id),
  );
  const receivables = new Set(
    [...view.chart.values()]
      .filter((a) => a.systemRole === 'receivables')
      .map((a) => a.id),
  );
  const groups = new Map<LocalDate, ReturnType<typeof groupsOn>>();
  const raw: CountedSpend[] = [];
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
    const lent = new Map<CurrencyCode, number>();
    for (const p of t.postings) {
      if (receivables.has(p.accountId) && p.amount.amountMinor > 0) {
        lent.set(
          p.amount.currency,
          (lent.get(p.amount.currency) ?? 0) + p.amount.amountMinor,
        );
      }
    }
    if (lines.length === 0 && lent.size === 0) continue;
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
        at: t.createdAt,
        categoryId: line.categoryId,
        amount: BigInt(converted.amountMinor),
        loan: false,
      });
    }
    for (const [currency, amountMinor] of lent) {
      const converted = convertOn(
        view.rates,
        money(amountMinor, currency),
        view.settings.defaultCurrency,
        today,
      );
      if (converted === null) {
        missing.add(currency);
        continue;
      }
      raw.push({
        entryId: t.id,
        date: t.occurredOn,
        at: t.createdAt,
        categoryId: null,
        amount: BigInt(converted.amountMinor),
        loan: true,
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
 * The cover order for the budgets in use: the user's list without what is
 * gone or repeated, then free money first and the Buffer next if the list
 * leaves them out, then every other budget not listed, in the order planned,
 * so a new budget is the last to be used.
 */
export function coverOrderOf(
  setup: BudgetSetup,
  active: readonly Budget[],
): CoverSource[] {
  const usable = new Set<CoverSource>(['free', ...active.map((b) => b.id)]);
  const order: CoverSource[] = [];
  for (const source of setup.coverOrder ?? []) {
    if (usable.has(source) && !order.includes(source)) order.push(source);
  }
  if (!order.includes('free')) order.unshift('free');
  const buffer = active.find((b) => b.target.kind === 'buffer');
  if (buffer !== undefined && !order.includes(buffer.id)) {
    order.splice(order.indexOf('free') + 1, 0, buffer.id);
  }
  for (const budget of active) {
    if (!order.includes(budget.id)) order.push(budget.id);
  }
  return order;
}

/**
 * What the fold needs from outside the budgets: entries to leave out, and
 * the money in the counted accounts, less unpaid bills, just before an entry
 * (so a cover can tell how much free money there was).
 */
export type FoldEnv = Readonly<{
  excluded?: ReadonlySet<TransactionId>;
  availableBefore?: (entryId: TransactionId) => bigint;
}>;

type Mutable = {
  budget: Budget;
  amount: bigint;
  carriedIn: bigint;
  spent: bigint;
  overflow: bigint;
  coveredOut: bigint;
  restored: bigint;
};

const left = (s: Mutable) => leftOf(s);
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const positive = (a: bigint) => (a > 0n ? a : 0n);

type Take = { source: CoverSource; amount: bigint; refilled: bigint };

/**
 * Folds the ledger into budget figures for every period up to the one that
 * holds `today`. Null when the view has no budgets.
 *
 * Lines are handled in time order. A line takes what its own budget has
 * left; the shortfall is covered in the cover order, each source giving at
 * most what it has (free money: what was free before the entry, less what
 * the entry already cost it), and what nothing covers is `uncovered`, which
 * lowers the daily number. Spending counted by no budget is all shortfall.
 * Money coming back restores what the entry's cover took, in reverse order,
 * and the rest goes to free money. A leftover either returns to free money at
 * the period's end or carries into the next period; carrying one never goes
 * below zero.
 */
export function foldBudgets(
  view: LedgerView,
  today: LocalDate,
  env: FoldEnv = {},
): BudgetFold | null {
  const setup = view.budgets;
  if (setup === undefined || setup.budgets.length === 0) return null;
  const currency = view.settings.defaultCurrency;
  // The Buffer exists from the start, so only the other budgets say when
  // the first period is.
  const since = setup.budgets.reduce(
    (first, b) =>
      b.target.kind !== 'buffer' && b.startedOn < first ? b.startedOn : first,
    today,
  );
  const missing = new Set<CurrencyCode>();
  const raw = countedSpendLines(
    view,
    today,
    env.excluded ?? new Set(),
    missing,
  );
  const periods = budgetPeriods(view, since, today);
  // Repayments of loans refill what the loan's cover took (ADR 0024).
  const returns = [...(setup.returns ?? []), ...iouReturns(view)]
    .filter((r) => r.on <= today)
    .sort(
      (a, b) =>
        a.on.localeCompare(b.on) ||
        a.at.localeCompare(b.at) ||
        a.id.localeCompare(b.id),
    );
  const requests = new Map(
    [...(setup.coverOverrides ?? [])].map(([id, list]) => [
      id,
      list.map((r): { source: CoverSource; amount: bigint } => ({
        source: r.source,
        amount: BigInt(r.amount.amountMinor),
      })),
    ]),
  );

  const spend: SpendLine[] = [];
  const refills: Refill[] = [];
  const takesBy = new Map<TransactionId, Take[]>();
  let carry = new Map<BudgetId, bigint>();
  let lines: BudgetPeriodLine[] = [];
  let order: CoverSource[] = [];
  let unbudgeted = 0n;
  for (const period of periods) {
    const active = setup.budgets.filter(
      (b) =>
        b.target.kind === 'buffer' ||
        (period.to > b.startedOn &&
          (b.endedOn === null || period.from <= b.endedOn)),
    );
    order = coverOrderOf(setup, active);
    const state = new Map<BudgetId, Mutable>(
      active.map((budget) => [
        budget.id,
        {
          budget,
          amount: amountIn(view, budget, period, today, missing),
          carriedIn: carry.get(budget.id) ?? 0n,
          spent: 0n,
          overflow: 0n,
          coveredOut: 0n,
          restored: 0n,
        },
      ]),
    );
    const holds = () =>
      [...state.values()].reduce(
        (sum, s) =>
          s.budget.mode === 'set-aside' ? sum + positive(left(s)) : sum,
        0n,
      );
    unbudgeted = 0n;

    // Spending and money coming back, together, in time order.
    type Event =
      | { kind: 'spend'; date: LocalDate; at: string; line: CountedSpend }
      | { kind: 'return'; date: LocalDate; at: string; ret: BudgetReturn };
    const events: Event[] = [
      ...raw
        .filter((l) => l.date >= period.from && l.date < period.to)
        .map((line): Event => ({
          kind: 'spend',
          date: line.date,
          at: line.at,
          line,
        })),
      ...returns
        .filter((r) => r.on >= period.from && r.on < period.to)
        .map((ret): Event => ({
          kind: 'return',
          date: ret.on,
          at: ret.at,
          ret,
        })),
    ].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.at.localeCompare(b.at) ||
        Number(a.kind === 'return') - Number(b.kind === 'return'),
    );

    const cashOfEntry = new Map<TransactionId, bigint>();
    for (const event of events) {
      if (event.kind === 'return') {
        const { ret } = event;
        let rest = BigInt(ret.amount.amountMinor);
        const restored: CoverTake[] = [];
        for (const take of [...(takesBy.get(ret.against) ?? [])].reverse()) {
          if (take.source === 'free' || rest <= 0n) continue;
          const target = state.get(take.source);
          const give = min(rest, take.amount - take.refilled);
          if (target === undefined || give <= 0n) continue;
          target.restored += give;
          take.refilled += give;
          rest -= give;
          restored.push({ source: take.source, amount: give });
        }
        refills.push({ returnId: ret.id, restored, toFree: rest });
        continue;
      }

      const { line } = event;
      const budget = line.loan
        ? null
        : pick(setup, active, line.entryId, line.categoryId);
      const own = budget === null ? undefined : state.get(budget.id);
      const ownPart =
        own === undefined ? 0n : min(line.amount, positive(left(own)));
      // What was held just before this line, and the cash earlier lines of
      // the same entry already spent.
      const heldBefore = holds();
      const cash = cashOfEntry.get(line.entryId) ?? 0n;
      if (own === undefined) {
        if (!line.loan) unbudgeted += line.amount;
      } else {
        own.spent += line.amount;
        own.overflow += line.amount - ownPart;
      }
      let shortfall = line.amount - ownPart;
      // How much of the line has been paid so far, and how much of that came
      // out of held money. The rest landed on free money.
      let funded = ownPart;
      let fromHold =
        own !== undefined && own.budget.mode === 'set-aside' ? ownPart : 0n;
      // Free money just before this line, less what the line has cost it so
      // far: free money bears what was not paid out of held money.
      const freeCapacity = () => {
        if (env.availableBefore === undefined) return shortfall;
        const free =
          env.availableBefore(line.entryId) -
          cash -
          heldBefore -
          (funded - fromHold);
        return positive(free);
      };
      const taken: CoverTake[] = [];
      const draw = (source: CoverSource, want: bigint) => {
        const wanted = min(want, shortfall);
        if (wanted <= 0n) return;
        const from = source === 'free' ? undefined : state.get(source);
        if (source !== 'free' && (from === undefined || from === own)) return;
        const got = min(
          wanted,
          from === undefined ? freeCapacity() : positive(left(from)),
        );
        if (got <= 0n) return;
        if (from !== undefined) {
          from.coveredOut += got;
          if (from.budget.mode === 'set-aside') fromHold += got;
        }
        shortfall -= got;
        funded += got;
        const before = taken.findIndex((t) => t.source === source);
        const prior = taken[before];
        if (prior === undefined) taken.push({ source, amount: got });
        else taken[before] = { source, amount: prior.amount + got };
      };

      const asked = requests.get(line.entryId);
      for (const request of asked ?? []) {
        // A request is used up across the entry's lines.
        const draw0 = min(request.amount, shortfall);
        const before = shortfall;
        draw(request.source, draw0);
        request.amount -= before - shortfall;
      }
      for (const source of order) draw(source, shortfall);

      // A loan's cover is refilled by its own repayments only, never by a
      // refund of the expense share of the same entry.
      const takeKey = line.loan ? loanKey(line.entryId) : line.entryId;
      const list = takesBy.get(takeKey) ?? [];
      for (const t of taken) list.push({ ...t, refilled: 0n });
      takesBy.set(takeKey, list);
      cashOfEntry.set(line.entryId, cash + line.amount);
      spend.push({
        entryId: line.entryId,
        date: line.date,
        categoryId: line.categoryId,
        amount: line.amount,
        budgetId: budget === null ? null : budget.id,
        loan: line.loan,
        own: ownPart,
        covers: taken,
        uncovered: shortfall,
        overridden: asked !== undefined,
        fromHold,
      });
    }
    lines = [...state.values()];
    carry = new Map(
      lines.map((l) => {
        const rest = leftOf(l);
        return [
          l.budget.id,
          l.budget.leftover === 'carry' && rest > 0n ? rest : 0n,
        ];
      }),
    );
  }
  return {
    currency,
    period: periods.at(-1) ?? budgetPeriodOn(view, today, today),
    lines,
    order,
    spend,
    refills,
    unbudgeted,
    missingRates: [...missing].sort(),
  };
}

/** A bigint total in the default currency. */
export function asMoney(amount: bigint, currency: CurrencyCode): Money {
  return money(Number(amount), currency);
}
