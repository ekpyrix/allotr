import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Top payees through the API against real SQLite and migrations
// (docs/ui.md §8 item 4). The clock is fixed; payees and figures are made up.

type Money = { amountMinor: number; currency: string };
type Report = {
  period: string;
  from: string;
  to: string;
  currencies: {
    currency: string;
    total: Money;
    payees: { payee: string; count: number; total: Money }[];
    more: number;
    unnamed: { count: number; total: Money } | null;
  }[];
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

describe('GET /v1/reports/payees', () => {
  let everyday: string;
  let savings: string;
  let eur: string;
  let groceries: string;
  let fun: string;
  let busId: string;

  const categoryId = async (name: string) => {
    const list = await h.alice.get('/v1/categories');
    const found = (
      list.body as { categories: { id: string; name: string }[] }
    ).categories.find((c) => c.name === name);
    if (found === undefined) throw new Error(`no category ${name}`);
    return found.id;
  };
  const post = async (body: Record<string, unknown>) => {
    const response = await h.alice.post('/v1/transactions', body);
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  };
  const spend = (
    note: string | undefined,
    amountMinor: number,
    occurredOn: string,
    accountId = everyday,
    currency = 'USD',
  ) =>
    post({
      kind: 'expense',
      accountId,
      amount: { amountMinor, currency },
      categoryId: groceries,
      occurredOn,
      ...(note === undefined ? {} : { note }),
    });

  beforeAll(async () => {
    const account = async (name: string, currency: string) =>
      (
        (
          await h.alice.post('/v1/accounts', {
            name,
            currency,
            openingBalance: { amountMinor: 100000, currency },
          })
        ).body as { id: string }
      ).id;
    everyday = await account('Everyday', 'USD');
    savings = await account('Rainy day', 'USD');
    eur = await account('Travel card', 'EUR');
    groceries = await categoryId('Groceries');
    fun = await categoryId('Fun');
    clock = new Date('2026-03-20T12:00:00Z');
    await spend('Green Market', 2000, '2026-03-16');
    await spend('green market ', 1500, '2026-03-18');
    await spend('Corner Cafe', 450, '2026-03-17');
    busId = await spend('Bus', 150, '2026-03-19');
    await spend(undefined, 700, '2026-03-19');
    await spend('Cafe Europa', 900, '2026-03-19', eur, 'EUR');
    await spend('Corner Cafe', 5000, '2026-02-20');
    await post({
      kind: 'expense',
      accountId: everyday,
      amount: usd(1000),
      lines: [
        { categoryId: groceries, amount: usd(600) },
        { categoryId: fun, amount: usd(400) },
      ],
      occurredOn: '2026-03-18',
      note: 'Corner Cafe',
    });
    await post({
      kind: 'transfer',
      fromAccountId: everyday,
      toAccountId: savings,
      sent: usd(9000),
      occurredOn: '2026-03-19',
      note: 'Corner Cafe',
    });
    const undone = await h.alice.post(`/v1/transactions/${busId}/reverse`, {});
    expect(undone.status).toBe(201);
  });

  it('ranks payees per currency, merging spellings', async () => {
    const response = await h.alice.get(
      '/v1/reports/payees?period=month&month=2026-03',
    );
    expect(response.status).toBe(200);
    const body = response.body as Report;
    expect(body).toMatchObject({
      period: 'month',
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(body.currencies.map((c) => c.currency)).toEqual(['EUR', 'USD']);
    expect(body.currencies[0]?.payees).toEqual([
      {
        payee: 'Cafe Europa',
        count: 1,
        total: { amountMinor: 900, currency: 'EUR' },
      },
    ]);
    const dollars = body.currencies[1];
    expect(dollars?.payees).toEqual([
      { payee: 'Green Market', count: 2, total: usd(3500) },
      { payee: 'Corner Cafe', count: 2, total: usd(1450) },
    ]);
    expect(dollars?.unnamed).toEqual({ count: 1, total: usd(700) });
    expect(dollars?.total).toEqual(usd(5650));
    expect(dollars?.more).toBe(0);
  });

  it('cuts at the limit and says how many were left out', async () => {
    const response = await h.alice.get(
      '/v1/reports/payees?period=month&month=2026-03&limit=1',
    );
    const dollars = (response.body as Report).currencies[1];
    expect(dollars?.payees.map((p) => p.payee)).toEqual(['Green Market']);
    expect(dollars?.more).toBe(1);
  });

  it('follows the open payday cycle by default', async () => {
    const response = await h.alice.get('/v1/reports/payees');
    expect(response.status).toBe(200);
    expect((response.body as Report).period).toBe('cycle');
  });

  it('answers 404 for a cycle that did not open', async () => {
    const response = await h.alice.get(
      '/v1/reports/payees?period=cycle&cycle=2020-01-01',
    );
    expect(response.status).toBe(404);
  });

  it('rejects a limit out of range', async () => {
    expect((await h.alice.get('/v1/reports/payees?limit=0')).status).toBe(400);
    expect((await h.alice.get('/v1/reports/payees?limit=101')).status).toBe(
      400,
    );
  });

  it('only shows the signed-in user’s entries and needs a session', async () => {
    const other = await h.bob.get(
      '/v1/reports/payees?period=month&month=2026-03',
    );
    expect((other.body as Report).currencies).toEqual([]);
    const anonymous = await fetch(new URL('/v1/reports/payees', h.server.url));
    expect([401, 403]).toContain(anonymous.status);
  });
});
