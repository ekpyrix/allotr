import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient, TestResponse } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Budgets through the API against real SQLite and migrations (ADR 0021).
// The clock is fixed to 15 March 2026 and payday is the 1st, so 17 days are
// left in the cycle. All names and amounts are made up.

type Money = { amountMinor: number; currency: string };
type Budget = {
  id: string;
  name: string;
  target: { kind: string; categoryId?: string; tagId?: string };
  mode: string;
  leftover: string;
  amount: Money;
  planned: Money;
  carriedIn: Money;
  spent: Money;
  left: Money;
  held: Money;
  coveredOut: Money;
  restored: Money;
};
type Status = {
  period: { from: string; to: string };
  periodRule: string;
  daysLeft: number;
  budgets: Budget[];
  available: Money;
  held: Money;
  free: Money;
  dailyLeft: Money;
  unbudgeted: Money;
  dailyMode: string;
  dailyNumber: Money;
};

const started = new Date('2026-03-15T12:00:00Z');
// The clock moves on a millisecond per call, so entries made on the same day
// keep the order they were recorded in, which cover depends on.
let tick = 0;
const clock = () => new Date(started.getTime() + (tick += 1));
let h: TwoUsers;
let everyday = '';
const ids: Record<string, string> = {};

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

beforeAll(async () => {
  h = await startWithTwoUsers({ now: clock });
  await h.db
    .updateTable('users')
    .set({ created_at: started.toISOString() })
    .execute();
  const account = await h.alice.post('/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
    openingBalance: usd(500_000),
  });
  everyday = (account.body as { id: string }).id;
  const categories = (
    (await h.alice.get('/v1/categories')).body as {
      categories: { id: string; name: string }[];
    }
  ).categories;
  for (const name of ['Food', 'Groceries', 'Other', 'Paycheck'])
    ids[name] = categories.find((c) => c.name === name)?.id ?? '';
  const travel = await h.alice.post('/v1/categories', {
    name: 'Travel',
    kind: 'expense',
  });
  ids.Travel = (travel.body as { id: string }).id;
  const trip = await h.alice.post('/v1/tags', { name: 'trip' });
  ids.trip = (trip.body as { id: string }).id;
});

afterAll(async () => {
  await h.close();
});

async function status(client: TestClient = h.alice): Promise<Status> {
  const response = await client.get('/v1/budgets');
  expect(response.status).toBe(200);
  return response.body as Status;
}

function find(s: Status, name: string): Budget {
  const found = s.budgets.find((b) => b.name === name);
  if (found === undefined) throw new Error(`no budget ${name}`);
  return found;
}

function code(response: TestResponse): unknown {
  return (response.body as { code?: string }).code;
}

