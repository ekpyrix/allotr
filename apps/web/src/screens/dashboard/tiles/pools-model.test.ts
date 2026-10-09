import { money, type PoolView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { poolRows } from './pools-model.ts';

const fig = (minor: number) => ({
  amount: money(minor, 'USD'),
  missingRates: [],
});

function pool(over: Partial<PoolView> & { id: string }): PoolView {
  return {
    name: over.id,
    kind: 'spending',
    countsTowardDaily: true,
    counts: true,
    defaultFor: null,
    archived: false,
    accountIds: [],
    balance: fig(0),
    cycle: null,
    ...over,
  };
}

describe('poolRows', () => {
  it('shares bars over positive balances and skips archived pools', () => {
    const rows = poolRows([
      pool({ id: 'a', balance: fig(7500) }),
      pool({ id: 'b', balance: fig(2500), kind: 'savings' }),
      pool({ id: 'c', balance: fig(9900), archived: true }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rows.map((r) => r.share)).toEqual([0.75, 0.25]);
  });

  it('fills the left bar when money came in past the start', () => {
    const [row] = poolRows([
      pool({
        id: 'a',
        balance: fig(5000),
        cycle: { start: fig(4000), left: fig(5000) },
      }),
    ]);
    expect(row?.cycle?.fraction).toBe(1);
  });

  it('draws an empty bar for a non-positive start and none for savings', () => {
    const rows = poolRows([
      pool({ id: 'a', cycle: { start: fig(-100), left: fig(50) } }),
      pool({ id: 'b', kind: 'savings', countsTowardDaily: false }),
    ]);
    expect(rows[0]?.cycle?.fraction).toBe(0);
    expect(rows[1]?.cycle).toBeNull();
    expect(rows[1]?.checked).toBe(false);
  });

  it('locks the Budget pool, which always counts', () => {
    const rows = poolRows([
      pool({ id: 'budget', defaultFor: 'on' }),
      pool({ id: 'savings', kind: 'savings', defaultFor: 'off' }),
      pool({ id: 'mine' }),
    ]);
    expect(rows.map((r) => r.fixed)).toEqual([true, false, false]);
  });
});
