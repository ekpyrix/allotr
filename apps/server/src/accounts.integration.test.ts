import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Account totals per budget group in the default currency (FR-L2, FR-X2),
// through the API against real SQLite. A fresh instance, so the totals see
// only these accounts. All figures are made up.

type Figure = {
  amount: { amountMinor: number; currency: string };
  missingRates: string[];
};
type List = {
  accounts: { id: string; archived: boolean }[];
  totals: { on: Figure; off: Figure };
};

let h: TwoUsers;

beforeAll(async () => {
  h = await startWithTwoUsers();
});

afterAll(async () => {
  await h.close();
});

async function list(client: TestClient, query = ''): Promise<List> {
  const response = await client.get(`/v1/accounts${query}`);
  expect(response.status).toBe(200);
  return response.body as List;
}

async function open(
  name: string,
  currency: string,
  amountMinor: number,
  budgetGroup: 'on' | 'off',
): Promise<string> {
  const response = await h.alice.post('/v1/accounts', {
    name,
    currency,
    budgetGroup,
    openingBalance: { amountMinor, currency },
  });
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

describe('account totals', () => {
  const ids = { travel: '', yen: '' };

  it('are zero in the default currency without accounts', async () => {
    expect((await list(h.alice)).totals).toEqual({
      on: { amount: usd(0), missingRates: [] },
      off: { amount: usd(0), missingRates: [] },
    });
  });

  it('keep savings out of the on-budget total and flag missing rates', async () => {
    await open('Everyday', 'USD', 100_000, 'on');
    ids.travel = await open('Travel', 'EUR', 20_000, 'on');
    await open('Savings', 'USD', 500_000, 'off');
    ids.yen = await open('Yen savings', 'JPY', 10_000, 'off');
    expect((await list(h.alice)).totals).toEqual({
      on: { amount: usd(100_000), missingRates: ['EUR'] },
      off: { amount: usd(500_000), missingRates: ['JPY'] },
    });
  });

  it('convert with the manual rate', async () => {
    const rate = await h.alice.post('/v1/rates', {
      base: 'EUR',
      quote: 'USD',
      rate: '1.1',
    });
    expect(rate.status).toBe(201);
    expect((await list(h.alice)).totals.on).toEqual({
      amount: usd(122_000),
      missingRates: [],
    });
  });

  it('follow a switch of budget group from today', async () => {
    const response = await h.alice.patch(`/v1/accounts/${ids.travel}`, {
      budgetGroup: 'off',
    });
    expect(response.status).toBe(200);
    expect((await list(h.alice)).totals).toEqual({
      on: { amount: usd(100_000), missingRates: [] },
      off: { amount: usd(522_000), missingRates: ['JPY'] },
    });
  });

  it('leave out archived accounts', async () => {
    const response = await h.alice.post(`/v1/accounts/${ids.yen}/archive`, {
      settle: { method: 'write_off' },
    });
    expect(response.status).toBe(200);
    const all = await list(h.alice, '?includeArchived=true');
    expect(all.accounts.find((a) => a.id === ids.yen)?.archived).toBe(true);
    expect(all.totals.off).toEqual({
      amount: usd(522_000),
      missingRates: [],
    });
  });

  it('belong to the user asking', async () => {
    expect((await list(h.bob)).totals.off).toEqual({
      amount: usd(0),
      missingRates: [],
    });
  });
});