async function spend(
  category: string,
  amountMinor: number,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const response = await h.alice.post('/v1/transactions', {
    kind: 'expense',
    accountId: everyday,
    amount: usd(amountMinor),
    categoryId: category,
    occurredOn: '2026-03-15',
    ...extra,
  });
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

async function today(client: TestClient = h.alice) {
  return (await client.get('/v1/today')).body as {
    liveDaily: Money;
    leftToday: Money;
    available: Money;
  };
}

describe('a new user', () => {
  it('has an empty Buffer and free money equal to what is available', async () => {
    const s = await status();
    expect(s.budgets.map((b) => b.name)).toEqual(['Buffer']);
    expect(find(s, 'Buffer')).toMatchObject({
      target: { kind: 'buffer' },
      mode: 'set-aside',
      leftover: 'carry',
      planned: usd(0),
      held: usd(0),
    });
    expect(s).toMatchObject({
      period: { from: '2026-03-15', to: '2026-04-01' },
      periodRule: 'cycle',
      daysLeft: 17,
      dailyMode: 'free',
      available: usd(500_000),
      held: usd(0),
      free: usd(500_000),
      dailyNumber: usd(29_411),
    });
    expect((await today()).liveDaily).toEqual(usd(29_411));
  });

  it('does not see the budgets of another user', async () => {
    const mine = await status();
    const bobs = await status(h.bob);
    expect(bobs.budgets).toHaveLength(1);
    const buffer = find(mine, 'Buffer').id;
    expect(
      (await h.bob.patch(`/v1/budgets/${buffer}`, { name: 'x' })).status,
    ).toBe(404);
  });
});

describe('daily and set-aside budgets', () => {
  it('counts a child category toward its parent budget', async () => {
    const created = await h.alice.post('/v1/budgets', {
      name: 'Food',
      target: { kind: 'category', categoryId: ids.Food },
      amount: usd(90_000),
    });
    expect(created.status).toBe(201);
    await spend(ids.Groceries ?? '', 12_000);
    const food = find(await status(), 'Food');
    expect(food).toMatchObject({
      mode: 'daily',
      leftover: 'free',
      planned: usd(90_000),
      spent: usd(12_000),
      left: usd(78_000),
      held: usd(0),
    });
  });

  it('keeps a daily budget inside the daily number', async () => {
    const s = await status();
    expect(s.dailyLeft).toEqual(usd(78_000));
    expect(s.free).toEqual(usd(488_000));
    expect(s.dailyNumber).toEqual(usd(28_705));
  });

  it('holds a set-aside budget out of free money', async () => {
    const created = await h.alice.post('/v1/budgets', {
      name: 'Travel',
      target: { kind: 'category', categoryId: ids.Travel },
      amount: usd(30_000),
      mode: 'set-aside',
    });
    expect(created.status).toBe(201);
    const s = await status();
    expect(find(s, 'Travel')).toMatchObject({
      leftover: 'carry',
      held: usd(30_000),
      left: usd(30_000),
    });
    expect(s.held).toEqual(usd(30_000));
    expect(s.free).toEqual(usd(458_000));
    expect((await today()).liveDaily).toEqual(usd(26_941));
  });

  it('lets spending inside the hold leave the daily number alone', async () => {
    const before = await today();
    await spend(ids.Travel ?? '', 10_000);
    const after = await today();
    expect(after.available.amountMinor).toBe(
      before.available.amountMinor - 10_000,
    );
    expect(after.liveDaily).toEqual(before.liveDaily);
    expect(after.leftToday).toEqual(before.leftToday);
    expect(find(await status(), 'Travel')).toMatchObject({
      spent: usd(10_000),
      held: usd(20_000),
    });
  });

  it('prefers a tag budget over a category budget', async () => {
    await h.alice.post('/v1/budgets', {
      name: 'Trip',
      target: { kind: 'tag', tagId: ids.trip },
      amount: usd(50_000),
    });
    await spend(ids.Food ?? '', 4_000, { tagIds: [ids.trip] });
    const s = await status();
    expect(find(s, 'Trip').spent).toEqual(usd(4_000));
    expect(find(s, 'Food').spent).toEqual(usd(12_000));
  });

  it('counts spending no budget covers as unbudgeted', async () => {
    await spend(ids.Other ?? '', 2_500);
    expect((await status()).unbudgeted).toEqual(usd(2_500));
  });

  it('gives back an undone entry', async () => {
    const id = await spend(ids.Groceries ?? '', 3_000);
    expect(find(await status(), 'Food').spent).toEqual(usd(15_000));
    const undo = await h.alice.post(`/v1/transactions/${id}/reverse`, {});
    expect(undo.status).toBe(201);
    expect(find(await status(), 'Food').spent).toEqual(usd(12_000));
  });
});

describe('daily number modes and period', () => {
  it('follows the mode setting', async () => {
    const free = await status();
    const set = await h.alice.patch('/v1/settings/ledger', {
      dailyMode: 'pool-minus-bills',
    });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ dailyMode: 'pool-minus-bills' });
    const pool = await status();
    expect(pool.dailyNumber.amountMinor).toBeGreaterThan(
      free.dailyNumber.amountMinor,
    );
    expect(pool.dailyNumber).toEqual((await today()).liveDaily);

    await h.alice.patch('/v1/settings/ledger', { dailyMode: 'daily-budgets' });
    const daily = await status();
    expect(daily.dailyNumber.amountMinor).toBe(
      Math.floor(daily.dailyLeft.amountMinor / daily.daysLeft),
    );
    await h.alice.patch('/v1/settings/ledger', { dailyMode: 'free' });
    expect(await status()).toEqual(free);
  });

  it('uses calendar months when asked', async () => {
    await h.alice.patch('/v1/settings/ledger', { budgetPeriod: 'month' });
    const s = await status();
    expect(s.periodRule).toBe('month');
    expect(s.period).toEqual({ from: '2026-03-01', to: '2026-04-01' });
    await h.alice.patch('/v1/settings/ledger', { budgetPeriod: 'cycle' });
    expect((await status()).periodRule).toBe('cycle');
  });

  it('rejects an unknown mode', async () => {
    const bad = await h.alice.patch('/v1/settings/ledger', { dailyMode: 'x' });
    expect(bad.status).toBe(400);
  });
});

