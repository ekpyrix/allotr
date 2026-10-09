import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// The `type` and `payee` filters on /v1/transactions against real SQLite,
// and their agreement with `totals` and /v1/reports/payees. Amounts and
// payees are made up.

type Money = { amountMinor: number; currency: string };
type List = {
  transactions: { id: string; kind: string; note: string | null }[];
  totals: {
    count: number;
    byCurrency: { spent: Money; income: Money; net: Money }[];
  };
};
type PayeeReport = {
  currencies: { payees: { payee: string; count: number; total: Money }[] }[];
};

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

let h: TwoUsers;
let everyday: string;
let savings: string;
let groceries: string;
let paycheck: string;
let undoneId: string;

async function list(client: TestClient, query: string): Promise<List> {
  const response = await client.get(`/v1/transactions${query}`);
  expect(response.status).toBe(200);
  return response.body as List;
}

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => new Date('2026-04-10T12:00:00Z') });
  const open = async (name: string, group?: string) => {
    const response = await h.alice.post('/v1/accounts', {
      name,
      currency: 'USD',
      openingBalance: usd(100000),
      openedOn: '2026-04-01',
      ...(group === undefined ? {} : { budgetGroup: group }),
    });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  };
  everyday = await open('Everyday');
  savings = await open('Savings', 'off');
  const categories = (await h.alice.get('/v1/categories')).body as {
    categories: { id: string; name: string }[];
  };
  const idOf = (name: string) =>
    categories.categories.find((c) => c.name === name)?.id ?? '';
  groceries = idOf('Groceries');
  paycheck = idOf('Paycheck');
  const post = async (body: Record<string, unknown>) => {
    const response = await h.alice.post('/v1/transactions', body);
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  };
  const spend = (amountMinor: number, occurredOn: string, note?: string) =>
    post({
      kind: 'expense',
      accountId: everyday,
      amount: usd(amountMinor),
      categoryId: groceries,
      occurredOn,
      ...(note === undefined ? {} : { note }),
    });
  await spend(1200, '2026-04-03', 'Corner Market');
  await spend(800, '2026-04-04', '  corner   market ');
  await spend(500, '2026-04-05', 'Corner Market Deli');
  undoneId = await spend(900, '2026-04-06', 'CORNER MARKET');
  await spend(300, '2026-04-06');
  await post({
    kind: 'income',
    accountId: everyday,
    amount: usd(250000),
    categoryId: paycheck,
    occurredOn: '2026-04-01',
    note: 'Corner Market',
  });
  await post({
    kind: 'transfer',
    fromAccountId: everyday,
    toAccountId: savings,
    sent: usd(20000),
    occurredOn: '2026-04-02',
  });
  const undo = await h.alice.post(`/v1/transactions/${undoneId}/reverse`, {});
  expect(undo.status).toBe(201);
});

afterAll(async () => {
  await h.close();
});

describe('type filter', () => {
  it('lists spending, with undos alongside their entry', async () => {
    const spending = await list(h.alice, '?type=expense');
    // 5 expenses and the undo of one; no opening, income or transfer.
    expect(spending.transactions).toHaveLength(6);
    expect(
      spending.transactions.every((t) =>
        ['expense', 'reversal'].includes(t.kind),
      ),
    ).toBe(true);
    expect(spending.totals.byCurrency).toEqual([
      { spent: usd(2800), income: usd(0), net: usd(-2800) },
    ]);
  });

  it('lists income and transfers on their own', async () => {
    const income = await list(h.alice, '?type=income');
    expect(income.transactions.map((t) => t.kind)).toEqual(['income']);
    expect(income.totals.byCurrency).toEqual([
      { spent: usd(0), income: usd(250000), net: usd(250000) },
    ]);
    const transfers = await list(h.alice, '?type=transfer');
    expect(transfers.transactions.map((t) => t.kind)).toEqual(['transfer']);
    expect(transfers.totals.byCurrency).toEqual([]);
  });

  it('splits the unfiltered spent figure between the types', async () => {
    const all = await list(h.alice, '');
    const spending = await list(h.alice, '?type=expense');
    expect(spending.totals.byCurrency[0]?.spent).toEqual(
      all.totals.byCurrency[0]?.spent,
    );
  });

  it('refuses an unknown type', async () => {
    const response = await h.alice.get('/v1/transactions?type=opening');
    expect(response.status).toBe(400);
  });
});

describe('payee filter', () => {
  it('matches the whole note ignoring case and spaces, not a substring', async () => {
    const found = await list(h.alice, '?payee=corner%20market');
    const notes = found.transactions.map((t) => t.note);
    expect(notes).not.toContain('Corner Market Deli');
    // 2 expenses, the undone one and its undo (no note of its own), and
    // the income entry with the same note.
    expect(found.transactions).toHaveLength(5);
    expect(notes.filter((n) => n === null)).toHaveLength(1);
  });

  it('lists exactly what the payee report counted', async () => {
    const report = (
      await h.alice.get('/v1/reports/payees?period=month&month=2026-04')
    ).body as PayeeReport;
    const ranked = report.currencies[0]?.payees.find(
      (p) => p.payee === 'Corner Market',
    );
    const found = await list(
      h.alice,
      `?payee=${encodeURIComponent('Corner Market')}&type=expense&undone=hide&from=2026-04-01&to=2026-04-30`,
    );
    expect(ranked?.count).toBe(found.transactions.length);
    expect(found.totals.byCurrency[0]?.spent).toEqual(ranked?.total);
  });

  it('keeps payees to their own user', async () => {
    const found = await list(h.bob, '?payee=Corner%20Market');
    expect(found.transactions).toEqual([]);
  });

  it('refuses a blank payee', async () => {
    const response = await h.alice.get('/v1/transactions?payee=%20%20');
    expect(response.status).toBe(400);
  });
});
