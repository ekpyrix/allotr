import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  accountId,
  budgetId,
  budgetStatus,
  categoryId,
  chartOf,
  expense,
  income,
  opening,
  tagId,
  transactionId,
  type Account,
  type Budget,
  type BudgetSetup,
  type DailyMode,
  type LedgerView,
  type Transaction,
} from '@allotr/core';
import { currencyCode, localDate, money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';

// Replays testdata/golden/budgets/*.json: a small ledger, the budgets and the
// day to look at, against figures worked out by hand. Made-up amounts only.

type Fixture = {
  description: string;
  today: string;
  settings?: { dailyMode?: DailyMode; budgetPeriod?: 'cycle' | 'month' };
  categories: Record<string, string | null>;
  ledger: {
    id: string;
    kind: 'opening' | 'paycheck' | 'expense';
    on: string;
    account: string;
    amountMinor: number;
    category?: string;
    tags?: string[];
  }[];
  budgets: {
    id: string;
    target:
      | { kind: 'category'; category: string }
      | { kind: 'tag'; tag: string }
      | { kind: 'buffer' };
    mode: 'daily' | 'set-aside';
    leftover: 'free' | 'carry';
    startedOn: string;
    amounts: [string, number][];
  }[];
  expected: {
    available: number;
    held: number;
    free: number;
    dailyLeft: number;
    unbudgeted: number;
    dailyNumber: number;
    budgets: Record<
      string,
      {
        planned: number;
        carriedIn: number;
        spent: number;
        left: number;
        held: number;
      }
    >;
  };
};

const dir = join(import.meta.dirname, '../../../testdata/golden/budgets');
const usdCode = currencyCode('USD');
const user = (id: string, group: 'on' | 'off'): Account => ({
  id: accountId(id),
  currency: usdCode,
  kind: 'asset',
  systemRole: null,
  budgetGroup: group,
  archived: false,
});
const system = (
  role: 'expenses' | 'income' | 'opening' | 'conversion',
  kind: 'expense' | 'income' | 'equity',
): Account => ({
  id: accountId(`${role}-USD`),
  currency: usdCode,
  kind,
  systemRole: role,
  budgetGroup: null,
  archived: false,
});
const chart = chartOf([
  user('card-USD', 'on'),
  user('cash-USD', 'on'),
  user('savings-USD', 'off'),
  system('expenses', 'expense'),
  system('income', 'income'),
  system('opening', 'equity'),
  system('conversion', 'equity'),
]);
const salary = categoryId('paycheck');
const usd = (amountMinor: number) => money(amountMinor, 'USD');
// Category IDs are plain names in the fixtures.
const category = (name: string) => categoryId(name);

function build(fixture: Fixture) {
  const tags = new Map<Transaction['id'], ReturnType<typeof tagId>[]>();
  const ledger = fixture.ledger.map((row, i): Transaction => {
    const meta = {
      id: transactionId(row.id),
      occurredOn: localDate(row.on),
      createdAt: `2026-05-01T00:00:00.${String(i).padStart(3, '0')}Z`,
    };
    const account = accountId(row.account);
    if (row.kind === 'opening') {
      return opening(chart, meta, {
        accountId: account,
        amount: usd(row.amountMinor),
      });
    }
    if (row.kind === 'paycheck') {
      return income(chart, meta, {
        accountId: account,
        amount: usd(row.amountMinor),
        categoryId: salary,
      });
    }
    const entry = expense(chart, meta, {
      accountId: account,
      amount: usd(row.amountMinor),
      categoryId: category(row.category ?? 'other'),
    });
    if (row.tags !== undefined) tags.set(entry.id, row.tags.map(tagId));
    return entry;
  });
  const budgets = fixture.budgets.map((b): Budget => ({
    id: budgetId(b.id),
    name: b.id,
    target:
      b.target.kind === 'category'
        ? { kind: 'category', categoryId: category(b.target.category) }
        : b.target.kind === 'tag'
          ? { kind: 'tag', tagId: tagId(b.target.tag) }
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
  const setup: BudgetSetup = {
    budgets,
    categories: new Map(
      Object.entries(fixture.categories).map(([name, parent]) => [
        category(name),
        {
          parent: parent === null ? null : category(parent),
          mergedInto: null,
        },
      ]),
    ),
    entryTags: tags,
  };
  const found: LedgerView = {
    chart,
    ledger,
    paycheckCategories: new Set([salary]),
    settings: {
      defaultCurrency: usdCode,
      startedOn: localDate('2026-02-18'),
      paydayRule: 'fixed',
      paydayDay: 1,
      paydayOverride: null,
      ...fixture.settings,
    },
    bills: [],
    rates: [],
    budgets: setup,
  };
  return found;
}

const files = readdirSync(dir).filter((name) => name.endsWith('.json'));

describe('budget golden fixtures', () => {
  it('finds the fixtures', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const fixture = JSON.parse(
      readFileSync(join(dir, file), 'utf8'),
    ) as Fixture;
    it(`${file}: ${fixture.description}`, () => {
      const status = budgetStatus(build(fixture), localDate(fixture.today));
      const { expected } = fixture;
      expect(status.available.amountMinor).toBe(expected.available);
      expect(status.held.amountMinor).toBe(expected.held);
      expect(status.free.amountMinor).toBe(expected.free);
      expect(status.dailyLeft.amountMinor).toBe(expected.dailyLeft);
      expect(status.unbudgeted.amountMinor).toBe(expected.unbudgeted);
      expect(status.dailyNumber.amountMinor).toBe(expected.dailyNumber);
      for (const [id, figures] of Object.entries(expected.budgets)) {
        const line = status.lines.find((l) => l.budget.id === id);
        expect(line, id).toBeDefined();
        expect({
          planned: line?.planned.amountMinor,
          carriedIn: line?.carriedIn.amountMinor,
          spent: line?.spent.amountMinor,
          left: line?.left.amountMinor,
          held: line?.held.amountMinor,
        }).toEqual(figures);
      }
    });
  }
});
