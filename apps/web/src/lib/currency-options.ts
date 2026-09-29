import { currencies } from '@allotr/shared';
import { useMemo } from 'react';

/** Every currency code the server accepts, in code order. */
export const currencyCodes: readonly string[] = currencies
  .map((c) => c.code)
  .sort((a, b) => a.localeCompare(b));

/** "USD — US Dollar" in the user's language, or the code alone. */
export function useCurrencyOptions(locale: string) {
  return useMemo(() => {
    let names: Intl.DisplayNames | undefined;
    try {
      names = new Intl.DisplayNames([locale], { type: 'currency' });
    } catch {
      names = undefined;
    }
    return currencyCodes.map((code) => {
      const name = names?.of(code);
      return {
        code,
        label: name === undefined || name === code ? code : `${code} — ${name}`,
      };
    });
  }, [locale]);
}
