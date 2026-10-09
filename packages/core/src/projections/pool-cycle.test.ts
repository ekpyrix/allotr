import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { opening, transfer } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { meta } from '../ledger/testing.ts';
import { poolCycleFigures } from './pool-cycle.ts';
import { poolId, type Pool, type PoolSetup } from './pools.ts';
import {
  card,
  cash,
  chart,
  day,
  openingUsd,
  paycheck,
  savings,
  spend,
  view,
  wallet,
} from './testing.ts';

// Pool cycle figures with made-up accounts and amounts.

const budget = poolId('budget');
const saved = poolId('savings');
const spare = poolId('spare');
const today = day('2026-03-10');

const pools: Pool[] = [
  { id: budget, name: 'Budget', kind: 'spending', countsTowardDaily: true },
  { id: saved, name: 'Savings', kind: 'savings', countsTowardDaily: false },
  { id: spare, name: 'Spare', kind: 'spending', countsTowardDaily: true },
];

function setup(moves: PoolSetup['moves'] = []): PoolSetup {
  return { pools, defaults: { on: budget, off: saved }, moves };
}

const usd = (n: number) => money(n, 'USD');

const ledger = [
  openingUsd('2026-02-18', 100_000, card),
  openingUsd('2026-02-18', 500_000, savings),
  paycheck('2026-03-01', 200_000),
  spend('2026-03-05', 30_000),
];

describe('poolCycleFigures', () => {
  it('starts from the eve of the cycle plus income, and reads left today', () => {
    const figures = poolCycleFigures(view(ledger), today);
    // The opening-day paycheck is in both, so only spending separates them.
    expect(figures.get(budget)).toEqual({
      start: [usd(300_000)],
      left: [usd(270_000)],
    });
  });

  it('adds income later in the cycle to the start', () => {
    const figures = poolCycleFigures(
      view([...ledger, paycheck('2026-03-08', 15_000)]),
      today,
    );
    expect(figures.get(budget)).toEqual({
      start: [usd(315_000)],
      left: [usd(285_000)],
    });
  });

  it('takes undone income back out of the start', () => {
    const bonus = paycheck('2026-03-08', 15_000);
    const undo = reverse(
      chart,
      [...ledger, bonus],
      bonus.id,
      meta('2026-03-09'),
    );
    const figures = poolCycleFigures(view([...ledger, bonus, undo]), today);
    expect(figures.get(budget)).toEqual({
      start: [usd(300_000)],
      left: [usd(270_000)],
    });
  });

  it('lets left exceed start when money comes in from savings', () => {
    const topUp = transfer(chart, meta('2026-03-07'), {
      fromId: savings,
      toId: card,
      sent: usd(50_000),
    });
    const figures = poolCycleFigures(view([...ledger, topUp]), today);
    expect(figures.get(budget)).toEqual({
      start: [usd(300_000)],
      left: [usd(320_000)],
    });
  });

  it('gives no figures to a pool that does not count', () => {
    const figures = poolCycleFigures(view(ledger), today);
    expect(figures.has(saved)).toBe(false);
    const on = poolCycleFigures(
      view(ledger, {
        settings: { ...view([]).settings, countSavingsInDaily: true },
      }),
      today,
    );
    // The Savings pool's own switch is still off.
    expect(on.has(saved)).toBe(false);
  });

  it('keeps currencies apart and sorted, and leaves out zero sums', () => {
    const eur = opening(chart, meta('2026-02-18'), {
      accountId: wallet,
      amount: money(40_000, 'EUR'),
    });
    const figures = poolCycleFigures(view([...ledger, eur]), today);
    expect(figures.get(budget)?.start).toEqual([
      money(40_000, 'EUR'),
      usd(300_000),
    ]);
    expect(
      poolCycleFigures(view(ledger, { pools: setup() }), today).get(spare),
    ).toEqual({ start: [], left: [] });
  });

  it('counts an account opened during the cycle in the start', () => {
    const late = openingUsd('2026-03-04', 25_000, cash);
    const figures = poolCycleFigures(view([...ledger, late]), today);
    expect(figures.get(budget)).toEqual({
      start: [usd(325_000)],
      left: [usd(295_000)],
    });
  });

  it('measures the accounts in the pool today, so a move is not spending', () => {
    const v = view([...ledger, openingUsd('2026-02-18', 50_000, cash)], {
      pools: setup([
        {
          id: 'm1',
          accountId: cash,
          poolId: spare,
          effectiveOn: day('2026-03-06'),
          createdAt: '2026-03-06T08:00:00.000Z',
        },
      ]),
    });
    const figures = poolCycleFigures(v, today);
    expect(figures.get(spare)).toEqual({
      start: [usd(50_000)],
      left: [usd(50_000)],
    });
    expect(figures.get(budget)?.start).toEqual([usd(300_000)]);
  });

  it('changes the start when an entry is back-dated before the cycle', () => {
    const before = poolCycleFigures(view(ledger), today);
    const after = poolCycleFigures(
      view([...ledger, spend('2026-02-25', 10_000)]),
      today,
    );
    expect(before.get(budget)?.start).toEqual([usd(300_000)]);
    expect(after.get(budget)?.start).toEqual([usd(290_000)]);
  });

  it('leaves out entries dated after today', () => {
    const figures = poolCycleFigures(
      view([...ledger, spend('2026-03-20', 5_000)]),
      today,
    );
    expect(figures.get(budget)?.left).toEqual([usd(270_000)]);
  });
});
