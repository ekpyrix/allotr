import { describe, expect, it } from 'vitest';
import { rollerCells } from './digits.ts';

describe('rollerCells', () => {
  it('splits an amount into digits and other characters', () => {
    expect(rollerCells('$12.50')).toEqual([
      { key: 'c5$', kind: 'char', char: '$' },
      { key: 'd4', kind: 'digit', digit: 1 },
      { key: 'd3', kind: 'digit', digit: 2 },
      { key: 'c2.', kind: 'char', char: '.' },
      { key: 'd1', kind: 'digit', digit: 5 },
      { key: 'd0', kind: 'digit', digit: 0 },
    ]);
  });

  it('keeps the right-hand cells when the number of digits changes', () => {
    const before = rollerCells('$1,234.56');
    const after = rollerCells('$987.00');
    expect(before).toHaveLength(9);
    expect(after).toHaveLength(7);
    const keys = (cells: ReturnType<typeof rollerCells>) =>
      cells.filter((cell) => cell.kind === 'digit').map((cell) => cell.key);
    // Places count every character from the right, so the cents and the
    // three whole digits keep their cells; the thousands digit goes.
    expect(keys(after)).toEqual(['d5', 'd4', 'd3', 'd1', 'd0']);
    expect(keys(before)).toEqual(['d7', 'd5', 'd4', 'd3', 'd1', 'd0']);
  });

  it('treats a minus sign as a character', () => {
    expect(rollerCells('−$3.00')[0]).toEqual({
      key: 'c5−',
      kind: 'char',
      char: '−',
    });
  });
});
