// Value colour (ADR 0022): negative amounts are red, positive green and
// transfers blue. The sign and an arrow always come with the colour, so the
// meaning never depends on colour alone. This only reads the sign of an
// amount the server produced; it does no money arithmetic.

export type ValueTone = 'positive' | 'negative' | 'info' | 'neutral';

export type ValueKind = 'transfer' | undefined;

export function valueTone(amountMinor: number, kind?: ValueKind): ValueTone {
  if (kind === 'transfer') return 'info';
  if (amountMinor > 0) return 'positive';
  if (amountMinor < 0) return 'negative';
  return 'neutral';
}

export const toneClass: Readonly<Record<ValueTone, string>> = {
  positive: 'text-positive',
  negative: 'text-negative',
  info: 'text-info',
  neutral: 'text-text',
};
