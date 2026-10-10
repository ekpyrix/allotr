import { describe, expect, it } from 'vitest';
import {
  money,
  type LocalDate,
  type ReconcileResultView,
} from '@allotr/shared';
import { historyChart, reconcileOutcome } from './detail-model.ts';

const d = (s: string) => s as LocalDate;
const usd = (minor: number) => money(minor, 'USD');

function result(
  stated: number,
  ledger: number,
  reconciled = false,
): ReconcileResultView {
  return {
    on: d('2026-10-01'),
    stated: usd(stated),
    ledgerBalance: usd(ledger),
    difference: usd(stated - ledger),
    reconciled,
    adjustment: null,
  };
}

describe('reconcileOutcome', () => {
  it('reads a match', () => {
    expect(reconcileOutcome(result(500, 500, true), 'balance')).toEqual({
      kind: 'match',
    });
  });

  it('says the bank shows less, and adjusts as an expense', () => {
    expect(reconcileOutcome(result(400, 500), 'balance')).toEqual({
      kind: 'difference',
      says: 'less',
      adjust: 'expense',
      amount: usd(100),
      ledger: usd(500),
      bank: usd(400),
    });
  });

  it('says the bank shows more, and adjusts as income', () => {
    expect(reconcileOutcome(result(650, 500), 'balance')).toMatchObject({
      says: 'more',
      adjust: 'income',
      amount: usd(150),
    });
  });

  it('shows a debt as an amount owed', () => {
    expect(reconcileOutcome(result(-250, -200), 'owed')).toEqual({
      kind: 'difference',
      says: 'owedMore',
      adjust: 'expense',
      amount: usd(50),
      ledger: usd(200),
      bank: usd(250),
    });
    expect(reconcileOutcome(result(-150, -200), 'owed')).toMatchObject({
      says: 'owedLess',
      adjust: 'income',
    });
  });
});

describe('historyChart', () => {
  it('has no ticks without history', () => {
    expect(historyChart([], 'en')).toEqual({
      points: [],
      yTicks: [],
      xTicks: [],
    });
  });

  it('puts days on x and minor units on y, ticking the extremes', () => {
    const chart = historyChart(
      [
        { date: d('2026-10-01'), balance: usd(100) },
        { date: d('2026-10-02'), balance: usd(900) },
        { date: d('2026-10-03'), balance: usd(500) },
      ],
      'en',
    );
    expect(chart.points).toEqual([
      { x: 0, y: 100 },
      { x: 1, y: 900 },
      { x: 2, y: 500 },
    ]);
    expect(chart.yTicks.map((t) => t.value)).toEqual([100, 900]);
    expect(chart.xTicks.map((t) => t.value)).toEqual([0, 1, 2]);
  });

  it('ticks once when the balance never moves', () => {
    const chart = historyChart(
      [
        { date: d('2026-10-01'), balance: usd(100) },
        { date: d('2026-10-02'), balance: usd(100) },
      ],
      'en',
    );
    expect(chart.yTicks).toHaveLength(1);
  });
});
