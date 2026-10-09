import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Pool cycle figures on GET /v1/pools against real SQLite and migrations
// (docs/domain.md "Pools"). The users joined on 15 March 2026 (UTC) and the
// clock moves forward per step. All figures are made up.

type Money = { amountMinor: number; currency: string };
type Figure = { amount: Money; missingRates: string[] };
type Pool = {
  id: string;
  name: string;
  counts: boolean;
  balance: Figure;
  cycle: { start: Figure; left: Figure } | null;
};

const started = new Date('2026-03-15T12:00:00Z');
let clock = started;
let h: TwoUsers;
let everyday: string;
let groceries: string;
let paycheck: string;

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
const figure = (amountMinor: number) => ({
  amount: usd(amountMinor),
  missingRates: [],
});

async function pools(client: TestClient): Promise<Pool[]> {
  const response = await client.get('/v1/pools');
  expect(response.status).toBe(200);
  return (response.body as { pools: Pool[] }).pools;
}

async function categoryId(client: TestClient, name: string): Promise<string> {
  const list = await client.get('/v1/categories');
  const found = (
    list.body as { categories: { id: string; name: string }[] }
  ).categories.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no category ${name}`);
  return found.id;
}

async function record(
  kind: 'expense' | 'income',
  amountMinor: number,
  occurredOn: string,
  category: string,
) {
  const response = await h.alice.post('/v1/transactions', {
    kind,
    accountId: everyday,
    amount: usd(amountMinor),
    categoryId: category,
    occurredOn,
  });
  expect(response.status).toBe(201);
}

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => clock });
  await h.db
    .updateTable('users')
    .set({ created_at: started.toISOString() })
    .execute();
  const opened = await h.alice.post('/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
    openingBalance: usd(100_000),
  });
  everyday = (opened.body as { id: string }).id;
  await h.alice.post('/v1/accounts', {
    name: 'Rainy day',
    currency: 'USD',
    budgetGroup: 'off',
    openingBalance: usd(500_000),
  });
  groceries = await categoryId(h.alice, 'Groceries');
  paycheck = await categoryId(h.alice, 'Paycheck');
});

afterAll(async () => {
  await h.close();
});

describe('pool cycle figures', () => {
  it('reads start and left in the first cycle, with none for savings', async () => {
    await record('expense', 12_000, '2026-03-15', groceries);
    const [budget, savings] = await pools(h.alice);
    expect(budget).toMatchObject({ name: 'Budget', counts: true });
    expect(budget?.cycle).toEqual({
      start: figure(100_000),
      left: figure(88_000),
    });
    expect(savings).toMatchObject({
      name: 'Savings',
      counts: false,
      cycle: null,
    });
    expect(savings?.balance.amount).toEqual(usd(500_000));
  });

  it('starts again from the balance when a paycheck opens a cycle', async () => {
    clock = new Date('2026-04-03T12:00:00Z');
    await record('income', 200_000, '2026-04-01', paycheck);
    await record('expense', 5_000, '2026-04-02', groceries);
    const [budget] = await pools(h.alice);
    expect(budget?.cycle).toEqual({
      start: figure(88_000),
      left: figure(283_000),
    });
  });

  it('changes the start when an entry is back-dated before the cycle', async () => {
    await record('expense', 3_000, '2026-03-20', groceries);
    const [budget] = await pools(h.alice);
    expect(budget?.cycle).toEqual({
      start: figure(85_000),
      left: figure(280_000),
    });
  });

  it('gives another user their own figures', async () => {
    const [budget] = await pools(h.bob);
    expect(budget?.cycle).toEqual({ start: figure(0), left: figure(0) });
  });
});
