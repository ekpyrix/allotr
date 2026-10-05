import { addDays, localDate, money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expense } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { food } from '../ledger/testing.ts';
import {
  categoryId,
  transactionId,
  type Transaction,
} from '../ledger/types.ts';
import {
  budgetId,
  heldBy,
  leftOf,
  type Budget,
  type BudgetSetup,
  type CoverRequest,
  type CoverSource,
} from './budgets.ts';
import { budgetFold, dailyFiguresOn } from './daily.ts';
import {
  card,
  chart,
  openingUsd,
  paycheck,
  settings,
  view,
} from './testing.ts';
import type { LedgerView } from './types.ts';

// Cover and refill invariants over random ledgers, budgets, cover orders,
// overrides and returns (ADR 0021): covers never exceed what a source had,
// cover plus what the budget paid itself equals the entry amount, a refill
// never restores more than was taken, and replaying gives the same numbers.
// fast-check prints the seed of any failure.

const travel = categoryId('travel');
const other = categoryId('other');
const categories = [food, travel, other];
const march = localDate('2026-03-01');

const categoryMap = new Map([
  [food, { parent: null, mergedInto: null }],
  [travel, { parent: null, mergedInto: null }],
  [other, { parent: null, mergedInto: null }],
]);

const spendArb = fc.record({
  offset: fc.nat(35),
  amount: fc.integer({ min: 1, max: 120_000 }),
  category: fc.constantFrom(...categories),
  undone: fc.boolean(),
});
type Spend = {
  offset: number;
  amount: number;
  category: (typeof categories)[number];
  undone: boolean;
};

// Built once so every view of a run shares the same entry IDs.
const fixed: readonly Transaction[] = [
  openingUsd('2026-02-18', 300_000, card),
  paycheck('2026-03-01', 150_000),
  paycheck('2026-04-01', 150_000),
];

function ledgerOf(spends: readonly Spend[]): Transaction[] {
  const ledger: Transaction[] = [...fixed];
  spends.forEach((s, i) => {
    const entry = expense(
      chart,
      {
        id: transactionId(`s${String(i).padStart(4, '0')}`),
        occurredOn: addDays(march, s.offset),
        createdAt: `2026-05-01T00:00:00.${String(i).padStart(3, '0')}Z`,
      },
      {
        accountId: card,
        amount: money(s.amount, 'USD'),
        categoryId: s.category,
      },
    );
    ledger.push(entry);
    if (s.undone) {
      ledger.push(
        reverse(chart, ledger, entry.id, {
          id: transactionId(`u${String(i).padStart(4, '0')}`),
          createdAt: `2026-05-02T00:00:00.${String(i).padStart(3, '0')}Z`,
        }),
      );
    }
  });
  return ledger;
}

const budgetsArb = fc.record({
  food: fc.record({
    amount: fc.integer({ min: 1, max: 100_000 }),
    mode: fc.constantFrom('daily' as const, 'set-aside' as const),
    leftover: fc.constantFrom('free' as const, 'carry' as const),
  }),
  travel: fc.record({
    amount: fc.integer({ min: 1, max: 100_000 }),
    mode: fc.constantFrom('daily' as const, 'set-aside' as const),
    leftover: fc.constantFrom('free' as const, 'carry' as const),
  }),
  buffer: fc.integer({ min: 0, max: 100_000 }),
});

type Plan = {
  mode: Budget['mode'];
  leftover: Budget['leftover'];
  amount: number;
};

function budgetsOf(specs: {
  food: Plan;
  travel: Plan;
  buffer: number;
}): Budget[] {
  const make = (
    id: string,
    target: Budget['target'],
    amount: number,
    mode: Budget['mode'],
    leftover: Budget['leftover'],
  ): Budget => ({
    id: budgetId(id),
    name: id,
    target,
    mode,
    leftover,
    startedOn: march,
    endedOn: null,
    amounts: [{ from: march, amount: money(amount, 'USD') }],
  });
  return [
    make(
      'food',
      { kind: 'category', categoryId: food },
      specs.food.amount,
      specs.food.mode,
      specs.food.leftover,
    ),
    make(
      'travel',
      { kind: 'category', categoryId: travel },
      specs.travel.amount,
      specs.travel.mode,
      specs.travel.leftover,
    ),
    make('buffer', { kind: 'buffer' }, specs.buffer, 'set-aside', 'carry'),
  ];
}

