import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { transfer } from '../ledger/build.ts';
import { food, meta, salary } from '../ledger/testing.ts';
import { categoryId } from '../ledger/types.ts';
import { cyclesOf } from './cycles.ts';
import { cycleSnapshot } from './snapshot.ts';
import {
  card,
  chart,
  day,
  openingUsd,
  paycheck,
  savings,
  spend,
  view,
} from './testing.ts';

const usd = (amountMinor: number) => money(amountMinor, 'USD');
const fun = categoryId('fun');

const ledger = [
  openingUsd('2026-02-20', 50000),
  openingUsd('2026-02-20', 400000, savings),
  paycheck('2026-03-01', 300000),
  spend('2026-03-03', 4000),
  spend('2026-03-20', 6000, fun),
  spend('2026-03-21', 1500),
  transfer(chart, meta('2026-03-25'), {
    fromId: card,
    toId: savings,
    sent: usd(50000),
  }),
  paycheck('2026-04-01', 300000),
];
const today = day('2026-04-05');

function marchSnapshot(entries = ledger) {
  const v = view(entries);
  const march = cyclesOf(v, today)[1];
  if (march === undefined) throw new Error('no March cycle');
  return cycleSnapshot(v, march, today);
}

describe('cycleSnapshot', () => {
  it('summarises a closed cycle', () => {
    const snapshot = marchSnapshot();
    expect(snapshot.cycle).toMatchObject({
      openedOn: '2026-03-01',
      closedOn: '2026-04-01',
    });
    expect(snapshot.lastDay).toBe('2026-03-31');
    expect(snapshot.opening.on.get(usd(0).currency)).toEqual(usd(50000));
    expect(snapshot.closing.on.get(usd(0).currency)).toEqual(usd(288500));
    expect(snapshot.income).toEqual([
      { categoryId: salary, amount: usd(300000) },
    ]);
    expect(snapshot.spending).toEqual([
      { categoryId: food, amount: usd(5500) },
      { categoryId: fun, amount: usd(6000) },
    ]);
    expect(snapshot.leftover).toEqual([
      { leftover: usd(288500), carried: usd(288500), swept: usd(0) },
    ]);
    expect(snapshot.savingsNetChange).toEqual([usd(50000)]);
  });

  it('carries a deficit with the default policy', () => {
    const snapshot = marchSnapshot([...ledger, spend('2026-03-28', 300000)]);
    expect(snapshot.leftover).toEqual([
      { leftover: usd(-11500), carried: usd(-11500), swept: usd(0) },
    ]);
  });

  it('is recomputed when an entry is back-dated into the closed cycle', () => {
    const amended = marchSnapshot([...ledger, spend('2026-03-10', 2500)]);
    expect(amended.spending[0]).toEqual({
      categoryId: food,
      amount: usd(8000),
    });
    expect(amended.leftover[0]?.leftover).toEqual(usd(286000));
  });

  it('runs an open cycle up to today', () => {
    const v = view(ledger);
    const open = cyclesOf(v, today).at(-1);
    if (open === undefined) throw new Error('no open cycle');
    expect(cycleSnapshot(v, open, today).lastDay).toBe('2026-04-05');
  });
});
