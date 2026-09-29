import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Chart series through the API against real SQLite and migrations
// (ADR 0020): today's on-budget split, a cycle day by day, and an
// account's balance history. The users joined on 15 March 2026 (UTC) and
// payday is the 1st, so the first cycle runs to 31 March. All figures are
// made up.

type Money = { amountMinor: number; currency: string };
type CycleDay = {
  date: string;
  spent: Money | null;
  cumulativeSpent: Money | null;
  pace: Money;
  availableEnd: Money | null;
  allowance: Money | null;
};

const started = new Date('2026-03-15T12:00:00Z');
let clock = started;
let h: TwoUsers;

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

let everyday: string;
let savings: string;

async function openAccount(
  client: TestClient,
  name: string,
  budgetGroup: 'on' | 'off',
  amountMinor: number,
): Promise<string> {
  const response = await client.post('/v1/accounts', {
    name,
    currency: 'USD',
    budgetGroup,
    openingBalance: usd(amountMinor),
  });
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => clock });
  await h.db
    .updateTable('users')
    .set({ created_at: started.toISOString() })
    .execute();
  everyday = await openAccount(h.alice, 'Everyday', 'on', 100000);
  savings = await openAccount(h.alice, 'Savings', 'off', 50000);
  const categories = await h.alice.get('/v1/categories');
  const groceries = (
    categories.body as { categories: { id: string; name: string }[] }
  ).categories.find((c) => c.name === 'Groceries')?.id;
  const bill = await h.alice.post('/v1/bills', {
    name: 'Rent',
    amount: usd(30000),
    accountId: everyday,
    dueDay: 20,
  });
  expect(bill.status).toBe(201);
  for (const [occurredOn, amountMinor] of [
    ['2026-03-15', 1500],
    ['2026-03-16', 2500],
    ['2026-03-17', 1000],
  ] as const) {
    const spent = await h.alice.post('/v1/transactions', {
      kind: 'expense',
      accountId: everyday,
      amount: usd(amountMinor),
      categoryId: groceries,
      occurredOn,
    });
    expect(spent.status).toBe(201);
  }
  clock = new Date('2026-03-17T12:00:00Z');
});

afterAll(async () => {
  await h.close();
});

async function today(): Promise<Record<string, unknown>> {
  const response = await h.alice.get('/v1/today');
  expect(response.status).toBe(200);
  return response.body as Record<string, unknown>;
}

describe("today's on-budget split", () => {
  it('gives on-budget money and reserved bills that make up available', async () => {
    expect(await today()).toMatchObject({
      onBudget: usd(95000),
      reserved: usd(30000),
      available: usd(65000),
    });
  });
});

describe('cycle days', () => {
  it('gives one row per day of the cycle, filled through today', async () => {
    const response = await h.alice.get('/v1/cycles/2026-03-15/days');
    expect(response.status).toBe(200);
    const { days, budget, missingRates } = response.body as {
      days: CycleDay[];
      budget: Money;
      missingRates: string[];
    };
    expect(days.map((row) => row.date)).toEqual(
      Array.from(
        { length: 17 },
        (_, at) => `2026-03-${String(15 + at).padStart(2, '0')}`,
      ),
    );
    expect(missingRates).toEqual([]);
    expect(days[1]).toMatchObject({
      spent: usd(2500),
      cumulativeSpent: usd(4000),
    });
    const figures = await today();
    expect(days[2]).toMatchObject({
      date: '2026-03-17',
      cumulativeSpent: figures.paceSpent,
      availableEnd: figures.available,
      allowance: figures.todayAllowance,
    });
    expect(days[3]).toMatchObject({
      spent: null,
      cumulativeSpent: null,
      availableEnd: null,
      allowance: null,
    });
    // $50 spent plus $650 available, spread over 17 days.
    expect(budget).toEqual(usd(70000));
    expect(days[0]?.pace).toEqual(usd(4117));
    expect(days.at(-1)?.pace).toEqual(budget);
  });

  it('answers 404 for a day no cycle opened on', async () => {
    const response = await h.alice.get('/v1/cycles/2026-03-16/days');
    expect(response.status).toBe(404);
    expect((response.body as { code: string }).code).toBe('cycle_not_found');
  });

  it('gives the off-budget total at the end of each cycle', async () => {
    const response = await h.alice.get('/v1/cycles');
    const [current] = (response.body as { cycles: Record<string, unknown>[] })
      .cycles;
    expect(current).toMatchObject({ offBudgetClosing: usd(50000) });
  });

  it('needs a signed-in user', async () => {
    const response = await fetch(
      new URL('/v1/cycles/2026-03-15/days', h.server.url),
    );
    expect(response.status).toBe(401);
  });
});

describe('account history', () => {
  type Points = { points: { date: string; balance: Money }[] };

  it('gives the end-of-day balance for each day, ending today', async () => {
    const response = await h.alice.get(
      `/v1/accounts/${everyday}/history?days=7`,
    );
    expect(response.status).toBe(200);
    expect((response.body as Points).points).toEqual([
      { date: '2026-03-11', balance: usd(0) },
      { date: '2026-03-12', balance: usd(0) },
      { date: '2026-03-13', balance: usd(0) },
      { date: '2026-03-14', balance: usd(0) },
      { date: '2026-03-15', balance: usd(98500) },
      { date: '2026-03-16', balance: usd(96000) },
      { date: '2026-03-17', balance: usd(95000) },
    ]);
  });

  it('gives 30 days by default, off-budget accounts included', async () => {
    const response = await h.alice.get(`/v1/accounts/${savings}/history`);
    const { points } = response.body as Points;
    expect(points).toHaveLength(30);
    expect(points.at(-1)).toEqual({
      date: '2026-03-17',
      balance: usd(50000),
    });
  });

  it.each(['6', '366', 'many'])('refuses days=%s', async (days) => {
    const response = await h.alice.get(
      `/v1/accounts/${everyday}/history?days=${days}`,
    );
    expect(response.status).toBe(400);
  });

  it("answers 404 for an unknown or another user's account", async () => {
    expect(
      (await h.alice.get('/v1/accounts/no-such-account/history')).status,
    ).toBe(404);
    expect((await h.bob.get(`/v1/accounts/${everyday}/history`)).status).toBe(
      404,
    );
  });
});
