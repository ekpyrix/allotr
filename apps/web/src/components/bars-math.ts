/** Clamps a fraction to 0..1; NaN and infinities that are not usable become 0. */
export function clampFraction(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** A fraction as a CSS percentage with two decimals, for exact bar widths. */
export function percent(value: number): string {
  return `${String(Math.round(clampFraction(value) * 10000) / 100)}%`;
}
