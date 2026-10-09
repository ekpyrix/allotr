import { money, type Money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expense, income, transfer } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { food, meta } from '../ledger/testing.ts';
import {
  categoryId,
  transactionId,
  type Transaction,
} from '../ledger/types.ts';
import { payeeKey, topPayees } from './payees.ts';
import { card, cash, chart, day, savings, view, wallet } from './testing.ts';

const usd = (amountMinor: number) => money(amountMinor, 'USD');
const range = { from: day('2026-03-01'), to: day('2026-03-31') };

function buy(
  note: string | null,
  amountMinor: number,
  on = '2026-03-10',
  account = card,
) {
  return expense(chart, meta(on, { note }), {
    accountId: account,
    amount: money(amountMinor, chart.get(account)?.currency ?? 'USD'),
    categoryId: food,
  });
}

describe('payeeKey', () => {
  it('ignores case and stray whitespace', () => {
    expect(payeeKey('  Corner   Cafe ')).toBe('corner cafe');
    expect(payeeKey('CORNER CAFE')).toBe('corner cafe');
  });

  it('has no key for a missing or blank note', () => {
    expect(payeeKey(null)).toBeNull();
    expect(payeeKey('  \t ')).toBeNull();
  });
});

describe('topPayees', () => {
  it('ranks by total, with count and the most used spelling', () => {
    const [group] = topPayees(
      view([
        buy('Corner Cafe', 450),
        buy('corner cafe ', 450, '2026-03-11'),
        buy('Corner Cafe', 300, '2026-03-12'),
        buy('Green Market', 2000),
        buy('Bus', 150),
      ]),
      range,
      10,
    );
    expect(group?.payees).toEqual([
      { payee: 'Green Market', count: 1, total: usd(2000) },
      { payee: 'Corner Cafe', count: 3, total: usd(1200) },
      { payee: 'Bus', count: 1, total: usd(150) },
    ]);
    expect(group?.total).toEqual(usd(3350));
    expect(group?.more).toBe(0);
  });

  it('breaks ties by count, then by name', () => {
    const [group] = topPayees(
      view([
        buy('Beta', 500),
        buy('Alpha', 250),
        buy('Alpha', 250, '2026-03-11'),
        buy('Gamma', 500, '2026-03-12'),
      ]),
      range,
      10,
    );
    expect(group?.payees.map((p) => p.payee)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
  });

  it('cuts at the limit and says how many were left out', () => {
    const [group] = topPayees(
      view([buy('A', 300), buy('B', 200), buy('C', 100)]),
      range,
      2,
    );
    expect(group?.payees.map((p) => p.payee)).toEqual(['A', 'B']);
    expect(group?.more).toBe(1);
  });

  it('counts entries without a note as unnamed, not as a payee', () => {
    const [group] = topPayees(
      view([buy(null, 700), buy('  ', 100), buy('Bus', 150)]),
      range,
      10,
    );
    expect(group?.payees.map((p) => p.payee)).toEqual(['Bus']);
    expect(group?.unnamed).toEqual({ count: 2, total: usd(800) });
    expect(group?.total).toEqual(usd(950));
  });

  it('leaves out entries dated outside the range', () => {
    const [group] = topPayees(
      view([buy('Bus', 150, '2026-02-28'), buy('Bus', 150, '2026-04-01')]),
      range,
      10,
    );
    expect(group).toBeUndefined();
  });

  it('leaves out transfers and income', () => {
    const moved = transfer(chart, meta('2026-03-10', { note: 'Rent' }), {
      fromId: card,
      toId: savings,
      sent: usd(5000),
    });
    const paid = income(chart, meta('2026-03-10', { note: 'Acme' }), {
      accountId: card,
      amount: usd(90000),
      categoryId: food,
    });
    expect(topPayees(view([moved, paid]), range, 10)).toEqual([]);
  });

  it('counts a split once, with all its lines', () => {
    const split = expense(chart, meta('2026-03-10', { note: 'Green Market' }), {
      accountId: card,
      amount: usd(1500),
      lines: [
        { categoryId: food, amount: usd(1000) },
        { categoryId: categoryId('home'), amount: usd(500) },
      ],
    });
    const [group] = topPayees(view([split]), range, 10);
    expect(group?.payees).toEqual([
      { payee: 'Green Market', count: 1, total: usd(1500) },
    ]);
  });

  it('drops an undone entry and its reversal together', () => {
    const bought = buy('Bus', 150);
    const bought2 = buy('Bus', 150, '2026-03-11');
    const ledger: Transaction[] = [bought, bought2];
    const undo = reverse(chart, ledger, bought.id, {
      id: transactionId('undo-1'),
      createdAt: '2026-03-20T12:00:00.000Z',
    });
    const [group] = topPayees(view([...ledger, undo]), range, 10);
    expect(group?.payees).toEqual([
      { payee: 'Bus', count: 1, total: usd(150) },
    ]);
  });

  it('leaves out entries posted by reconciling', () => {
    const adjust = buy('Reconcile', 900);
    const [group] = topPayees(
      view([adjust, buy('Bus', 150)], {
        reconcileAdjustments: new Set([adjust.id]),
      }),
      range,
      10,
    );
    expect(group?.payees.map((p) => p.payee)).toEqual(['Bus']);
  });

  it('keeps each currency on its own, in code order, without converting', () => {
    const groups = topPayees(
      view([
        buy('Cafe', 450),
        buy('Cafe', 900, '2026-03-11', wallet),
        buy('Cafe', 100, '2026-03-12', cash),
      ]),
      range,
      10,
    );
    expect(groups.map((g) => g.currency)).toEqual(['EUR', 'USD']);
    expect(groups[0]?.payees[0]?.total).toEqual(money(900, 'EUR'));
    expect(groups[1]?.payees[0]).toEqual({
      payee: 'Cafe',
      count: 2,
      total: usd(550),
    });
  });
});

describe('topPayees properties', () => {
  const names = ['Alpha', 'alpha ', 'Beta', 'Gamma', 'Delta', null];
  const entries = fc.array(
    fc.record({
      note: fc.constantFrom(...names),
      amount: fc.integer({ min: 1, max: 1_000_000 }),
      date: fc.integer({ min: 1, max: 28 }),
      euro: fc.boolean(),
    }),
    { maxLength: 40 },
  );
  type Entry = {
    note: string | null;
    amount: number;
    date: number;
    euro: boolean;
  };
  const ledgerOf = (xs: readonly Entry[]) =>
    xs.map((x) =>
      buy(
        x.note,
        x.amount,
        `2026-03-${String(x.date).padStart(2, '0')}`,
        x.euro ? wallet : card,
      ),
    );

  it('is ranked in a total order, each payee once', () => {
    fc.assert(
      fc.property(entries, fc.integer({ min: 1, max: 6 }), (xs, limit) => {
        for (const g of topPayees(view(ledgerOf(xs)), range, limit)) {
          expect(g.payees.length).toBeLessThanOrEqual(limit);
          for (let i = 1; i < g.payees.length; i += 1) {
            const a = g.payees[i - 1];
            const b = g.payees[i];
            if (a === undefined || b === undefined) throw new Error('hole');
            expect(
              a.total.amountMinor > b.total.amountMinor ||
                (a.total.amountMinor === b.total.amountMinor &&
                  (a.count > b.count ||
                    (a.count === b.count && a.payee < b.payee))),
            ).toBe(true);
          }
          expect(new Set(g.payees.map((p) => p.payee.toLowerCase())).size).toBe(
            g.payees.length,
          );
        }
      }),
    );
  });

  it('never lists more than was spent, and nothing is lost', () => {
    fc.assert(
      fc.property(entries, fc.integer({ min: 1, max: 6 }), (xs, limit) => {
        const ledger = ledgerOf(xs);
        for (const g of topPayees(view(ledger), range, limit)) {
          const sum = (ms: readonly Money[]) =>
            ms.reduce((s, m) => s + m.amountMinor, 0);
          const listed = sum(g.payees.map((p) => p.total));
          expect(listed).toBeLessThanOrEqual(g.total.amountMinor);
          const everyone = topPayees(view(ledger), range, 1000).find(
            (x) => x.currency === g.currency,
          );
          expect(
            sum((everyone?.payees ?? []).map((p) => p.total)) +
              (everyone?.unnamed?.total.amountMinor ?? 0),
          ).toBe(g.total.amountMinor);
          expect(g.payees.length + g.more).toBe(everyone?.payees.length);
        }
      }),
    );
  });

  it('does not depend on the order of entries', () => {
    fc.assert(
      fc.property(entries, (xs) => {
        const ledger = ledgerOf(xs);
        expect(topPayees(view([...ledger].reverse()), range, 10)).toEqual(
          topPayees(view(ledger), range, 10),
        );
      }),
    );
  });
});
