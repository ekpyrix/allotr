import { describe, expect, it } from 'vitest';
import {
  frameFor,
  hiddenBelow,
  isShown,
  rowTemplate,
  type RowColumn,
} from './row-columns.ts';

// A transactions row: time, icon, payee, category, account, amount. Columns
// drop in the order account, category, time (docs/ui.md §5).
const columns: readonly RowColumn[] = [
  { width: '3rem', from: 'wide' },
  { width: '1.5rem' },
  { width: 'minmax(0, 2fr)' },
  { width: 'minmax(0, 1fr)', from: 'medium' },
  { width: 'minmax(0, 1fr)', from: 'wide' },
  { width: 'auto' },
];

describe('frameFor', () => {
  it.each([
    [0, 'compact'],
    [599, 'compact'],
    [600, 'medium'],
    [999, 'medium'],
    [1000, 'wide'],
    [2560, 'wide'],
  ] as const)('%i px is %s', (width, frame) => {
    expect(frameFor(width)).toBe(frame);
  });
});

describe('rowTemplate', () => {
  it('keeps every column in a wide frame', () => {
    expect(rowTemplate(columns, 'wide')).toBe(
      '3rem 1.5rem minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto',
    );
  });

  it('drops time and account in a medium frame', () => {
    expect(rowTemplate(columns, 'medium')).toBe(
      '1.5rem minmax(0, 2fr) minmax(0, 1fr) auto',
    );
  });

  it('keeps only the essentials on a phone', () => {
    expect(rowTemplate(columns, 'compact')).toBe('1.5rem minmax(0, 2fr) auto');
  });

  it('never gains a column as the frame narrows', () => {
    const count = (frame: 'compact' | 'medium' | 'wide') =>
      columns.filter((c) => isShown(c, frame)).length;
    expect(count('compact')).toBeLessThanOrEqual(count('medium'));
    expect(count('medium')).toBeLessThanOrEqual(count('wide'));
  });
});

describe('hiddenBelow', () => {
  it('has a class for each frame a column can start at', () => {
    expect(hiddenBelow(undefined)).toBe('');
    expect(hiddenBelow('compact')).toBe('');
    expect(hiddenBelow('medium')).toBe('compact:hidden');
    expect(hiddenBelow('wide')).toBe('narrow:hidden');
  });
});