describe('changing budgets', () => {
  it('changes the amount from this period', async () => {
    const food = find(await status(), 'Food');
    const patched = await h.alice.patch(`/v1/budgets/${food.id}`, {
      amount: usd(100_000),
    });
    expect(patched.status).toBe(200);
    expect(find(patched.body as Status, 'Food').planned).toEqual(usd(100_000));
    const rows = await h.db
      .selectFrom('budget_amounts')
      .select(['amount_minor', 'effective_on'])
      .where('budget_id', '=', food.id)
      .execute();
    expect(rows).toEqual([
      { amount_minor: 100_000, effective_on: '2026-03-15' },
    ]);
  });

  it('plans an amount for the Buffer and holds it', async () => {
    const buffer = find(await status(), 'Buffer');
    const before = await status();
    const patched = await h.alice.patch(`/v1/budgets/${buffer.id}`, {
      amount: usd(20_000),
    });
    expect(patched.status).toBe(200);
    const after = patched.body as Status;
    // Spending earlier in the file may already have been covered from it.
    const buf = find(after, 'Buffer');
    expect(buf.planned).toEqual(usd(20_000));
    expect(buf.held.amountMinor).toBe(
      20_000 - buf.coveredOut.amountMinor + buf.restored.amountMinor,
    );
    expect(after.free.amountMinor).toBe(
      before.free.amountMinor - buf.held.amountMinor,
    );
    const fixed = await h.alice.patch(`/v1/budgets/${buffer.id}`, {
      mode: 'daily',
    });
    expect(fixed.status).toBe(409);
    expect(code(fixed)).toBe('budget_fixed');
    expect((await h.alice.delete(`/v1/budgets/${buffer.id}`)).status).toBe(409);
  });

  it('ends a budget and counts its spending as unbudgeted', async () => {
    const trip = find(await status(), 'Trip');
    const before = await status();
    expect((await h.alice.delete(`/v1/budgets/${trip.id}`)).status).toBe(204);
    const after = await status();
    expect(after.budgets.some((b) => b.name === 'Trip')).toBe(false);
    // The tagged 40.00 is now counted by the Food budget it also belongs to.
    expect(find(after, 'Food').spent).toEqual(usd(16_000));
    expect(after.unbudgeted).toEqual(before.unbudgeted);
    expect((await h.alice.delete(`/v1/budgets/${trip.id}`)).status).toBe(404);
  });

  it('keeps a budget row after it ends, so history stays', async () => {
    const rows = await h.db
      .selectFrom('budgets')
      .select(['name', 'ended_on'])
      .where('name', '=', 'Trip')
      .execute();
    expect(rows).toEqual([{ name: 'Trip', ended_on: '2026-03-14' }]);
  });
});

