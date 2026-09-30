import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// What archiving would do to today's figure (FR-L8), through the API
// against real SQLite and migrations. The clock is fixed on 15 March 2026
// (UTC) with payday on the 1st, so 17 days are left. All figures are made
// up.

type Money = { amountMinor: number; currency: string };
type Impact = {
  leftToday: Money;
  writeOff: { leftTodayDrop: Money; leftTodayAfter: Money };
  transfers: {
    toAccountId: string;
    leftTodayDrop: Money;
    leftTodayAfter: Money;
  }[];
};

const started = new Date('2026-03-15T12:00:00Z');
let h: TwoUsers;

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => started });
  await h.db
    .updateTable('users')
    .set({ created_at: started.toISOString() })
    .execute();
});

afterAll(async () => {
  await h.close();
});

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

async function open(
  name: string,
  opening: Money,
  budgetGroup: 'on' | 'off',
): Promise<string> {
  const response = await h.alice.post('/v1/accounts', {
    name,
    currency: opening.currency,
    budgetGroup,
    openingBalance: opening,
  });
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

async function impact(client: TestClient, id: string): Promise<Impact> {
  const response = await client.get(`/v1/accounts/${id}/archive-impact`);
  expect(response.status).toBe(200);
  return response.body as Impact;
}

async function leftToday(): Promise<number> {
  const response = await h.alice.get('/v1/today');
  expect(response.status).toBe(200);
  return (response.body as { leftToday: Money }).leftToday.amountMinor;
}

describe('archive impact', () => {
  const ids = { everyday: '', wallet: '', savings: '', spare: '' };

  beforeAll(async () => {
    // $3,650.00 on budget over 17 days: $214.70 left today.
    ids.everyday = await open('Everyday', usd(340_000), 'on');
    ids.wallet = await open('Old wallet', usd(25_000), 'on');
    ids.savings = await open('Savings', usd(100_000), 'off');
    ids.spare = await open('Spare', usd(0), 'on');
  });

  it('counts a write-off as spending and a transfer to savings as a lower allowance', async () => {
    expect(await leftToday()).toBe(21_470);
    const result = await impact(h.alice, ids.wallet);
    expect(result.leftToday).toEqual(usd(21_470));
    expect(result.writeOff).toEqual({
      leftTodayDrop: usd(25_000),
      leftTodayAfter: usd(-3_530),
    });
    // $3,400.00 / 17 = $200.00 once the $250.00 is in savings.
    const byTarget = new Map(result.transfers.map((t) => [t.toAccountId, t]));
    expect(byTarget.get(ids.everyday)).toMatchObject({
      leftTodayDrop: usd(0),
      leftTodayAfter: usd(21_470),
    });
    expect(byTarget.get(ids.savings)).toMatchObject({
      leftTodayDrop: usd(1_470),
      leftTodayAfter: usd(20_000),
    });
    expect(byTarget.get(ids.spare)).toMatchObject({
      leftTodayDrop: usd(0),
      leftTodayAfter: usd(21_470),
    });
    expect(result.transfers).toHaveLength(3);
    // Nothing is recorded.
    expect(await leftToday()).toBe(21_470);
  });

  it('matches what archiving then does to today’s figure', async () => {
    const before = await leftToday();
    const { transfers } = await impact(h.alice, ids.wallet);
    const drop = transfers.find((t) => t.toAccountId === ids.savings);
    const response = await h.alice.post(`/v1/accounts/${ids.wallet}/archive`, {
      settle: { method: 'transfer', toAccountId: ids.savings },
    });
    expect(response.status).toBe(200);
    expect(await leftToday()).toBe(
      before - (drop?.leftTodayDrop.amountMinor ?? Number.NaN),
    );
    expect(await leftToday()).toBe(drop?.leftTodayAfter.amountMinor);
  });

  it('leaves out archived accounts as targets and is zero for an empty account', async () => {
    const result = await impact(h.alice, ids.spare);
    expect(result.writeOff).toEqual({
      leftTodayDrop: usd(0),
      leftTodayAfter: result.leftToday,
    });
    expect(result.transfers.map((t) => t.toAccountId).sort()).toEqual(
      [ids.everyday, ids.savings].sort(),
    );
  });

  it('does not show another user’s account', async () => {
    const response = await h.bob.get(
      `/v1/accounts/${ids.everyday}/archive-impact`,
    );
    expect(response.status).toBe(404);
  });
});
