// Row column templates (docs/ui.md §4 "Row"): a row is one line, so narrow
// frames drop columns instead of wrapping. Each column says the narrowest
// frame it shows in; the template for a frame is the shown columns' widths.
// Pure, so the rules can be tested without a browser.

export type Frame = 'compact' | 'medium' | 'wide';

export const FRAME_ORDER: readonly Frame[] = ['compact', 'medium', 'wide'];

/** The frame class for a container width in CSS px (600 / 1000). */
export function frameFor(width: number): Frame {
  if (width >= 1000) return 'wide';
  if (width >= 600) return 'medium';
  return 'compact';
}

export type RowColumn = Readonly<{
  /** A CSS grid track: `1fr`, `minmax(0, 2fr)`, `4.5rem`, `auto`. */
  width: string;
  /** The narrowest frame the column shows in; shown from there up. */
  from?: Frame;
}>;

export function isShown(column: RowColumn, frame: Frame): boolean {
  const from = column.from ?? 'compact';
  return FRAME_ORDER.indexOf(frame) >= FRAME_ORDER.indexOf(from);
}

/** The `grid-template-columns` value for a frame; hidden columns are removed. */
export function rowTemplate(
  columns: readonly RowColumn[],
  frame: Frame,
): string {
  return columns
    .filter((column) => isShown(column, frame))
    .map((column) => column.width)
    .join(' ');
}

/** Tailwind classes that remove a column below the frame it starts at. */
export function hiddenBelow(from: Frame | undefined): string {
  if (from === 'medium') return 'compact:hidden';
  if (from === 'wide') return 'narrow:hidden';
  return '';
}
