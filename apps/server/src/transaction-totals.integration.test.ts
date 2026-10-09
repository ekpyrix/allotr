import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Totals on /v1/transactions: count, spent, income and net of every
// matching entry per currency, and per day or category, against real
// SQLite. Amounts are made up.

type Money = { amountMinor: number; currency: string };
type Totals = {
  count: number;
  byCurrency: { spent: Money; income: Money; net: Money }[];
};
type List = {
  transactions: { id: string }[];
  totals: Totals;
  groups: (Totals & { key: string | null })[];
};

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' });

let h: TwoUsers;
let everyday: string;
let euroWallet: string;
let savings: string;
let groceries: string;
let dining: string;
let lunchId: string;

async function list(client: TestClient, query = ''): Promise<List> {
  const response = await client.get(`/v1/transactions${query}`);
  expect(response.status).toBe(200);
  return response.body as List;
}

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => new Date('2026-04-10T12:00:00Z') });
  const open = async (name: string, currency: string, group?: string) => {
    const response = await h.alice.post('/v1/accounts', {
      name,
      currency,
      openingBalance: { amountMinor: 100000, currency },
      openedOn: '2026-04-01',
      ...(group === undefined ? {} : { budgetGroup: group }),
    });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  };
  everyday = await open('Everyday', 'USD');
  savings = await open('Savings', 'USD', 'off');
  euroWallet = await open('Euro wallet', 'EUR');
  const categories = (await h.alice.get('/v1/categories')).body as {
    categories: { id: string; name: string }[];
  };
  const idOf = (name: string) =>
    categories.categories.find((c) => c.name === name)?.id ?? '';
  groceries = idOf('Groceries');
  dining = idOf('Eating out');
  const post = async (body: Record<string, unknown>) => {
    const response = await h.alice.post('/v1/transactions', body);
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  };
  lunchId = await post({
    kind: 'expense',
    accountId: everyday,
    amount: usd(1250),
    categoryId: groceries,
    occurredOn: '2026-04-05',
    note: 'Lunch',
  });
  await post({
    kind: 'expense',
    accountId: everyday,
    amount: usd(3000),
    categoryId: dining,
    occurredOn: '2026-04-05',
  });
  await post({
    kind: 'expense',
    accountId: euroWallet,
    amount: eur(700),
    categoryId: groceries,
    occurredOn: '2026-04-06',
  });
  await post({
    kind: 'transfer',
    fromAccountId: everyday,
    toAccountId: savings,
    sent: usd(20000),
    occurredOn: '2026-04-06',
  });
});

afterAll(async () => {
  await h.close();
});

describe('transaction totals', () => {
  it('totals the whole filtered set per currency, not the page', async () => {
    const page = await list(h.alice, '?limit=1');
    expect(page.transactions).toHaveLength(1);
    expect(page.totals.count).toBe(7);
    // The 3 opening balances are neither spent nor income; the transfer too.
    expect(page.totals.byCurrency).toEqual([
      { spent: eur(700), income: eur(0), net: eur(-700) },
      { spent: usd(4250), income: usd(0), net: usd(-4250) },
    ]);
  });

  it('follows the list’s filters', async () => {
    const lunch = await list(h.alice, '?q=Lunch');
    expect(lunch.totals).toEqual({
      count: 1,
      byCurrency: [{ spent: usd(1250), income: usd(0), net: usd(-1250) }],
    });
    const savingsOnly = await list(h.alice, `?accountId=${savings}`);
    expect(savingsOnly.totals).toEqual({ count: 2, byCurrency: [] });
    const none = await list(h.alice, '?from=2027-01-01');
    expect(none.totals).toEqual({ count: 0, byCurrency: [] });
  });

  it('returns no groups unless asked', async () => {
    expect((await list(h.alice)).groups).toEqual([]);
  });

  it('groups by day, newest first', async () => {
    const { groups } = await list(h.alice, '?group=day&limit=1');
    expect(groups.map((g) => [g.key, g.count])).toEqual([
      ['2026-04-06', 2],
      ['2026-04-05', 2],
      ['2026-04-01', 3],
    ]);
    expect(groups[1]?.byCurrency).toEqual([
      { spent: usd(4250), income: usd(0), net: usd(-4250) },
    ]);
  });

  it('groups by category', async () => {
    const { groups } = await list(h.alice, '?group=category');
    const byKey = new Map(groups.map((g) => [g.key, g]));
    expect(byKey.get(dining)?.byCurrency).toEqual([
      { spent: usd(3000), income: usd(0), net: usd(-3000) },
    ]);
    expect(byKey.get(groceries)?.byCurrency.map((t) => t.spent)).toEqual([
      eur(700),
      usd(1250),
    ]);
  });

  it('lets an undo cancel its entry', async () => {
    const undone = await h.alice.post(
      `/v1/transactions/${lunchId}/reverse`,
      {},
    );
    expect(undone.status).toBe(201);
    const shown = await list(h.alice, '?q=Lunch');
    expect(shown.totals.count).toBe(2);
    expect(shown.totals.byCurrency).toEqual([
      { spent: usd(0), income: usd(0), net: usd(0) },
    ]);
    const hidden = await list(h.alice, '?q=Lunch&undone=hide');
    expect(hidden.totals).toEqual({ count: 0, byCurrency: [] });
  });

  it('only counts the signed-in user’s entries', async () => {
    expect((await list(h.bob)).totals).toEqual({ count: 0, byCurrency: [] });
  });
});
