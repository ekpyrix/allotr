import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  accountId,
  borrow,
  budgetFold,
  budgetId,
  budgetStatus,
  categoryId,
  chartOf,
  cycleSnapshot,
  cyclesOf,
  dailyFiguresOn,
  income,
  iouId,
  iouStatuses,
  iouTotals,
  lend,
  netWorthOn,
  opening,
  repayment,
  transactionId,
  writeOffReceivable,
  type Account,
  type Budget,
  type Iou,
  type IouSettlement,
  type LedgerView,
  type SystemRole,
  type Transaction,
} from '@allotr/core';
import { currencyCode, localDate, money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';

// Replays testdata/golden/ious/*.json: a small ledger whose entries lend,
// borrow, split, repay or write off, against figures worked out by hand.
// Made-up amounts and names only.

type Owed = { person: string; amountMinor: number; due?: string };
type Row = { id: string; on: string; account?: string } & (
  | { kind: 'opening' | 'paycheck'; amountMinor: number }
  | { kind: 'lend' | 'borrow'; owed: Owed[] }
  | { kind: 'split'; owed: Owed[]; ownMinor: number; category: string }
  | { kind: 'repayment'; settles: { iou: string; amountMinor: number }[] }
  | {
      kind: 'write_off';
      category: string;
      settles: { iou: string; amountMinor: number }[];
    }
);

type Fixture = {
  description: string;
  today: string;
  ledger: Row[];
  budgets: {
    id: string;
    target: { kind: 'category'; category: string } | { kind: 'buffer' };
    mode: 'daily' | 'set-aside';
    leftover: 'free' | 'carry';
    startedOn: string;
    amounts: [string, number][];
  }[];
  expected: {
    onBudget: number;
    available: number;
    reserved: number;
    free: number;
    cycleSpent: number;
    spentToday: number;
    netWorth: number;
    owedToMe: number;
    owedByMe: number;
    fromFree: number;
    fromBuffer: number;
    unbudgeted: number;
    budgets: Record<string, { spent?: number; left: number }>;
    ious: Record<string, { outstanding: number; overdue: boolean }>;
    refills?: Record<
      string,
      { restored: Record<string, number>; toFree: number }
    >;
    categoryTotals?: Record<string, number>;
  };
};

const dir = join(import.meta.dirname, '../../../testdata/golden/ious');
const usdCode = currencyCode('USD');
const usd = (amountMinor: number) => money(amountMinor, 'USD');
const user = (id: string, group: 'on' | 'off'): Account => ({
  id: accountId(id),
  currency: usdCode,
  kind: 'asset',
  systemRole: null,
  budgetGroup: group,
  archived: false,
});
const kinds = {
  expenses: 'expense',
  income: 'income',
  opening: 'equity',
  conversion: 'equity',
  receivables: 'receivable',
  payables: 'payable',
} as const;
const system = (role: SystemRole): Account => ({
  id: accountId(`${role}-USD`),
  currency: usdCode,
  kind: kinds[role],
  systemRole: role,
  budgetGroup: null,
  archived: false,
});
const chart = chartOf([
  user('card-USD', 'on'),
  user('savings-USD', 'off'),
  ...(Object.keys(kinds) as SystemRole[]).map(system),
]);
const salary = categoryId('paycheck');

function build(fixture: Fixture): LedgerView {
  const ious = new Map<string, Iou>();
  const settle = (
    id: string,
    by: Transaction,
    lines: { iou: string; amountMinor: number }[],
    kind: IouSettlement['kind'],
  ) => {
    for (const [i, line] of lines.entries()) {
      const found = ious.get(line.iou);
      if (found === undefined) throw new Error(`no IOU ${line.iou}`);
      ious.set(line.iou, {
        ...found,
        settlements: [
          ...found.settlements,
          {
            id: `${id}:${String(i)}`,
            transactionId: by.id,
            kind,
            amount: usd(line.amountMinor),
            on: by.occurredOn,
            at: by.createdAt,
          },
        ],
      });
    }
  };
  const direction = (iou: string) => {
    const found = ious.get(iou);
    if (found === undefined) throw new Error(`no IOU ${iou}`);
    return found.direction;
  };
  const ledger = fixture.ledger.map((row, i): Transaction => {
    const meta = {
      id: transactionId(row.id),
      occurredOn: localDate(row.on),
      createdAt: `2026-05-01T00:00:00.${String(i).padStart(3, '0')}Z`,
    };
    const account = accountId(row.account ?? 'card-USD');
    const sum = (lines: { amountMinor: number }[]) =>
      usd(lines.reduce((total, l) => total + l.amountMinor, 0));
    const record = (
      entry: Transaction,
      owed: Owed[],
      directionOf: 'owed-to-me' | 'owed-by-me',
    ) => {
      owed.forEach((o, p) =>
        ious.set(`${row.id}:${String(p)}`, {
          id: iouId(`${row.id}:${String(p)}`),
          direction: directionOf,
          person: o.person,
          amount: usd(o.amountMinor),
          originId: entry.id,
          recordedOn: entry.occurredOn,
          dueOn: o.due === undefined ? null : localDate(o.due),
          settlements: [],
        }),
      );
      return entry;
    };
    switch (row.kind) {
      case 'opening':
        return opening(chart, meta, {
          accountId: account,
          amount: usd(row.amountMinor),
        });
      case 'paycheck':
        return income(chart, meta, {
          accountId: account,
          amount: usd(row.amountMinor),
          categoryId: salary,
        });
      case 'lend':
        return record(
          lend(chart, meta, {
            accountId: account,
            owed: row.owed.map((o) => usd(o.amountMinor)),
          }),
          row.owed,
          'owed-to-me',
        );
      case 'split':
        return record(
          lend(chart, meta, {
            accountId: account,
            owed: row.owed.map((o) => usd(o.amountMinor)),
            own: {
              amount: usd(row.ownMinor),
              categoryId: categoryId(row.category),
            },
          }),
          row.owed,
          'owed-to-me',
        );
      case 'borrow':
        return record(
          borrow(chart, meta, {
            accountId: account,
            owed: row.owed.map((o) => usd(o.amountMinor)),
          }),
          row.owed,
          'owed-by-me',
        );
      case 'repayment': {
        const [first] = row.settles;
        const entry = repayment(chart, meta, {
          accountId: account,
          direction: direction(first?.iou ?? ''),
          amount: sum(row.settles),
        });
        settle(row.id, entry, row.settles, 'repayment');
        return entry;
      }
      case 'write_off': {
        const entry = writeOffReceivable(chart, meta, {
          amount: sum(row.settles),
          categoryId: categoryId(row.category),
        });
        settle(row.id, entry, row.settles, 'write-off');
        return entry;
      }
    }
    // The cases above are exhaustive.
    throw new Error('unreachable');
  });
  const budgets = fixture.budgets.map((b): Budget => ({
    id: budgetId(b.id),
    name: b.id,
    target:
      b.target.kind === 'category'
        ? { kind: 'category', categoryId: categoryId(b.target.category) }
        : { kind: 'buffer' },
    mode: b.mode,
    leftover: b.leftover,
    startedOn: localDate(b.startedOn),
    endedOn: null,
    amounts: b.amounts.map(([from, amount]) => ({
      from: localDate(from),
      amount: usd(amount),
    })),
  }));
  return {
    chart,
    ledger,
    paycheckCategories: new Set([salary]),
    settings: {
      defaultCurrency: usdCode,
      startedOn: localDate('2026-02-18'),
      paydayRule: 'fixed',
      paydayDay: 1,
      paydayOverride: null,
    },
    bills: [],
    rates: [],
    budgets: {
      budgets,
      categories: new Map(
        ['food', 'other'].map((name) => [
          categoryId(name),
          { parent: null, mergedInto: null },
        ]),
      ),
      entryTags: new Map(),
    },
    ious: { ious: [...ious.values()], writeOffAfterDays: 90 },
  };
}

const files = readdirSync(dir).filter((name) => name.endsWith('.json'));

describe('IOU golden fixtures', () => {
  it('finds the fixtures', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const fixture = JSON.parse(
      readFileSync(join(dir, file), 'utf8'),
    ) as Fixture;
    it(`${file}: ${fixture.description}`, () => {
      const view = build(fixture);
      const today = localDate(fixture.today);
      const { expected } = fixture;
      const daily = dailyFiguresOn(view, today);
      const status = budgetStatus(view, today);
      const totals = iouTotals(view, today);
      expect({
        onBudget: daily.onBudget.amountMinor,
        available: daily.available.amountMinor,
        reserved: daily.reserved.amountMinor,
        free: status.free.amountMinor,
        cycleSpent: daily.cycleSpent.amountMinor,
        spentToday: daily.spentToday.amountMinor,
        netWorth: netWorthOn(view, today).amount.amountMinor,
        owedToMe: totals.owedToMe.amountMinor,
        owedByMe: totals.owedByMe.amountMinor,
        fromFree: status.covered.fromFree.amountMinor,
        fromBuffer: status.covered.fromBuffer.amountMinor,
        unbudgeted: status.unbudgeted.amountMinor,
      }).toEqual({
        onBudget: expected.onBudget,
        available: expected.available,
        reserved: expected.reserved,
        free: expected.free,
        cycleSpent: expected.cycleSpent,
        spentToday: expected.spentToday,
        netWorth: expected.netWorth,
        owedToMe: expected.owedToMe,
        owedByMe: expected.owedByMe,
        fromFree: expected.fromFree,
        fromBuffer: expected.fromBuffer,
        unbudgeted: expected.unbudgeted,
      });
      for (const [id, want] of Object.entries(expected.budgets)) {
        const line = status.lines.find((l) => l.budget.id === id);
        expect(line, id).toBeDefined();
        expect(line?.left.amountMinor, `${id} left`).toBe(want.left);
        if (want.spent !== undefined) {
          expect(line?.spent.amountMinor, `${id} spent`).toBe(want.spent);
        }
      }
      const statuses = iouStatuses(view, today);
      for (const [id, want] of Object.entries(expected.ious)) {
        const found = statuses.find((s) => s.iou.id === id);
        expect(found, id).toBeDefined();
        expect({
          outstanding: found?.outstanding.amountMinor,
          overdue: found?.overdue,
        }).toEqual(want);
      }
      const fold = budgetFold(view, today);
      for (const [id, want] of Object.entries(expected.refills ?? {})) {
        const refill = fold?.refills.find((r) => r.returnId === id);
        expect({
          restored: Object.fromEntries(
            (refill?.restored ?? []).map((r) => [r.source, Number(r.amount)]),
          ),
          toFree: Number(refill?.toFree ?? -1),
        }).toEqual(want);
      }
      if (expected.categoryTotals !== undefined) {
        const cycle = cyclesOf(view, today).at(-1);
        if (cycle === undefined) throw new Error('no cycle');
        const snapshot = cycleSnapshot(view, cycle, today);
        expect(
          Object.fromEntries(
            snapshot.spending.map((t) => [t.categoryId, t.amount.amountMinor]),
          ),
        ).toEqual(expected.categoryTotals);
      }
    });
  }
});
