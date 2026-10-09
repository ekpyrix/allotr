import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Category summaries through the API against real SQLite and migrations
// (FR-W2): subcategories roll up into their parent, for a payday cycle and
// for a calendar month. The clock is fixed; all figures are made up.

type Money = { amountMinor: number; currency: string };
type Group = {
  categoryId: string | null;
  amount: Money;
  children: { categoryId: string | null; amount: Money }[];
};
type Summary = {
  period: string;
  from: string;
  to: string;
  spending: Group[];
  income: Group[];
  missingRates: string[];
  series?: {
    periods: { from: string; to: string }[];
    groups: { categoryId: string | null; points: Money[] }[];
    totals: Money[];
    missingRates: string[];
  };
};

const started = new Date('2026-03-15T12:00:00Z');
let clock = started;
let h: TwoUsers;

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => clock });
  await h.db
    .updateTable('users')
    .set({ created_at: started.toISOString() })
    .execute();
});

afterAll(async () => {
  await h.close();
});

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

describe('GET /v1/reports/categories', () => {
  let food: string;
  let groceries: string;
  let eatingOut: string;
  let fun: string;

  async function id(name: string): Promise<string> {
    const list = await h.alice.get('/v1/categories');
    const found = (
      list.body as { categories: { id: string; name: string }[] }
    ).categories.find((c) => c.name === name);
    if (found === undefined) throw new Error(`no category ${name}`);
    return found.id;
  }

  beforeAll(async () => {
    const account = await h.alice.post('/v1/accounts', {
      name: 'Everyday',
      currency: 'USD',
      openingBalance: usd(100000),
    });
    const everyday = (account.body as { id: string }).id;
    food = await id('Food');
    groceries = await id('Groceries');
    eatingOut = await id('Eating out');
    fun = await id('Fun');
    const spend = async (
      categoryId: string,
      amountMinor: number,
      occurredOn: string,
    ) => {
      const response = await h.alice.post('/v1/transactions', {
        kind: 'expense',
        accountId: everyday,
        amount: usd(amountMinor),
        categoryId,
        occurredOn,
      });
      expect(response.status).toBe(201);
    };
    clock = new Date('2026-03-20T12:00:00Z');
    await spend(groceries, 3000, '2026-03-20');
    await spend(eatingOut, 1200, '2026-03-21');
    await spend(fun, 2000, '2026-03-22');
    await spend(food, 500, '2026-03-23');
    await spend(groceries, 900, '2026-02-26');
  });

  it('rolls subcategories up into their parent, largest first', async () => {
    const response = await h.alice.get(
      '/v1/reports/categories?period=month&month=2026-03',
    );
    expect(response.status).toBe(200);
    const body = response.body as Summary;
    expect(body).toMatchObject({
      period: 'month',
      from: '2026-03-01',
      to: '2026-03-31',
      missingRates: [],
      income: [],
    });
    expect(
      body.spending.map((g) => [g.categoryId, g.amount.amountMinor]),
    ).toEqual([
      [food, 4700],
      [fun, 2000],
    ]);
    expect(body.spending[0]?.children.map((c) => c.categoryId)).toEqual([
      groceries,
      eatingOut,
      food,
    ]);
  });

  it('leaves out entries dated outside the month', async () => {
    const response = await h.alice.get(
      '/v1/reports/categories?period=month&month=2026-02',
    );
    expect((response.body as Summary).spending[0]?.amount).toEqual(usd(900));
  });

  it('adds a series of months, oldest first, parents including children', async () => {
    const response = await h.alice.get(
      '/v1/reports/categories?period=month&month=2026-03&series=3',
    );
    expect(response.status).toBe(200);
    const body = response.body as Summary;
    expect(body.spending.map((g) => g.amount.amountMinor)).toEqual([
      4700, 2000,
    ]);
    expect(body.series?.periods).toEqual([
      { from: '2026-01-01', to: '2026-01-31' },
      { from: '2026-02-01', to: '2026-02-28' },
      { from: '2026-03-01', to: '2026-03-31' },
    ]);
    expect(body.series?.groups).toEqual([
      { categoryId: food, points: [usd(0), usd(900), usd(4700)] },
      { categoryId: fun, points: [usd(0), usd(0), usd(2000)] },
    ]);
    expect(body.series?.totals).toEqual([usd(0), usd(900), usd(6700)]);
    expect(body.series?.missingRates).toEqual([]);
  });

  it('leaves series out unless asked, and refuses a bad count', async () => {
    const plain = await h.alice.get('/v1/reports/categories?period=month');
    expect('series' in (plain.body as object)).toBe(false);
    for (const bad of ['0', '25', 'x']) {
      expect(
        (await h.alice.get(`/v1/reports/categories?series=${bad}`)).status,
      ).toBe(400);
    }
  });

  it('adds a series of cycles ending with the selected one', async () => {
    const response = await h.alice.get('/v1/reports/categories?series=6');
    const body = response.body as Summary;
    // One cycle so far: the open one, through today.
    expect(body.series?.periods).toEqual([{ from: body.from, to: body.to }]);
    expect(body.series?.groups[0]?.points[0]).toEqual(body.spending[0]?.amount);
  });

  it('follows the open cycle by default', async () => {
    const response = await h.alice.get('/v1/reports/categories');
    expect(response.status).toBe(200);
    const body = response.body as Summary;
    expect(body.period).toBe('cycle');
    expect(body.to).toBe('2026-03-20');
  });

  it('refuses a cycle that did not open, and a bad month', async () => {
    expect(
      (await h.alice.get('/v1/reports/categories?cycle=2026-03-02')).status,
    ).toBe(404);
    expect(
      (await h.alice.get('/v1/reports/categories?period=month&month=2026-13'))
        .status,
    ).toBe(400);
  });

  it('only shows the signed-in user’s entries and needs a session', async () => {
    const other = await h.bob.get(
      '/v1/reports/categories?period=month&month=2026-03',
    );
    expect((other.body as Summary).spending).toEqual([]);
    const anonymous = await fetch(
      new URL('/v1/reports/categories', h.server.url),
    );
    expect([401, 403]).toContain(anonymous.status);
  });
});
