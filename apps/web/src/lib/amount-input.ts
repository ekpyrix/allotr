import { formatMoneyInput, parseMoney } from '@allotr/shared';

/**
 * Tidies an amount typed into a field when it loses focus: `35` becomes
 * `35.00` for a two-digit currency, `3.5` becomes `3.50`, and a JPY
 * amount loses stray zeros. Text that is empty, has no currency yet or
 * does not parse as an amount in the currency is returned as typed, so the
 * field's own error can explain it. The sign is kept.
 */
export function reformatAmountInput(
  text: string,
  currency: string | undefined,
  locale: string,
): string {
  if (currency === undefined || currency === '' || text.trim() === '') {
    return text;
  }
  try {
    const parsed = parseMoney(text, currency, locale);
    const shown = formatMoneyInput(parsed, locale);
    return parsed.amountMinor < 0 ? `-${shown}` : shown;
  } catch {
    return text;
  }
}