describe('deleting a budget', () => {
  it('removes one started this period as if it was never planned', async () => {
    const created = await h.alice.post('/v1/budgets', {
      name: 'Mistake',
      target: { kind: 'category', categoryId: ids.Other },
      amount: usd(1_000),
    });
    expect(created.status).toBe(201);
    const mistake = find(created.body as Status, 'Mistake');
    const response = await h.alice.delete(
      `/v1/budgets/${mistake.id}?mode=delete`,
    );
    expect(response.status).toBe(204);
    expect((await status()).budgets.some((b) => b.name === 'Mistake')).toBe(
      false,
    );
    const rows = await h.db
      .selectFrom('budgets')
      .select('id')
      .where('id', '=', mistake.id)
      .execute();
    expect(rows).toEqual([]);
    // The category is free for a budget again.
    const again = await h.alice.post('/v1/budgets', {
      name: 'Mistake',
      target: { kind: 'category', categoryId: ids.Other },
      amount: usd(1_000),
    });
    expect(again.status).toBe(201);
    const next = find(again.body as Status, 'Mistake');
    expect(
      (await h.alice.delete(`/v1/budgets/${next.id}?mode=delete`)).status,
    ).toBe(204);
    expect(
      (await h.alice.delete(`/v1/budgets/${next.id}?mode=delete`)).status,
    ).toBe(404);
  });

  it('refuses the Buffer and a budget a closed period used', async () => {
    const buffer = (await status()).budgets.find(
      (b) => b.target.kind === 'buffer',
    );
    const refused = await h.alice.delete(
      `/v1/budgets/${buffer?.id ?? ''}?mode=delete`,
    );
    expect(refused.status).toBe(409);
    expect(code(refused)).toBe('budget_fixed');

    // A budget from the period before this one (the trigger fixes started_on,
    // so it is inserted that way).
    const alice = await h.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', 'alice@example.test')
      .executeTakeFirstOrThrow();
    const budget = { id: 'old-plan' };
    await h.db
      .insertInto('budgets')
      .values({
        id: budget.id,
        user_id: alice.id,
        name: 'Old plan',
        kind: 'category',
        category_id: ids.Other ?? '',
        tag_id: null,
        mode: 'daily',
        leftover: 'free',
        started_on: '2026-02-10',
        created_at: '2026-02-10T00:00:00Z',
        updated_at: '2026-02-10T00:00:00Z',
      })
      .execute();
    const used = await h.alice.delete(`/v1/budgets/${budget.id}?mode=delete`);
    expect(used.status).toBe(409);
    expect(code(used)).toBe('budget_used');
    // It can still be ended.
    expect((await h.alice.delete(`/v1/budgets/${budget.id}`)).status).toBe(204);
  });
});

describe('validation', () => {
  it('needs the default currency and an amount above zero', async () => {
    const euro = await h.alice.post('/v1/budgets', {
      name: 'Euro',
      target: { kind: 'category', categoryId: ids.Other },
      amount: { amountMinor: 1_000, currency: 'EUR' },
    });
    expect(euro.status).toBe(400);
    expect(code(euro)).toBe('budget_currency');
    const zero = await h.alice.post('/v1/budgets', {
      name: 'Zero',
      target: { kind: 'category', categoryId: ids.Other },
      amount: usd(0),
    });
    expect(code(zero)).toBe('invalid_amount');
  });

  it('refuses a second budget on the same category or name', async () => {
    const again = await h.alice.post('/v1/budgets', {
      name: 'Food again',
      target: { kind: 'category', categoryId: ids.Food },
      amount: usd(1_000),
    });
    expect(again.status).toBe(409);
    expect(code(again)).toBe('budget_taken');
    const name = await h.alice.post('/v1/budgets', {
      name: 'food',
      target: { kind: 'category', categoryId: ids.Other },
      amount: usd(1_000),
    });
    expect(code(name)).toBe('budget_taken');
  });

  it('refuses income categories and other users’ categories', async () => {
    const income = await h.alice.post('/v1/budgets', {
      name: 'Pay',
      target: { kind: 'category', categoryId: ids.Paycheck },
      amount: usd(1_000),
    });
    expect(code(income)).toBe('invalid_budget_category');
    const bobs = (
      (await h.bob.get('/v1/categories')).body as {
        categories: { id: string }[];
      }
    ).categories[0]?.id;
    const stolen = await h.alice.post('/v1/budgets', {
      name: 'Stolen',
      target: { kind: 'category', categoryId: bobs },
      amount: usd(1_000),
    });
    expect(stolen.status).toBe(404);
  });
});
