import { describe, expect, it } from 'vitest';
import { component } from './export-beancount.ts';
import { bundleAccountNames } from './export-bundle.ts';
import { textCell } from './export-csv.ts';
import type { SnapshotAccount } from './export-snapshot.ts';

// Made-up names only.

describe('textCell', () => {
  it.each([
    ['plain', 'plain'],
    ['a, b', '"a, b"'],
    ['say "hi"', '"say ""hi"""'],
    ['two\nlines', '"two\nlines"'],
    ['=SUM(A1)', "'=SUM(A1)"],
    ['+1', "'+1"],
    ['-cash', "'-cash"],
    ['@home', "'@home"],
  ])('writes %j as %j', (value, cell) => {
    expect(textCell(value)).toBe(cell);
  });
});

describe('component', () => {
  it.each([
    ['Wallet', 'Wallet'],
    ['wallet', 'Wallet'],
    ['Box / tin', 'Box-tin'],
    ['Food & drink', 'Food-drink'],
    ['2nd card', '2nd-card'],
    ['Épargne', 'Épargne'],
    ['!!!', 'X'],
    ['-x-', 'X'],
  ])('cleans %j to %j', (name, cleaned) => {
    expect(component(name)).toBe(cleaned);
  });
});

describe('bundleAccountNames', () => {
  const account = (
    id: string,
    name: string,
    archived: boolean,
  ): SnapshotAccount => ({
    id,
    name,
    kind: 'asset',
    budgetGroup: 'on',
    currency: 'EUR',
    archived,
    createdOn: '2026-04-01' as SnapshotAccount['createdOn'],
  });

  it('keeps open names and numbers archived clashes', () => {
    const names = bundleAccountNames([
      account('a', 'Cash', true),
      account('b', 'cash', true),
      account('c', 'Cash', false),
      account('d', 'Bank', true),
    ]);
    expect([...names]).toEqual([
      ['c', 'Cash'],
      ['a', 'Cash (archived)'],
      ['b', 'cash (archived 2)'],
      ['d', 'Bank'],
    ]);
  });

  it('stays within 100 characters', () => {
    const long = 'N'.repeat(100);
    const names = bundleAccountNames([
      account('a', long, false),
      account('b', long, true),
    ]);
    expect(names.get('b')).toHaveLength(100);
    expect(names.get('b')?.endsWith(' (archived)')).toBe(true);
  });
});
