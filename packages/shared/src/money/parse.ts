import { currencyCode, minorUnit, type CurrencyCode } from './currency.ts';
import { MoneyError } from './errors.ts';
import { moneyFromDigits, type Money } from './money.ts';

// Parsing inverts formatMoney. The locale's separators, digits, signs and
// currency names come from Intl instead of hard-coded tables, so every
// locale Intl supports works the same way.

interface LocaleSymbols {
  readonly decimal: string;
  readonly group: string;
  // Locales with native separators (ar-EG) also accept ASCII '.' and ','.
  readonly asciiSeparators: boolean;
  readonly signs: ReadonlyMap<string, boolean>; // sign → is negative
  readonly digits: ReadonlyMap<string, string>; // local digit → ASCII digit
  readonly currencyTokens: readonly string[]; // longest first
}

const DISPLAYS = ['symbol', 'narrowSymbol', 'code', 'name'] as const;
// Enough values to meet every plural form of currency names.
const SAMPLES = ['0', '1', '2', '3', '5', '11', '21', '101', '1.5', '-1'];
const ASCII_DIGITS = '1234567890';
const APOSTROPHES = new Set(["'", '’']);

const symbolCache = new Map<string, LocaleSymbols>();

// Direction marks and joiners (Unicode Cf) carry no amount information.
function stripFormatChars(text: string): string {
  return text.replace(/\p{Cf}/gu, '');
}

function symbolsFor(locale: string, currency: CurrencyCode): LocaleSymbols {
  const key = `${locale}|${currency}`;
  const cached = symbolCache.get(key);
  if (cached !== undefined) return cached;

  const signs = new Map([
    ['-', true],
    ['−', true],
    ['+', false],
  ]);
  let decimal = '.';
  let group = ',';
  const probe = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'always',
  });
  for (const part of [
    ...probe.formatToParts('-1234567.5'),
    ...probe.formatToParts('1'),
  ]) {
    if (part.type === 'decimal') decimal = part.value;
    else if (part.type === 'group') group = part.value;
    else if (part.type === 'minusSign') signs.set(part.value, true);
    else if (part.type === 'plusSign') signs.set(part.value, false);
  }

  const digits = new Map(Array.from(ASCII_DIGITS).map((d) => [d, d]));
  const local = Array.from(
    new Intl.NumberFormat(locale, {
      numberingSystem: probe.resolvedOptions().numberingSystem,
      useGrouping: false,
    }).format(1234567890),
  ).filter((c) => /\p{Nd}/u.test(c));
  if (local.length === ASCII_DIGITS.length) {
    local.forEach((c, i) => digits.set(c, ASCII_DIGITS.charAt(i)));
  }

  const tokens = new Set<string>([currency]);
  const fractionDigits = minorUnit(currency);
  for (const currencyDisplay of DISPLAYS) {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    for (const sample of SAMPLES) {
      for (const part of formatter.formatToParts(sample as `${number}`)) {
        // Stripped like the input, which loses them before matching.
        const token = stripFormatChars(part.value);
        if (part.type === 'currency' && token !== '') tokens.add(token);
      }
    }
  }

  const symbols: LocaleSymbols = {
    decimal,
    group,
    asciiSeparators: decimal !== '.' && decimal !== ',',
    signs,
    digits,
    currencyTokens: [...tokens].sort((a, b) => b.length - a.length),
  };
  symbolCache.set(key, symbols);
  return symbols;
}

function isGroup(char: string, group: string): boolean {
  if (char === group) return true;
  if (/\s/u.test(group)) return /\s/u.test(char);
  return APOSTROPHES.has(group) && APOSTROPHES.has(char);
}

// Group separators must sit where a formatter would put them: 1-3 digits,
// then groups of 2 or 3 (Indian grouping), ending in exactly 3.
function isWellGrouped(groups: readonly string[]): boolean {
  return groups.every((g, i) => {
    if (i === 0) return g.length >= 1 && g.length <= 3;
    if (i === groups.length - 1) return g.length === 3;
    return g.length === 2 || g.length === 3;
  });
}

/** Reads money as written in a locale, for example "1.234,56 €" in de-DE. */
export function parseMoney(
  text: string,
  currency: string,
  locale: string,
): Money {
  const code = currencyCode(currency);
  const symbols = symbolsFor(locale, code);
  const invalid = () =>
    new MoneyError(
      'money.invalid_format',
      `"${text}" is not an amount in ${code}.`,
    );

  // Drop direction marks, then the currency's own symbol, code or name.
  let rest = stripFormatChars(text);
  for (const token of symbols.currencyTokens) {
    rest = rest.split(token).join(' ');
  }

  // One optional sign, before or after the number.
  let chars = Array.from(rest.trim());
  let negative = false;
  const first = chars.at(0);
  const last = chars.at(-1);
  if (first !== undefined && symbols.signs.has(first)) {
    negative = symbols.signs.get(first) === true;
    chars = Array.from(chars.slice(1).join('').trim());
  } else if (last !== undefined && symbols.signs.has(last)) {
    negative = symbols.signs.get(last) === true;
    chars = Array.from(chars.slice(0, -1).join('').trim());
  }

  let normalized = '';
  for (const char of chars) {
    const digit = symbols.digits.get(char);
    if (digit !== undefined) {
      normalized += digit;
    } else if (
      char === symbols.decimal ||
      (symbols.asciiSeparators && char === '.')
    ) {
      normalized += '.';
    } else if (
      isGroup(char, symbols.group) ||
      (symbols.asciiSeparators && char === ',')
    ) {
      normalized += ',';
    } else {
      throw invalid();
    }
  }

  const [integer = '', fraction, ...extra] = normalized.split('.');
  if (
    extra.length > 0 ||
    integer === '' ||
    fraction === '' ||
    fraction?.includes(',')
  ) {
    throw invalid();
  }
  const groups = integer.split(',');
  if (groups.length > 1 && !isWellGrouped(groups)) throw invalid();
  return moneyFromDigits(negative, groups.join(''), fraction ?? '', code);
}
