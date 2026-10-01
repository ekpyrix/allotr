import { money, type AccountView, type CategoryView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { needsFirstPaycheck } from './first-paycheck.tsx';

const account = (budgetGroup: 'on' | 'off', archived = false): AccountView =>
  ({
    id: 'a',
    name: 'Everyday',
    kind: 'asset',
    currency: 'USD',
    budgetGroup,
    balance: money(0, 'USD'),
    archived,
    createdAt: '2026-01-01T00:00:00.000Z',
    poolId: 'pool-budget',
    lastReconciledOn: null,
  }) as AccountView;

const pay: CategoryView = {
  id: 'pay',
  name: 'Paycheck',
  kind: 'income',
  parentId: null,
  isPaycheck: true,
  position: 0,
  colour: null,
  icon: null,
  mergedIntoId: null,
};

const first = null;
const opened = 'entry-1';

describe('needsFirstPaycheck', () => {
  it('asks while no paycheck has opened the cycle', () => {
    expect(needsFirstPaycheck(first, [account('on')], [pay])).toBe(true);
  });

  it('stops once a paycheck has opened it', () => {
    expect(needsFirstPaycheck(opened, [account('on')], [pay])).toBe(false);
  });

  it('needs an open on-budget account to record it in', () => {
    expect(needsFirstPaycheck(first, [], [pay])).toBe(false);
    expect(needsFirstPaycheck(first, [account('off')], [pay])).toBe(false);
    expect(needsFirstPaycheck(first, [account('on', true)], [pay])).toBe(false);
  });

  it('needs a paycheck category', () => {
    expect(
      needsFirstPaycheck(
        first,
        [account('on')],
        [{ ...pay, isPaycheck: false }],
      ),
    ).toBe(false);
  });
});