const sources: CoverSource[] = [
  'free',
  budgetId('food'),
  budgetId('travel'),
  budgetId('buffer'),
];
const orderArb = fc.shuffledSubarray(sources);
const todayArb = fc.nat(45).map((n) => addDays(localDate('2026-03-05'), n));
const spendsArb = fc.array(spendArb, { maxLength: 12 });

function make(
  spends: readonly Spend[],
  budgets: readonly Budget[],
  extra: Partial<BudgetSetup> = {},
  overrides: Partial<LedgerView> = {},
): LedgerView {
  const setup: BudgetSetup = {
    budgets,
    categories: categoryMap,
    entryTags: new Map(),
    ...extra,
  };
  return view(ledgerOf(spends), { budgets: setup, ...overrides });
}

const requestsArb = fc.array(
  fc.record({
    index: fc.nat(11),
    source: fc.constantFrom(...sources),
    amount: fc.integer({ min: 1, max: 150_000 }),
  }),
  { maxLength: 6 },
);

function overridesOf(
  spends: readonly Spend[],
  requests: readonly { index: number; source: CoverSource; amount: number }[],
): Map<Transaction['id'], CoverRequest[]> {
  const map = new Map<Transaction['id'], CoverRequest[]>();
  for (const r of requests) {
    if (r.index >= spends.length) continue;
    const id = transactionId(`s${String(r.index).padStart(4, '0')}`);
    const list = map.get(id) ?? [];
    if (!list.some((x) => x.source === r.source)) {
      list.push({ source: r.source, amount: money(r.amount, 'USD') });
    }
    map.set(id, list);
  }
  return map;
}

function returnsOf(
  spends: readonly Spend[],
  picks: readonly { index: number; amount: number; offset: number }[],
) {
  return picks
    .filter((p) => p.index < spends.length)
    .map((p, i) => ({
      id: `r${String(i)}`,
      against: transactionId(`s${String(p.index).padStart(4, '0')}`),
      amount: money(p.amount, 'USD'),
      on: addDays(march, p.offset),
      at: `2026-05-03T00:00:00.${String(i).padStart(3, '0')}Z`,
    }));
}

const picksArb = fc.array(
  fc.record({
    index: fc.nat(11),
    amount: fc.integer({ min: 1, max: 150_000 }),
    offset: fc.nat(40),
  }),
  { maxLength: 4 },
);

