import { formatMoney, money, type LocalDate, type Money } from '@allotr/shared';

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** A calendar day as "Apr 1" in the user's locale; never shifted by zone. */
export function formatDay(date: LocalDate, locale: string): string {
  let formatter = dayFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    dayFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(`${date}T00:00:00Z`));
}

/** Money without its sign, for text that already says in or out. */
export function formatAbs(amount: Money, locale: string): string {
  return formatMoney(
    money(Math.abs(amount.amountMinor), amount.currency),
    locale,
  );
}
