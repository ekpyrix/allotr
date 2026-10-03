import { addDays, localDate, money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { borrow, lend, repayment, writeOffReceivable } from '../ledger/ious.ts';
import { reverse } from '../ledger/reverse.ts';
import { food } from '../ledger/testing.ts';
import { transactionId, type Transaction } from '../ledger/types.ts';
import { budgetStatus } from './budget-status.ts';
import { budgetId, type Budget, type BudgetSetup } from './budgets.ts';
import { budgetFold, dailyFiguresOn, owedSums, spentSums } from './daily.ts';
import {
  iouBalanceGaps,
  iouId,
  iouStatuses,
  type Iou,
  type IouSettlement,
} from './ious.ts';
import { card, chart, openingUsd, paycheck, spend, view } from './testing.ts';
import type { LedgerView } from './types.ts';

// IOU invariants over random sequences of loans, split bills, borrowing,
// repayments, write-offs and undos (ADR 0024): the ledger always balances
// per currency (every entry goes through core's checks), the Receivables and
// Payables accounts always equal what the IOUs say is outstanding, a refill
// never restores more than was taken or repaid, a settled IOU leaves no
// reserve, loans never count as spending, and replaying the ledger in any
// order gives the same numbers. fast-check prints the seed of any failure.

const march = localDate('2026-03-01');
const usd = (amountMinor: number) => money(amountMinor, 'USD');

type Op =
  | {
      kind: 'lend';
      offset: number;
      people: number[];
      own: number;
      due: number | null;
    }
  | { kind: 'borrow'; offset: number; amount: number; due: number | null }
  | { kind: 'repay'; pick: number; percent: number; after: number }
  | { kind: 'writeOff'; pick: number; after: number }
  | { kind: 'undo'; pick: number }
  | { kind: 'spend'; offset: number; amount: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant('lend' as const),
    offset: fc.nat(30),
    people: fc.array(fc.integer({ min: 1, max: 90_000 }), {
      minLength: 1,
      maxLength: 3,
    }),
    own: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 40_000 })),
    due: fc.option(fc.nat(60), { nil: null }),
  }),
  fc.record({
    kind: fc.constant('borrow' as const),
    offset: fc.nat(30),
    amount: fc.integer({ min: 1, max: 90_000 }),
    due: fc.option(fc.nat(60), { nil: null }),
  }),
  fc.record({
    kind: fc.constant('repay' as const),
    pick: fc.nat(20),
    percent: fc.integer({ min: 1, max: 100 }),
    after: fc.nat(20),
  }),
  fc.record({
    kind: fc.constant('writeOff' as const),
    pick: fc.nat(20),
    after: fc.nat(20),
  }),
  fc.record({ kind: fc.constant('undo' as const), pick: fc.nat(20) }),
  fc.record({
    kind: fc.constant('spend' as const),
    offset: fc.nat(30),
    amount: fc.integer({ min: 1, max: 60_000 }),
  }),
);

const budgets: BudgetSetup = {
  budgets: [
    {
      id: budgetId('food'),
      name: 'Food',
      target: { kind: 'category', categoryId: food },
      mode: 'daily',
      leftover: 'free',
      startedOn: march,
      endedOn: null,
      amounts: [{ from: march, amount: usd(100_000) }],
    } satisfies Budget,
    {
      id: budgetId('buffer'),
      name: 'Buffer',
      target: { kind: 'buffer' },
      mode: 'set-aside',
      leftover: 'carry',
      startedOn: march,
      endedOn: null,
      amounts: [{ from: march, amount: usd(200_000) }],
    } satisfies Budget,
  ],
  categories: new Map([[food, { parent: null, mergedInto: null }]]),
  entryTags: new Map(),
};

const fixed: readonly Transaction[] = [
  openingUsd('2026-02-18', 400_000, card),
  paycheck('2026-03-01', 150_000),
  paycheck('2026-04-01', 150_000),
];
const today = addDays(march, 45);

type Built = { ledger: Transaction[]; ious: Iou[]; ownSpent: number };

