/**
 * How much of `whole` is `part`, for drawing a bar's width only. Both come
 * from the server; the result is never shown as money. Zero or negative
 * `whole` draws an empty bar, and the fraction stays within 0–1.
 */
export function barFraction(part: number, whole: number): number {
  if (!(whole > 0) || !(part > 0)) return 0;
  return Math.min(1, part / whole);
}
