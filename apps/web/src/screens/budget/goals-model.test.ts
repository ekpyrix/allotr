import {
  localDate,
  money,
  type AccountView,
  type GoalView,
  type PoolView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  goalChart,
  toGoalBody,
  whereChoices,
} from './goals-model.ts';

function account(patch: Partial<AccountView> & { id: string }): AccountView {
  return {
    name: patch.id,
    kind: 'asset',
    currency: money(0, 'USD').currency,
    budgetGroup: 'off',
    poolId: 'p-save',
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
    kind: 'savings',
    countsTowardDaily: false,
    counts: false,
    defaultFor: null,
    archived: false,
    accountIds: [],
    balance: { amount: money(50000, 'USD'), missingRates: [] },
    cycle: null,
    ...patch,
  };
}

function goal(patch: Partial<GoalView> = {}): GoalView {
  return {
    id: 'g1',
    name: 'Trip',
    poolId: 'p-save',
    accountId: null,
    target: money(100000, 'USD'),
    targetOn: localDate('2026-12-01'),
    archived: false,
    saved: money(25000, 'USD'),
    remaining: money(75000, 'USD'),
    reached: false,
    missingRates: [],
    ...patch,
  };
}

describe('whereChoices', () => {
  const pools = [
    pool({ id: 'p-save', name: 'Savings' }),
    pool({ id: 'p-spend', kind: 'spending' }),
    pool({ id: 'p-old', archived: true }),
  ];
  const accounts = [
    account({ id: 'a-1', name: 'Rainy day' }),
    account({ id: 'a-2', poolId: 'p-spend' }),
    account({ id: 'a-3', archived: true }),
  ];
  const label = (name: string) => `${name} (pool)`;

  it('offers open savings pools and their accounts', () => {
    expect(whereChoices([], pools, accounts, label)).toEqual([
      { id: 'pool:p-save', label: 'Savings (pool)' },
      { id: 'account:a-1', label: 'Rainy day' },
    ]);
  });

  it('leaves out what already has a goal', () => {
    const taken = goal({ poolId: 'p-save' });
    expect(whereChoices([taken], pools, accounts, label)).toEqual([
      { id: 'account:a-1', label: 'Rainy day' },
    ]);
  });
});

describe('toGoalBody', () => {
  const draft = {
    name: ' Trip ',
    where: 'pool:p-save',
    amount: '1,000.00',
    date: '2026-12-01',
  };

  it('builds a pool goal', () => {
    expect(toGoalBody(draft, 'USD', 'en')).toEqual({
      ok: true,
      body: {
        name: 'Trip',
        poolId: 'p-save',
        target: money(100000, 'USD'),
        targetOn: '2026-12-01',
      },
    });
  });

  it('builds an account goal without a date', () => {
    const result = toGoalBody(
      { ...draft, where: 'account:a-1', date: '' },
      'USD',
      'en',
    );
    expect(result).toEqual({
      ok: true,
      body: {
        name: 'Trip',
        accountId: 'a-1',
        target: money(100000, 'USD'),
      },
    });
  });

  it('flags every bad field', () => {
    expect(
      toGoalBody(
        { name: '', where: '', amount: '0', date: 'soon' },
        'USD',
        'en',
      ),
    ).toEqual({
      ok: false,
      errors: { name: true, where: true, amount: true, date: true },
    });
  });
});

describe('goalChart', () => {
  const today = localDate('2026-10-10');

  it('places today and the target date', () => {
    const chart = goalChart(goal(), today, 'en');
    expect(daysBetween(today, localDate('2026-12-01'))).toBe(52);
    expect(chart?.points).toEqual([
      { x: 0, y: 25000 },
      { x: 52, y: 100000 },
    ]);
    expect(chart?.xTicks.map((t) => t.value)).toEqual([0, 52]);
  });

  it('has no line without a date', () => {
    expect(goalChart(goal({ targetOn: null }), today, 'en')).toBeNull();
  });

  it('keeps a past date one day wide', () => {
    const chart = goalChart(
      goal({ targetOn: localDate('2026-09-01') }),
      today,
      'en',
    );
    expect(chart?.points[1]?.x).toBe(1);
  });
});
