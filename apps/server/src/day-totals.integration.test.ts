import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// The ledger's day totals on /v1/transactions (spec §11.2) against real
// SQLite: every matching entry on each day of the page, even the ones on
// other pages, netted over the user's own accounts. Figures are made up.

type Money = { amountMinor: number; currency: string };
type DayTotal = { date: string; net: Money; missingRates: string[] };
type List = {
  transactions: { id: string; occurredOn: string }[];
  nextCursor: string | null;
  dayTotals: DayTotal[];
};

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

let h: TwoUsers;
let everyday: string;
let savings: string;
let groceries: string;
let lunchId: string;

async function list(client: TestClient, query = ''): Promise<List> {
  const response = await client.get(`/v1/transactions${query}`);
  expect(response.status).toBe(200);
  return response.body as List;
}

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => new Date('2026-04-10T12:00:00Z') });
  const open = async (name: string) => {
    const response = await h.alice.post('/v1/accounts', {
      name,
      currency: 'USD',
      openingBalance: usd(100000),
      openedOn: '2026-04-01',
    });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  };
  everyday = await open('Everyday');
  savings = await open('Savings');
  const categories = (await h.alice.get('/v1/categories')).body as {
    categories: { id: string; name: string }[];
  };
  groceries =
    categories.categories.find((c) => c.name === 'Groceries')?.id ?? '';
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
    categoryId: groceries,
    occurredOn: '2026-04-05',
    note: 'Market',
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

describe('day totals', () => {
  it('nets each day on the page over the user’s own accounts', async () => {
    const { dayTotals } = await list(h.alice);
    expect(dayTotals.find((d) => d.date === '2026-04-05')).toEqual({
      date: '2026-04-05',
      net: usd(-4250),
      missingRates: [],
    });
    // A transfer between own accounts nets to nothing.
    expect(dayTotals.find((d) => d.date === '2026-04-06')?.net).toEqual(usd(0));
  });

  it('counts the whole day even when the page shows part of it', async () => {
    const first = await list(h.alice, '?limit=2');
    expect(first.transactions.map((t) => t.occurredOn)).toContain('2026-04-05');
    expect(
      first.transactions.filter((t) => t.occurredOn === '2026-04-05'),
    ).toHaveLength(1);
    expect(first.dayTotals.find((d) => d.date === '2026-04-05')?.net).toEqual(
      usd(-4250),
    );
  });

  it('counts only the filtered account, and matches filters', async () => {
    const onlySavings = await list(h.alice, `?accountId=${savings}`);
    expect(
      onlySavings.dayTotals.find((d) => d.date === '2026-04-06')?.net,
    ).toEqual(usd(20000));
    const lunch = await list(h.alice, '?q=Lunch');
    expect(lunch.dayTotals).toEqual([
      { date: '2026-04-05', net: usd(-1250), missingRates: [] },
    ]);
  });

  it('lets an undo cancel its entry', async () => {
    const undone = await h.alice.post(
      `/v1/transactions/${lunchId}/reverse`,
      {},
    );
    expect(undone.status).toBe(201);
    const { dayTotals } = await list(h.alice, '?q=Lunch');
    expect(dayTotals).toEqual([
      { date: '2026-04-05', net: usd(0), missingRates: [] },
    ]);
  });

  it('is empty for an empty page', async () => {
    const { dayTotals } = await list(h.bob);
    expect(dayTotals).toEqual([]);
  });
});