describe('cover properties', () => {
  it('splits every line into its own part, what covered it and what is uncovered', () => {
    fc.assert(
      fc.property(
        spendsArb,
        budgetsArb,
        orderArb,
        requestsArb,
        todayArb,
        (spends, specs, order, requests, today) => {
          const v = make(spends, budgetsOf(specs), {
            coverOrder: order,
            coverOverrides: overridesOf(spends, requests),
          });
          const fold = budgetFold(v, today);
          for (const line of fold?.spend ?? []) {
            const covered = line.covers.reduce((s, c) => s + c.amount, 0n);
            expect(line.own + covered + line.uncovered).toBe(line.amount);
            expect(line.own >= 0n && line.uncovered >= 0n).toBe(true);
            for (const c of line.covers) expect(c.amount > 0n).toBe(true);
            expect(line.covers.length).toBe(
              new Set(line.covers.map((c) => c.source)).size,
            );
            if (line.budgetId === null) expect(line.own).toBe(0n);
            // A budget never covers its own shortfall.
            expect(line.covers.some((c) => c.source === line.budgetId)).toBe(
              false,
            );
          }
        },
      ),
    );
  });

  it('never takes more from a budget than it had', () => {
    fc.assert(
      fc.property(
        spendsArb,
        budgetsArb,
        orderArb,
        requestsArb,
        todayArb,
        (spends, specs, order, requests, today) => {
          const v = make(spends, budgetsOf(specs), {
            coverOrder: order,
            coverOverrides: overridesOf(spends, requests),
          });
          const fold = budgetFold(v, today);
          for (const line of fold?.lines ?? []) {
            // Without refills a budget only loses money over a period, so
            // ending at zero or more means it was never overdrawn.
            expect(leftOf(line) >= 0n).toBe(true);
            expect(line.coveredOut >= 0n && line.overflow >= 0n).toBe(true);
            expect(line.carriedIn >= 0n).toBe(true);
            expect(heldBy(line) >= 0n).toBe(true);
          }
        },
      ),
    );
  });

  it('keeps free money plentiful from touching any other source', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50_000 }),
        budgetsArb,
        fc.constantFrom(food, travel, other),
        (amount, specs, category) => {
          // $3,000 counted and at most $2,000 held leaves $1,000 free: any
          // line of up to $500 is paid by its budget and free money alone.
          const spends: Spend[] = [
            { offset: 6, amount, category, undone: false },
          ];
          const v = make(spends, budgetsOf(specs), {
            coverOrder: ['free', ...sources.slice(1)],
          });
          const line = budgetFold(v, localDate('2026-03-10'))?.spend[0];
          if (line === undefined) return;
          for (const c of line.covers) {
            if (c.source !== 'free') throw new Error('touched a budget');
          }
          expect(line.uncovered).toBe(0n);
        },
      ),
    );
  });

  it('lets free money cover exactly what it had after the line paid its own part', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 600_000 }),
        budgetsArb,
        fc.constantFrom(food, travel, other),
        (amount, specs, category) => {
          const budgets = budgetsOf(specs);
          const v = make(
            [{ offset: 6, amount, category, undone: false }],
            budgets,
            { coverOrder: ['free'] },
          );
          const line = budgetFold(v, localDate('2026-03-10'))?.spend[0];
          if (line === undefined) return;
          // $4,500 was counted before the spend. Set-aside budgets hold their
          // planned amount; a daily budget's own part lands on free money.
          const held = budgets
            .filter((b) => b.mode === 'set-aside')
            .reduce(
              (sum, b) => sum + (b.amounts[0]?.amount.amountMinor ?? 0),
              0,
            );
          const own = budgets.find((b) => b.id === line.budgetId);
          const ownOnFree = own?.mode === 'daily' ? Number(line.own) : 0;
          const free = Math.max(0, 450_000 - held - ownOnFree);
          const shortfall = Number(line.amount - line.own);
          const free_ = line.covers.find((c) => c.source === 'free');
          expect(Number(free_?.amount ?? 0n)).toBe(Math.min(shortfall, free));
          // What free money could not cover goes down the rest of the order.
          const others = line.covers
            .filter((c) => c.source !== 'free')
            .reduce((sum, c) => sum + Number(c.amount), 0);
          expect(others + Number(line.uncovered)).toBe(
            shortfall - Math.min(shortfall, free),
          );
        },
      ),
    );
  });

  it('restores no more than the cover took, and sends the rest to free money', () => {
    fc.assert(
      fc.property(
        spendsArb,
        budgetsArb,
        orderArb,
        picksArb,
        todayArb,
        (spends, specs, order, picks, today) => {
          const returns = returnsOf(spends, picks);
          const v = make(spends, budgetsOf(specs), {
            coverOrder: order,
            returns,
          });
          const fold = budgetFold(v, today);
          const takenBy = new Map<string, bigint>();
          for (const line of fold?.spend ?? []) {
            for (const c of line.covers) {
              const key = `${line.entryId}|${c.source}`;
              takenBy.set(key, (takenBy.get(key) ?? 0n) + c.amount);
            }
          }
          const restoredBy = new Map<string, bigint>();
          for (const refill of fold?.refills ?? []) {
            const ret = returns.find((r) => r.id === refill.returnId);
            const restored = refill.restored.reduce((s, r) => s + r.amount, 0n);
            expect(restored + refill.toFree).toBe(
              BigInt(ret?.amount.amountMinor ?? 0),
            );
            for (const r of refill.restored) {
              expect(r.source).not.toBe('free');
              const key = `${ret?.against ?? ''}|${r.source}`;
              restoredBy.set(key, (restoredBy.get(key) ?? 0n) + r.amount);
            }
          }
          for (const [key, restored] of restoredBy) {
            expect(restored <= (takenBy.get(key) ?? 0n)).toBe(true);
          }
        },
      ),
    );
  });

  it('keeps spent plus refunds equal to the net expense', () => {
    fc.assert(
      fc.property(
        spendsArb,
        budgetsArb,
        orderArb,
        picksArb,
        // Within the first period, so every refund lands where its entry did.
        fc.nat(26).map((n) => addDays(localDate('2026-03-05'), n)),
        (spends, specs, order, picks, today) => {
          const returns = returnsOf(spends, picks);
          const v = make(spends, budgetsOf(specs), {
            coverOrder: order,
            returns,
          });
          const fold = budgetFold(v, today);
          // Each entry is one line: a refund takes back what is left of it,
          // and one dated before the entry finds nothing yet.
          const net = new Map<string, bigint>();
          const dated = new Map<string, string>();
          for (const line of fold?.spend ?? []) {
            net.set(line.entryId, line.amount);
            dated.set(line.entryId, line.date);
          }
          let refunded = 0n;
          const later = [...returns]
            .filter((r) => r.on <= today)
            .sort(
              (a, b) =>
                a.on.localeCompare(b.on) ||
                a.at.localeCompare(b.at) ||
                a.id.localeCompare(b.id),
            );
          for (const r of later) {
            const left = net.get(r.against) ?? 0n;
            if ((dated.get(r.against) ?? '9') > r.on) continue;
            const give = BigInt(r.amount.amountMinor);
            const taken = give < left ? give : left;
            net.set(r.against, left - taken);
            refunded += taken;
          }
          const gross = (fold?.spend ?? []).reduce((s, l) => s + l.amount, 0n);
          const spent = (fold?.lines ?? []).reduce((s, l) => s + l.spent, 0n);
          expect(spent + (fold?.unbudgeted ?? 0n) + refunded).toBe(gross);
          for (const l of fold?.lines ?? []) {
            expect(l.overflow >= 0n && l.overflow <= l.spent).toBe(true);
          }
        },
      ),
    );
  });

  it('gives the same numbers when replayed, whatever order the ledger arrives in', () => {
    fc.assert(
      fc.property(
        spendsArb,
        budgetsArb,
        orderArb,
        requestsArb,
        picksArb,
        todayArb,
        (spends, specs, order, requests, picks, today) => {
          const v = make(spends, budgetsOf(specs), {
            coverOrder: order,
            coverOverrides: overridesOf(spends, requests),
            returns: returnsOf(spends, picks),
          });
          const shuffled = { ...v, ledger: [...v.ledger].reverse() };
          const a = budgetFold(v, today);
          const b = budgetFold(shuffled, today);
          expect(b).toEqual(a);
          expect(budgetFold(v, today)).toEqual(a);
          expect(dailyFiguresOn(shuffled, today)).toEqual(
            dailyFiguresOn(v, today),
          );
        },
      ),
    );
  });

  it('keeps the free-money daily number at available less holds', () => {
    fc.assert(
      fc.property(
        spendsArb,
        budgetsArb,
        orderArb,
        todayArb,
        (spends, specs, order, today) => {
          const v = make(
            spends,
            budgetsOf(specs),
            { coverOrder: order },
            {
              settings: settings({ dailyMode: 'free' }),
            },
          );
          const figures = dailyFiguresOn(v, today);
          expect(figures.free.amountMinor).toBe(
            figures.available.amountMinor - figures.held.amountMinor,
          );
          const fold = budgetFold(v, today);
          const held = (fold?.lines ?? []).reduce((s, l) => s + heldBy(l), 0n);
          expect(BigInt(figures.held.amountMinor)).toBe(held);
          for (const l of fold?.spend ?? []) {
            expect(l.fromHold >= 0n && l.fromHold <= l.amount).toBe(true);
          }
        },
      ),
    );
  });
});
