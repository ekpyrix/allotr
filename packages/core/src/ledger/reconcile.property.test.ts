import { localDate, money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { balanceOf } from './balances.ts';
import { expense, opening } from './build.ts';
import {
  balanceFromOwed,
  reconciliation,
  unrecordedAdjustment,
} from './reconcile.ts';
import { food, meta, testChart, testCurrencies } from './testing.ts';
import { accountId, categoryId, type Transaction } from './types.ts';

// The default reconcile policy (docs/domain.md "Policies") over random
// balances and dates, in 0-, 2- and 3-digit currencies. fast-check prints
// the seed of any failure.

const chart = testChart();
const days = Array.from({ length: 31 }, (_, i) =>
  localDate(`2026-03-${String(i + 1).padStart(2, '0')}`),
);

describe('balanceFromOwed', () => {
  it('compares an amount owed exactly as the negative balance', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...testCurrencies),
        fc.constantFrom(...days),
        fc.integer({ min: -1e9, max: 1e9 }),
        fc.integer({ min: -1e9, max: 1e9 }),
        (currency, on, start, owed) => {
          const card = accountId(`card-${currency}`);
          const ledger: Transaction[] =
            start === 0
              ? []
              : [
                  opening(chart, meta('2026-03-01'), {
                    accountId: card,
                    amount: money(start, currency),
                  }),
                ];
          const stated = balanceFromOwed(money(owed, currency));
          expect(stated).toEqual(money(-owed, currency));
          // Taking it back gives the amount owed again.
          expect(balanceFromOwed(stated)).toEqual(money(owed, currency));
          expect(
            reconciliation(chart, ledger, { accountId: card, stated, on }),
          ).toEqual(
            reconciliation(chart, ledger, {
              accountId: card,
              stated: money(-owed, currency),
              on,
            }),
          );
        },
      ),
    );
  });
});

describe('unrecordedAdjustment', () => {
  it('brings the balance on that date to the stated one, debts included', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...testCurrencies),
        fc.constantFrom(...days),
        fc.integer({ min: -1e9, max: 1e9 }),
        fc.integer({ min: -1e9, max: 1e9 }),
        (currency, on, start, stated) => {
          const card = accountId(`card-${currency}`);
          const ledger: Transaction[] = [
            ...(start === 0
              ? []
              : [
                  opening(chart, meta('2026-03-01'), {
                    accountId: card,
                    amount: money(start, currency),
                  }),
                ]),
            expense(chart, meta('2026-03-15'), {
              accountId: card,
              amount: money(700, currency),
              categoryId: food,
            }),
          ];
          const before = reconciliation(chart, ledger, {
            accountId: card,
            stated: money(stated, currency),
            on,
          });
          fc.pre(before.difference.amountMinor !== 0);
          const adjustment = unrecordedAdjustment(chart, meta(on), {
            accountId: card,
            difference: before.difference,
            categoryId: categoryId('unrecorded'),
          });
          // Invariant 1 holds through `commit`; the balance now matches.
          const adjusted = [...ledger, adjustment];
          expect(balanceOf(chart, adjusted, card, on)).toEqual(
            money(stated, currency),
          );
          expect(
            reconciliation(chart, adjusted, {
              accountId: card,
              stated: money(stated, currency),
              on,
            }).difference.amountMinor,
          ).toBe(0);
          // Every later day moves by the same amount.
          expect(balanceOf(chart, adjusted, card).amountMinor).toBe(
            balanceOf(chart, ledger, card).amountMinor +
              before.difference.amountMinor,
          );
        },
      ),
    );
  });
});
