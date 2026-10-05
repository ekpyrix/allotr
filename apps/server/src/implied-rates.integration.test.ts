import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// The rate a foreign payment implied (docs/domain.md "Exchange rates"):
// stored when no rate for the pair exists on the day, replaced by a manual
// rate, and taken back with the last entry that implied it. Made-up amounts.

type Rate = { id: string; base: string; quote: string; rate: string } & {
  asOf: string;
  source: string;
};
type Summary = {
  spending: { amount: { amountMinor: number; currency: string } }[];
  missingRates: string[];
};

const started = new Date('2026-03-15T12:00:00Z');
let h: TwoUsers;
let everyday: string;
let subscriptions: string;

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => started });
  await h.db
    .updateTable('users')
    .set({ created_at: started.toISOString() })
    .execute();
  const account = await h.alice.post('/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
    openingBalance: { amountMinor: 100000, currency: 'USD' },
  });
  everyday = (account.body as { id: string }).id;
  const list = await h.alice.get('/v1/categories');
  const found = (
    list.body as { categories: { id: string; name: string }[] }
  ).categories.find((c) => c.name === 'Bills and subscriptions');
  if (found === undefined) throw new Error('no starter category');
  subscriptions = found.id;
});

afterAll(async () => {
  await h.close();
});

async function rates(): Promise<Rate[]> {
  const response = await h.alice.get('/v1/rates');
  return (response.body as { rates: Rate[] }).rates;
}

// A €9.20 purchase paid as $10.00.
async function buy(occurredOn: string, usd = 1000, eur = 920): Promise<string> {
  const response = await h.alice.post('/v1/transactions', {
    kind: 'expense',
    accountId: everyday,
    amount: { amountMinor: usd, currency: 'USD' },
    foreignAmount: { amountMinor: eur, currency: 'EUR' },
    categoryId: subscriptions,
    occurredOn,
  });
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

async function monthSpending(): Promise<{
  usd: number;
  missingRates: string[];
}> {
  const report = await h.alice.get(
    '/v1/reports/categories?period=month&month=2026-03',
  );
  const body = report.body as Summary;
  return {
    usd: body.spending.reduce((sum, g) => sum + g.amount.amountMinor, 0),
    missingRates: body.missingRates,
  };
}

async function undo(id: string): Promise<void> {
  const response = await h.alice.post(`/v1/transactions/${id}/reverse`, {});
  expect(response.status).toBe(201);
}

async function clearRates(): Promise<void> {
  for (const rate of await rates()) {
    await h.alice.delete(`/v1/rates/${rate.id}`);
  }
}

describe('implied rates', () => {
  it('stores the rate a foreign payment implied and converts with it', async () => {
    await clearRates();
    const before = await monthSpending();
    await buy('2026-03-10');
    expect(await rates()).toMatchObject([
      {
        base: 'USD',
        quote: 'EUR',
        rate: '0.92',
        asOf: '2026-03-10',
        source: 'implied',
      },
    ]);
    const after = await monthSpending();
    expect(after.missingRates).toEqual([]);
    expect(after.usd - before.usd).toBe(1000);
  });

  it('counts a foreign expense in the cycle snapshot, with no missing rate', async () => {
    const current = async () => {
      const response = await h.alice.get('/v1/cycles');
      const [first] = (
        response.body as {
          cycles: {
            spending: { amountMinor: number };
            missingRates: string[];
          }[];
        }
      ).cycles;
      if (first === undefined) throw new Error('no cycle');
      return first;
    };
    const before = await current();
    await buy('2026-03-15');
    const after = await current();
    expect(after.spending.amountMinor - before.spending.amountMinor).toBe(1000);
    expect(after.missingRates).toEqual([]);
  });

  it('keeps the rate until the last entry that implied it is undone', async () => {
    await clearRates();
    const first = await buy('2026-03-11');
    const second = await buy('2026-03-11', 2000, 1850);
    expect(await rates()).toHaveLength(1);
    expect((await rates())[0]?.rate).toBe('0.92');
    await undo(first);
    expect(await rates()).toHaveLength(1);
    await undo(second);
    expect(await rates()).toEqual([]);
  });

  it('lets a manual rate for the day win, before or after', async () => {
    await clearRates();
    await h.alice.post('/v1/rates', {
      base: 'USD',
      quote: 'EUR',
      rate: '0.9',
      asOf: '2026-03-12',
    });
    const first = await buy('2026-03-12');
    expect(await rates()).toMatchObject([{ rate: '0.9', source: 'manual' }]);
    await undo(first);
    expect(await rates()).toMatchObject([{ rate: '0.9', source: 'manual' }]);

    const second = await buy('2026-03-13');
    expect(await rates()).toHaveLength(2);
    await h.alice.post('/v1/rates', {
      base: 'USD',
      quote: 'EUR',
      rate: '0.93',
      asOf: '2026-03-13',
    });
    await undo(second);
    expect(await rates()).toMatchObject([
      { asOf: '2026-03-13', rate: '0.93', source: 'manual' },
      { asOf: '2026-03-12', rate: '0.9', source: 'manual' },
    ]);
  });

  it('follows an edit: the old rate goes, the new one is stored', async () => {
    await clearRates();
    const id = await buy('2026-03-14');
    const edited = await h.alice.post(`/v1/transactions/${id}/edit`, {
      kind: 'expense',
      accountId: everyday,
      amount: { amountMinor: 1000, currency: 'USD' },
      foreignAmount: { amountMinor: 900, currency: 'EUR' },
      categoryId: subscriptions,
      occurredOn: '2026-03-14',
    });
    expect(edited.status).toBe(201);
    expect(await rates()).toMatchObject([{ rate: '0.9', source: 'implied' }]);
  });
});