// Plays the operations the way the server does: an entry and its IOU rows
// together, a repayment only against what is outstanding, and an undo of an
// origin only once nothing live settles it.
function play(ops: readonly Op[]): Built {
  const ledger: Transaction[] = [...fixed];
  const ious: Iou[] = [];
  const undone = new Set<string>();
  let n = 0;
  const entryMeta = (offset: number) => {
    n += 1;
    return {
      id: transactionId(`x${String(n).padStart(4, '0')}`),
      occurredOn: addDays(march, offset),
      createdAt: `2026-05-01T00:00:00.${String(n).padStart(3, '0')}Z`,
    };
  };
  const live = (i: Iou) => !undone.has(i.originId);
  const settled = (i: Iou) =>
    i.settlements
      .filter((s) => !undone.has(s.transactionId))
      .reduce((sum, s) => sum + s.amount.amountMinor, 0);
  const outstanding = (i: Iou) => i.amount.amountMinor - settled(i);
  const mutate = (i: Iou, s: IouSettlement) => {
    ious[ious.indexOf(i)] = { ...i, settlements: [...i.settlements, s] };
  };

  for (const op of ops) {
    if (op.kind === 'lend') {
      const m = entryMeta(op.offset);
      const entry = lend(chart, m, {
        accountId: card,
        owed: op.people.map(usd),
        ...(op.own === 0
          ? {}
          : { own: { amount: usd(op.own), categoryId: food } }),
      });
      ledger.push(entry);
      op.people.forEach((amount, i) =>
        ious.push({
          id: iouId(`${m.id}-${String(i)}`),
          direction: 'owed-to-me',
          person: `Person ${String(i)}`,
          amount: usd(amount),
          originId: entry.id,
          recordedOn: m.occurredOn,
          dueOn: op.due === null ? null : addDays(m.occurredOn, op.due),
          settlements: [],
        }),
      );
    } else if (op.kind === 'borrow') {
      const m = entryMeta(op.offset);
      const entry = borrow(chart, m, {
        accountId: card,
        owed: [usd(op.amount)],
      });
      ledger.push(entry);
      ious.push({
        id: iouId(`${m.id}-0`),
        direction: 'owed-by-me',
        person: 'Person 0',
        amount: usd(op.amount),
        originId: entry.id,
        recordedOn: m.occurredOn,
        dueOn: op.due === null ? null : addDays(m.occurredOn, op.due),
        settlements: [],
      });
    } else if (op.kind === 'spend') {
      const entry = spend(addDays(march, op.offset), op.amount, food);
      ledger.push(entry);
    } else if (op.kind === 'repay' || op.kind === 'writeOff') {
      const open = ious.filter(
        (i) =>
          live(i) &&
          outstanding(i) > 0 &&
          (op.kind === 'repay' || i.direction === 'owed-to-me'),
      );
      const target = open[op.pick % Math.max(1, open.length)];
      if (target === undefined) continue;
      const left = outstanding(target);
      const day = addDays(
        target.recordedOn,
        op.kind === 'repay' ? op.after : op.after + 1,
      );
      const m = { ...entryMeta(0), occurredOn: day };
      if (op.kind === 'repay') {
        const amount = Math.max(1, Math.floor((left * op.percent) / 100));
        ledger.push(
          repayment(chart, m, {
            accountId: card,
            direction: target.direction,
            amount: usd(amount),
          }),
        );
        mutate(target, {
          id: `s-${m.id}`,
          transactionId: m.id,
          kind: 'repayment',
          amount: usd(amount),
          on: day,
          at: m.createdAt,
        });
      } else {
        ledger.push(
          writeOffReceivable(chart, m, { amount: usd(left), categoryId: food }),
        );
        mutate(target, {
          id: `s-${m.id}`,
          transactionId: m.id,
          kind: 'write-off',
          amount: usd(left),
          on: day,
          at: m.createdAt,
        });
      }
    } else {
      // Undo a repayment or write-off, or an origin nothing live settles.
      const candidates = ledger.filter((t) => {
        if (t.kind === 'reversal' || undone.has(t.id) || fixed.includes(t)) {
          return false;
        }
        const origin = ious.filter((i) => i.originId === t.id);
        return origin.every((i) =>
          i.settlements.every((s) => undone.has(s.transactionId)),
        );
      });
      const target = candidates[op.pick % Math.max(1, candidates.length)];
      if (target === undefined) continue;
      const m = entryMeta(0);
      ledger.push(
        reverse(chart, ledger, target.id, { id: m.id, createdAt: m.createdAt }),
      );
      undone.add(target.id);
    }
  }
  // Expenses the user really paid: not write-offs, which move no cash.
  const spentOwn = ledger
    .filter(
      (t) =>
        t.kind !== 'reversal' && t.kind !== 'write_off' && !undone.has(t.id),
    )
    .flatMap((t) =>
      t.postings.filter(
        (p) =>
          chart.get(p.accountId)?.systemRole === 'expenses' &&
          p.amount.amountMinor > 0,
      ),
    );
  const ownSpent = spentOwn.reduce((sum, p) => sum + p.amount.amountMinor, 0);
  return { ledger, ious, ownSpent };
}

