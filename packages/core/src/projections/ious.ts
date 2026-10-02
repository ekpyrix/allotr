import {
  addDays,
  daysBetween,
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type { IouDirection } from '../ledger/ious.ts';
import type { Transaction, TransactionId } from '../ledger/types.ts';
import type { BudgetReturn } from './budgets.ts';
import { totalOn } from './rates.ts';
import type { LedgerView } from './types.ts';

// IOUs (ADR 0024, docs/domain.md "IOUs"). The ledger holds the money: what
// people owe the user sits in the Receivables system account, what the user
// owes in Payables. The rows read here say who owes what and when, and which
// entry settled how much. Every figure is a pure function of both, so a
// back-dated or undone entry corrects the past through the same code.

declare const brand: unique symbol;
export type IouId = string & { readonly [brand]: 'IouId' };
export const iouId = (id: string) => id as IouId;

/** How an entry settled part of an IOU. */
export type IouSettlementKind = 'repayment' | 'write-off';

export type IouSettlement = Readonly<{
  id: string;
  /** The entry that moved the money, or that wrote the remainder off. */
  transactionId: TransactionId;
  kind: IouSettlementKind;
  amount: Money;
  on: LocalDate;
  /** ISO 8601 UTC instant; orders settlements made on the same day. */
  at: string;
}>;

export type Iou = Readonly<{
  id: IouId;
  direction: IouDirection;
  /** A free-text name. */
  person: string;
  amount: Money;
  /** The entry that lent or borrowed it. */
  originId: TransactionId;
  recordedOn: LocalDate;
  dueOn: LocalDate | null;
  settlements: readonly IouSettlement[];
}>;

export type IouSetup = Readonly<{
  ious: readonly Iou[];
  /**
   * Days after the due date (or the day it was recorded, without one)
   * from which a debt to the user may be written off.
   */
  writeOffAfterDays: number;
}>;

export const defaultWriteOffAfterDays = 90;

const noIous: IouSetup = {
  ious: [],
  writeOffAfterDays: defaultWriteOffAfterDays,
};

export function iousOf(view: Pick<LedgerView, 'ious'>): IouSetup {
  return view.ious ?? noIous;
}

/** What a repayment's refill of the loan's cover is keyed by (see budgets). */
export function loanKey(origin: TransactionId): TransactionId {
  return `${origin}#loan` as TransactionId;
}

function reversedSet(ledger: readonly Transaction[]): Set<TransactionId> {
  return new Set(
    ledger.flatMap((t) => (t.reversesId === null ? [] : [t.reversesId])),
  );
}

export type IouStatus = Readonly<{
  iou: Iou;
  /** Its entry stands and is dated on or before the day asked about. */
  active: boolean;
  repaid: Money;
  writtenOff: Money;
  /** What is still owed; zero once settled. */
  outstanding: Money;
  settled: boolean;
  /** Past its due date and not settled. */
  overdue: boolean;
  daysOverdue: number;
  /** The first day a debt to the user may be written off. */
  writeOffFrom: LocalDate | null;
  canWriteOff: boolean;
}>;

function sumMinor(settlements: readonly IouSettlement[]): number {
  return settlements.reduce((sum, s) => sum + s.amount.amountMinor, 0);
}

/** One IOU as of `today`. Undone entries and later-dated ones do not count. */
export function iouStatus(
  view: Pick<LedgerView, 'ious' | 'ledger'>,
  iou: Iou,
  today: LocalDate,
  reversed: ReadonlySet<TransactionId> = reversedSet(view.ledger),
): IouStatus {
  const { currency } = iou.amount;
  const active = !reversed.has(iou.originId) && iou.recordedOn <= today;
  const live = iou.settlements.filter(
    (s) => !reversed.has(s.transactionId) && s.on <= today,
  );
  const repaid = sumMinor(live.filter((s) => s.kind === 'repayment'));
  const writtenOff = sumMinor(live.filter((s) => s.kind === 'write-off'));
  const outstanding = active
    ? Math.max(0, iou.amount.amountMinor - repaid - writtenOff)
    : 0;
  const settled = active && outstanding === 0;
  const overdue = active && !settled && iou.dueOn !== null && today > iou.dueOn;
  const base = iou.dueOn ?? iou.recordedOn;
  const writeOffFrom =
    iou.direction === 'owed-to-me'
      ? addDays(base, iousOf(view).writeOffAfterDays)
      : null;
  return {
    iou,
    active,
    repaid: money(repaid, currency),
    writtenOff: money(writtenOff, currency),
    outstanding: money(outstanding, currency),
    settled,
    overdue,
    daysOverdue:
      iou.dueOn === null || !overdue ? 0 : daysBetween(iou.dueOn, today),
    writeOffFrom,
    canWriteOff:
      writeOffFrom !== null && active && !settled && today >= writeOffFrom,
  };
}

/** Every IOU as of `today`, earliest recorded first. Undone ones are left out. */
export function iouStatuses(
  view: Pick<LedgerView, 'ious' | 'ledger'>,
  today: LocalDate,
): IouStatus[] {
  const reversed = reversedSet(view.ledger);
  return [...iousOf(view).ious]
    .sort(
      (a, b) =>
        a.recordedOn.localeCompare(b.recordedOn) || a.id.localeCompare(b.id),
    )
    .map((iou) => iouStatus(view, iou, today, reversed))
    .filter((s) => s.active);
}

export type IouTotals = Readonly<{
  /** What people still owe the user, in the default currency. */
  owedToMe: Money;
  /** What the user still owes, in the default currency. */
  owedByMe: Money;
  missingRates: readonly CurrencyCode[];
}>;

/** What is outstanding in each direction, each currency converted once. */
export function iouTotals(
  view: LedgerView,
  today: LocalDate,
  statuses: readonly IouStatus[] = iouStatuses(view, today),
): IouTotals {
  const pick = (direction: IouDirection) =>
    statuses
      .filter((s) => s.iou.direction === direction && !s.settled)
      .map((s) => s.outstanding);
  const target = view.settings.defaultCurrency;
  const toMe = totalOn(view.rates, pick('owed-to-me'), target, today);
  const byMe = totalOn(view.rates, pick('owed-by-me'), target, today);
  return {
    owedToMe: toMe.amount,
    owedByMe: byMe.amount,
    missingRates: [
      ...new Set([...toMe.missingRates, ...byMe.missingRates]),
    ].sort(),
  };
}

/**
 * Repayments of what the user lent, as returns against the loan's cover: a
 * repayment refills what the loan took, in reverse order, and the rest is
 * free money again (ADR 0021). Write-offs bring nothing back.
 */
export function iouReturns(view: LedgerView): BudgetReturn[] {
  const reversed = reversedSet(view.ledger);
  return iousOf(view).ious.flatMap((iou) =>
    iou.direction !== 'owed-to-me' || reversed.has(iou.originId)
      ? []
      : iou.settlements
          .filter(
            (s) => s.kind === 'repayment' && !reversed.has(s.transactionId),
          )
          .map((s): BudgetReturn => ({
            id: s.id,
            against: loanKey(iou.originId),
            amount: s.amount,
            on: s.on,
            at: s.at,
          })),
  );
}

/**
 * Per currency, what the Receivables (or Payables) account holds less what
 * the IOUs say is outstanding. Zero for a consistent ledger; the server
 * keeps rows and entries together, and tests check it.
 */
export function iouBalanceGaps(
  view: LedgerView,
  today: LocalDate,
): ReadonlyMap<`${IouDirection}:${CurrencyCode}`, bigint> {
  const gaps = new Map<`${IouDirection}:${CurrencyCode}`, bigint>();
  const bump = (key: `${IouDirection}:${CurrencyCode}`, by: bigint) =>
    gaps.set(key, (gaps.get(key) ?? 0n) + by);
  for (const t of view.ledger) {
    if (t.occurredOn > today) continue;
    for (const p of t.postings) {
      const role = view.chart.get(p.accountId)?.systemRole;
      if (role === 'receivables') {
        bump(`owed-to-me:${p.amount.currency}`, BigInt(p.amount.amountMinor));
      } else if (role === 'payables') {
        bump(`owed-by-me:${p.amount.currency}`, -BigInt(p.amount.amountMinor));
      }
    }
  }
  for (const s of iouStatuses(view, today)) {
    bump(
      `${s.iou.direction}:${s.iou.amount.currency}`,
      -BigInt(s.outstanding.amountMinor),
    );
  }
  return new Map([...gaps].filter(([, gap]) => gap !== 0n));
}
