import {
  money,
  type AccountView,
  type LocalDate,
  type PoolView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  accountGroups,
  creditStat,
  inFilter,
  movePools,
  needsReconcile,
  sparkPoints,
} from './accounts-model.ts';

function account(patch: Partial<AccountView> & { id: string }): AccountView {
  return {
    name: patch.id,
    kind: 'asset',
    currency: money(0, 'USD').currency,
    budgetGroup: 'on',
    poolId: 'p-budget',
    balance: money(10000, 'USD'),
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastReconciledOn: null,
    ...patch,
  };
}

function pool(patch: Partial<PoolView> & { id: string }): PoolView {
  return {
    name: patch.id,
    kind: 'spending',
    countsTowardDaily: true,
    counts: true,
    defaultFor: null,
    archived: false,
    accountIds: [],
    balance: { amount: money(50000, 'USD'), missingRates: [] },
    cycle: null,
    ...patch,
  };
}

const pools = [
  pool({ id: 'p-budget', name: 'Budget' }),
  pool({ id: 'p-save', name: 'Savings', kind: 'savings', counts: false }),
];
const cash = account({ id: 'cash' });
const bank = account({ id: 'bank' });
const nest = account({
  id: 'nest',
  budgetGroup: 'off',
  poolId: 'p-save',
});
const card = account({
  id: 'card',
  kind: 'liability',
  balance: money(-4500, 'USD'),
});
const old = account({ id: 'old', archived: true });

describe('inFilter', () => {
  it('keeps credit out of the on and off budget tabs', () => {
    expect(inFilter(card, 'on-budget')).toBe(false);
    expect(inFilter(card, 'off-budget')).toBe(false);
    expect(inFilter(card, 'credit')).toBe(true);
    expect(inFilter(cash, 'credit')).toBe(false);
  });

  it('splits the rest by budget group', () => {
    expect(inFilter(cash, 'on-budget')).toBe(true);
    expect(inFilter(nest, 'on-budget')).toBe(false);
    expect(inFilter(nest, 'off-budget')).toBe(true);
    expect(inFilter(nest, 'all')).toBe(true);
  });
});

describe('accountGroups', () => {
  const all = [cash, bank, nest, card, old];

  it('lists pools in order, then credit, and drops archived accounts', () => {
    const groups = accountGroups(all, pools, 'all');
    expect(groups.map((g) => g.id)).toEqual(['p-budget', 'p-save', 'credit']);
    expect(groups[0]?.accounts.map((a) => a.id)).toEqual(['cash', 'bank']);
    expect(groups[0]?.balance).toEqual(money(50000, 'USD'));
    expect(groups[2]?.balance).toBeNull();
  });

  it('shows only the pools with accounts in the tab', () => {
    expect(accountGroups(all, pools, 'off-budget').map((g) => g.id)).toEqual([
      'p-save',
    ]);
    expect(accountGroups(all, pools, 'credit').map((g) => g.id)).toEqual([
      'credit',
    ]);
  });

  it('keeps an account whose pool is unknown in its own group', () => {
    const stray = account({ id: 'stray', poolId: '' });
    const groups = accountGroups([stray], pools, 'all');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe('none');
  });
});

describe('needsReconcile', () => {
  const today = '2026-10-10' as LocalDate;

  it('counts never reconciled and stale accounts, not recent or archived', () => {
    const fresh = account({
      id: 'fresh',
      lastReconciledOn: '2026-10-01' as LocalDate,
    });
    const edge = account({
      id: 'edge',
      lastReconciledOn: '2026-09-10' as LocalDate,
    });
    const stale = account({
      id: 'stale',
      lastReconciledOn: '2026-09-09' as LocalDate,
    });
    const never = account({ id: 'never' });
    const gone = account({ id: 'gone', archived: true });
    expect(
      needsReconcile([fresh, edge, stale, never, gone], today).map((a) => a.id),
    ).toEqual(['stale', 'never']);
  });
});

describe('creditStat', () => {
  it('shows none, the one balance, or how many', () => {
    expect(creditStat([cash])).toEqual({ kind: 'none' });
    expect(creditStat([cash, card])).toEqual({
      kind: 'one',
      balance: money(-4500, 'USD'),
    });
    const second = account({ id: 'loan', kind: 'liability' });
    expect(creditStat([card, second])).toEqual({ kind: 'many', count: 2 });
  });
});

describe('sparkPoints', () => {
  it('numbers the days and keeps the minor units', () => {
    expect(
      sparkPoints([
        { balance: money(100, 'USD') },
        { balance: money(-5, 'USD') },
      ]),
    ).toEqual([
      { x: 0, y: 100 },
      { x: 1, y: -5 },
    ]);
  });
});

describe('movePools', () => {
  it('offers open pools other than the current one', () => {
    const hidden = pool({ id: 'p-old', archived: true });
    expect(movePools(cash, [...pools, hidden]).map((p) => p.id)).toEqual([
      'p-save',
    ]);
  });
});
