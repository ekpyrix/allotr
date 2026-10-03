import {
  money,
  MoneyError,
  parseMoney,
  type CurrencyCode,
  type LedgerSettingsView,
  type PayYourselfFirstSetting,
} from '@allotr/shared';

// The payday-plan settings form's text and its request value. Percent is
// kept in hundredths of a percent (1000 is 10%), as the API has it.

/** "10" or "12.5" as hundredths of a percent; null when not a percent. */
export function parsePercent(text: string): number | null {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (match === null) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const basisPoints = whole * 100 + fraction;
  return basisPoints <= 10_000 ? basisPoints : null;
}

export function percentText(basisPoints: number): string {
  const whole = Math.floor(basisPoints / 100);
  const fraction = basisPoints % 100;
  if (fraction === 0) return String(whole);
  return `${String(whole)}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`;
}

export type PayKind = 'none' | 'fixed' | 'percent';

export function payKind(
  setting: LedgerSettingsView['payYourselfFirst'],
): PayKind {
  return setting === null ? 'none' : setting.kind;
}

/** The setting for the form's choice; 'invalid' when the text is not a value. */
export function toPayYourselfFirst(
  kind: PayKind,
  text: string,
  currency: CurrencyCode,
  locale: string,
): PayYourselfFirstSetting | null | 'invalid' {
  if (kind === 'none') return null;
  if (kind === 'percent') {
    const basisPoints = parsePercent(text);
    return basisPoints === null ? 'invalid' : { kind, basisPoints };
  }
  if (text.trim() === '') return 'invalid';
  try {
    const amount = parseMoney(text, currency, locale);
    return amount.amountMinor < 0
      ? 'invalid'
      : { kind, amount: money(amount.amountMinor, currency) };
  } catch (error) {
    if (error instanceof MoneyError) return 'invalid';
    throw error;
  }
}
