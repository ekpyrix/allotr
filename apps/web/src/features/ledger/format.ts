import { formatMoney, type LocalDate } from '@allotr/shared';
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
