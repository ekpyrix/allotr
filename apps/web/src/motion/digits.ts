// Cells for the rolling hero number (spec §7.4). A formatted amount becomes
// digit cells, which roll, and other characters (currency, separators,
// minus), which crossfade. Cells are keyed by their place counted from the
// right, so when the number of digits changes the ones and tens keep their
// cells and only the new leading cells appear.

export type RollerCell = Readonly<
  | { key: string; kind: 'digit'; digit: number }
  | { key: string; kind: 'char'; char: string }
>;

export function rollerCells(text: string): RollerCell[] {
  const chars = Array.from(text);
  return chars.map((char, at) => {
    const place = chars.length - 1 - at;
    const digit = char >= '0' && char <= '9' ? Number(char) : null;
    return digit === null
      ? { key: `c${String(place)}${char}`, kind: 'char', char }
      : { key: `d${String(place)}`, kind: 'digit', digit };
  });
}
