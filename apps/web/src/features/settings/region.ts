import { formatMoney, money } from '@allotr/shared';

// Locale and time zone helpers shared by Settings and setup.

/** A formatted sample amount, or null when the locale is not usable. */
export function localeSample(locale: string, currency: string): string | null {
  try {
    return formatMoney(money(12_345_678, currency), locale);
  } catch {
    return null;
  }
}

/** Every time zone the browser knows, with `current` kept even if not. */
export function timeZoneOptions(current: string): readonly string[] {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.includes(current) ? zones : [current, ...zones];
}

/** This device's time zone and language, where the browser tells them. */
export function browserRegion(): { timeZone?: string; locale?: string } {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = navigator.language;
  return {
    ...(timeZone === '' ? {} : { timeZone }),
    ...(localeSample(locale, 'USD') === null ? {} : { locale }),
  };
}