function viewOf(built: Built, ledger = built.ledger): LedgerView {
  return view(ledger, {
    budgets,
    ious: { ious: built.ious, writeOffAfterDays: 30 },
  });
}

const opsArb = fc.array(opArb, { minLength: 1, maxLength: 14 });

describe('IOU invariants', () => {
  it('keeps Receivables and Payables equal to what the IOUs say is outstanding', () => {
    fc.assert(
      fc.property(opsArb, fc.nat(45), (ops, offset) => {
        const built = play(ops);
        const v = viewOf(built);
        expect(iouBalanceGaps(v, addDays(march, offset)).size).toBe(0);
      }),
    );
  });

  it('reserves exactly what is still owed, so a settled IOU leaves no reserve', () => {
    fc.assert(
      fc.property(opsArb, fc.nat(45), (ops, offset) => {
        const built = play(ops);
        const v = viewOf(built);
        const date = addDays(march, offset);
        const owed = iouStatuses(v, date)
          .filter((s) => s.iou.direction === 'owed-by-me')
          .reduce((sum, s) => sum + s.outstanding.amountMinor, 0);
        expect(Number(owedSums(v, date).get(usd(0).currency) ?? 0n)).toBe(owed);
      }),
    );
  });

  it('never refills more than the loans took or the repayments brought back', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const built = play(ops);
        const v = viewOf(built);
        const fold = budgetFold(v, today);
        expect(fold).not.toBeNull();
        const taken = (fold?.spend ?? [])
          .filter((l) => l.loan)
          .reduce(
            (sum, l) =>
              sum +
              l.covers
                .filter((c) => c.source !== 'free')
                .reduce((s, c) => s + c.amount, 0n),
            0n,
          );
        let restored = 0n;
        for (const refill of fold?.refills ?? []) {
          const part = refill.restored.reduce((s, r) => s + r.amount, 0n);
          restored += part;
          expect(part).toBeGreaterThanOrEqual(0n);
          expect(refill.toFree).toBeGreaterThanOrEqual(0n);
        }
        expect(restored).toBeLessThanOrEqual(taken);
      }),
    );
  });

  it('covers a loan exactly: cover plus what was uncovered equals the loan', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const built = play(ops);
        const fold = budgetFold(viewOf(built), today);
        for (const line of fold?.spend ?? []) {
          const covered = line.covers.reduce((s, c) => s + c.amount, 0n);
          expect(line.own + covered + line.uncovered).toBe(line.amount);
          if (line.loan) expect(line.own).toBe(0n);
        }
      }),
    );
  });

  it('never counts a loan as spending', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const built = play(ops);
        const v = viewOf(built);
        const daily = dailyFiguresOn(v, today);
        // Spending is the expense postings of live entries and nothing else.
        expect(daily.cycleSpent.amountMinor).toBeLessThanOrEqual(
          built.ownSpent,
        );
        expect(
          spentSums(v, march, today).spent.get(usd(0).currency) ?? 0n,
        ).toBe(BigInt(built.ownSpent));
        const status = budgetStatus(v, today);
        expect(status.unbudgeted.amountMinor).toBeGreaterThanOrEqual(0);
        const budgeted = status.lines.reduce(
          (s, l) => s + l.spent.amountMinor,
          0,
        );
        expect(budgeted + status.unbudgeted.amountMinor).toBeLessThanOrEqual(
          built.ownSpent,
        );
      }),
    );
  });

  it('gives the same numbers when the ledger is replayed in any order', () => {
    fc.assert(
      fc.property(opsArb, fc.infiniteStream(fc.nat()), (ops, stream) => {
        const built = play(ops);
        const shuffled = [...built.ledger]
          .map((t) => [t, stream.next().value as number] as const)
          .sort((a, b) => a[1] - b[1])
          .map(([t]) => t);
        const a = viewOf(built);
        const b = viewOf(built, shuffled);
        expect(dailyFiguresOn(a, today)).toEqual(dailyFiguresOn(b, today));
        expect(budgetStatus(a, today)).toEqual(budgetStatus(b, today));
        expect(iouStatuses(a, today)).toEqual(iouStatuses(b, today));
      }),
    );
  });

  it('ties free money to the ledger: available is the counted balance less what is owed', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const built = play(ops);
        const v = viewOf(built);
        const daily = dailyFiguresOn(v, today);
        const owed = Number(owedSums(v, today).get(usd(0).currency) ?? 0n);
        expect(daily.reserved.amountMinor).toBe(owed);
        expect(daily.available.amountMinor).toBe(
          daily.onBudget.amountMinor - owed,
        );
      }),
    );
  });
});
