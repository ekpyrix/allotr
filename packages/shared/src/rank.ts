import { z } from 'zod';

// Sort keys for ordering entries within a day (fractional indexing). A key
// is a string of base-62 digits, never ending in the lowest digit, so there
// is always another key between any two. Keys compare as plain strings in
// code-unit order, which is also SQLite's BINARY collation: compare them
// with `<`, not localeCompare.

export type RankErrorCode = 'rank.invalid' | 'rank.order';

export class RankError extends Error {
  override readonly name = 'RankError';
  readonly code: RankErrorCode;

  constructor(code: RankErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;
const ZERO = '0';

/** Keys longer than this are a sign the day should be renumbered. */
export const RANK_MAX_LENGTH = 64;

const RANK = /^[0-9A-Za-z]*[1-9A-Za-z]$/;

export function isRank(value: string): boolean {
  return value.length <= RANK_MAX_LENGTH && RANK.test(value);
}

export const rankSchema = z.string().refine(isRank, { error: 'Not a rank' });

function digit(char: string | undefined): number {
  return char === undefined ? 0 : DIGITS.indexOf(char);
}

function digitAt(index: number): string {
  return DIGITS.charAt(index);
}

// The midpoint of `a` (empty for the start) and `b` (null for the end),
// where a < b and neither ends in ZERO.
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n += 1;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const low = digit(a[0]);
  const high = b === null ? BASE : digit(b[0]);
  if (high - low > 1) return digitAt(Math.round((low + high) / 2));
  if (b !== null && b.length > 1) return b.charAt(0);
  return digitAt(low) + midpoint(a.slice(1), null);
}

/**
 * A key that sorts after `before` and before `after`. Leave either out for
 * the start or end of the order.
 */
export function rankBetween(
  before?: string | null,
  after?: string | null,
): string {
  for (const key of [before, after]) {
    if (key != null && !RANK.test(key)) {
      throw new RankError('rank.invalid', `"${key}" is not a rank.`);
    }
  }
  if (before != null && after != null && !(before < after)) {
    throw new RankError(
      'rank.order',
      `"${before}" does not sort before "${after}".`,
    );
  }
  return midpoint(before ?? '', after ?? null);
}

/** `count` evenly spaced keys in ascending order, for renumbering a day. */
export function rankSequence(count: number): string[] {
  if (count <= 0) return [];
  let width = 1;
  while (BASE ** width <= count) width += 1;
  const span = BASE ** width;
  return Array.from({ length: count }, (_, i) => {
    let value = Math.floor(((i + 1) * span) / (count + 1));
    let key = '';
    for (let w = 0; w < width; w += 1) {
      key = digitAt(value % BASE) + key;
      value = Math.floor(value / BASE);
    }
    // Trailing zeros carry no order, and a key may not end in one.
    return key.replace(/0+$/, '');
  });
}
