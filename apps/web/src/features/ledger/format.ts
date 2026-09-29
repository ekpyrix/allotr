import {
  formatMoney,
  type LocalDate,
  type TransactionView,
} from '@allotr/shared';
import { t } from '@/messages/t';
import type { LedgerRow } from './rows.ts';

const cache = new Map<string, Intl.DateTimeFormat>();
function formatter(key: string, make: () => Intl.DateTimeFormat) {
  let found = cache.get(key);
  if (found === undefined) {
    found = make();
    cache.set(key, found);
  }
  return found;
}

/** A calendar day in full, such as "Wed, Mar 11, 2026"; never zone-shifted. */
export function formatLongDay(date: LocalDate, locale: string): string {
  return formatter(
    `day|${locale}`,
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
  ).format(new Date(`${date}T00:00:00Z`));
}

/** When an entry was typed in, in the user's time zone. */
export function formatMoment(
  iso: string,
  locale: string,
  timeZone: string,
): string {
  return formatter(
    `moment|${locale}|${timeZone}`,
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone,
      }),
  ).format(new Date(iso));
}

export function rowAmount(row: LedgerRow, locale: string): string | null {
  if (row.amount === null) return null;
  return formatMoney(row.amount, locale, {
    signDisplay: row.moves ? 'never' : 'exceptZero',
  });
}

/** Category, else note, else the kind; an undo says what it undoes. */
export function rowTitle(row: LedgerRow): string {
  if (row.kind === 'reversal') {
    const undone =
      row.title ??
      (row.originalKind === null
        ? null
        : t(`ledger.kinds.${row.originalKind}`));
    return undone === null
      ? t('ledger.kinds.reversal')
      : t('ledger.undoOf', { title: undone });
  }
  if (row.kind === 'budget_switch')
    return row.budgetGroup === 'on'
      ? t('ledger.budgetOn')
      : t('ledger.budgetOff');
  return row.title ?? row.note ?? t(`ledger.kinds.${row.kind}`);
}

/**
 * An entry's implied rate as "1 USD = 0.92 EUR", or null without one. The
 * currencies come from the exchange legs: core books what was given up
 * positive and what came out negative, and an undo has them the other way.
 * The rate is shown as stored, never recomputed.
 */
export function rateText(entry: TransactionView): string | null {
  if (entry.impliedRate === null) return null;
  const legs = entry.postings.filter((p) => p.systemRole === 'conversion');
  const sign = entry.kind === 'reversal' ? -1 : 1;
  const from = legs.find((p) => sign * p.amount.amountMinor > 0);
  const to = legs.find((p) => sign * p.amount.amountMinor < 0);
  if (from === undefined || to === undefined) return null;
  return t('ledger.entry.rateValue', {
    from: from.amount.currency,
    to: to.amount.currency,
    rate: entry.impliedRate,
  });
}
