import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient, TestResponse } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Savings goals through the API against real SQLite and migrations (ADR
// 0021): earmarks on savings pools and accounts, with progress read from the
// ledger. The clock is fixed to 15 March 2026. All figures are made up.

type Money = { amountMinor: number; currency: string };
type Goal = {
  id: string;
  name: string;
  poolId: string | null;
  accountId: string | null;
  target: Money;
  targetOn: string | null;
  archived: boolean;
  saved: Money;
  remaining: Money;
  reached: boolean;
};
type Account = { id: string; poolId: string };
type Pool = { id: string; defaultFor: string | null };

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

async function goals(client: TestClient, query = ''): Promise<Goal[]> {
  const response = await client.get(`/v1/goals${query}`);
  expect(response.status).toBe(200);
  return (response.body as { goals: Goal[] }).goals;
}

async function open(
  client: TestClient,
  name: string,
  amountMinor: number,
  budgetGroup: 'on' | 'off',
): Promise<Account> {
  const response = await client.post('/v1/accounts', {
    name,
    currency: 'USD',
    budgetGroup,
    openingBalance: usd(amountMinor),
  });
  expect(response.status).toBe(201);
  return response.body as Account;
}

async function savingsPool(client: TestClient): Promise<Pool> {
  const list = ((await client.get('/v1/pools')).body as { pools: Pool[] })
    .pools;
  const found = list.find((p) => p.defaultFor === 'off');
  expect(found).toBeDefined();
  return found as Pool;
}

function code(response: TestResponse): unknown {
  return (response.body as { code?: string }).code;
}

describe('goals on savings', () => {
  it('track a pool and read progress from its balance', async () => {
    await open(h.alice, 'Rainy day', 40_000, 'off');
    const pool = await savingsPool(h.alice);
    const created = await h.alice.post('/v1/goals', {
      name: 'Emergency fund',
      poolId: pool.id,
      target: usd(100_000),
      targetOn: '2026-12-31',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Emergency fund',
      poolId: pool.id,
      accountId: null,
      targetOn: '2026-12-31',
      saved: usd(40_000),
      remaining: usd(60_000),
      reached: false,
    });
  });

  it('track one account and report it reached', async () => {
    const trip = await open(h.alice, 'Trip jar', 25_000, 'off');
    const created = await h.alice.post('/v1/goals', {
      name: 'Trip',
      accountId: trip.id,
      target: usd(20_000),
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      saved: usd(25_000),
      remaining: usd(0),
      reached: true,
      targetOn: null,
    });
  });

  it('refuse a second goal on the same target', async () => {
    const pool = await savingsPool(h.alice);
    const again = await h.alice.post('/v1/goals', {
      name: 'Another',
      poolId: pool.id,
      target: usd(5_000),
    });
    expect(again.status).toBe(409);
    expect(code(again)).toBe('goal_target_taken');
  });

  it('refuse a name another active goal has', async () => {
    const other = await open(h.alice, 'Gadget jar', 1_000, 'off');
    const clash = await h.alice.post('/v1/goals', {
      name: 'emergency FUND',
      accountId: other.id,
      target: usd(5_000),
    });
    expect(clash.status).toBe(409);
    expect(code(clash)).toBe('goal_name_taken');
  });

  it('refuse a target that is not savings', async () => {
    const everyday = await open(h.alice, 'Everyday', 90_000, 'on');
    const account = await h.alice.post('/v1/goals', {
      name: 'Nope',
      accountId: everyday.id,
      target: usd(5_000),
    });
    expect(account.status).toBe(409);
    expect(code(account)).toBe('goal_not_savings');
    const pools = ((await h.alice.get('/v1/pools')).body as { pools: Pool[] })
      .pools;
    const budget = pools.find((p) => p.defaultFor === 'on');
    const pool = await h.alice.post('/v1/goals', {
      name: 'Nope too',
      poolId: budget?.id,
      target: usd(5_000),
    });
    expect(pool.status).toBe(409);
    expect(code(pool)).toBe('goal_not_savings');
  });

  it('need exactly one target and a positive amount', async () => {
    const pool = await savingsPool(h.alice);
    const none = await h.alice.post('/v1/goals', {
      name: 'No target',
      target: usd(5_000),
    });
    expect(none.status).toBe(400);
    const zero = await h.alice.post('/v1/goals', {
      name: 'Zero',
      poolId: pool.id,
      target: usd(0),
    });
    expect(zero.status).toBe(400);
  });
});

describe('changing goals', () => {
  it('rename, retarget, clear the date and archive', async () => {
    const first = (await goals(h.alice)).find(
      (g) => g.name === 'Emergency fund',
    );
    expect(first).toBeDefined();
    const id = first?.id ?? '';
    const changed = await h.alice.patch(`/v1/goals/${id}`, {
      name: 'Rainy fund',
      targetMinor: 80_000,
      targetOn: null,
    });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({
      name: 'Rainy fund',
      target: usd(80_000),
      remaining: usd(80_000 - (first?.saved.amountMinor ?? 0)),
      targetOn: null,
    });

    const archived = await h.alice.patch(`/v1/goals/${id}`, {
      archived: true,
    });
    expect(archived.status).toBe(200);
    expect((await goals(h.alice)).map((g) => g.id)).not.toContain(id);
    expect(
      (await goals(h.alice, '?includeArchived=true')).map((g) => g.id),
    ).toContain(id);
  });

  it('let an archived goal free its target for a new one', async () => {
    const pool = await savingsPool(h.alice);
    const fresh = await h.alice.post('/v1/goals', {
      name: 'New fund',
      poolId: pool.id,
      target: usd(70_000),
    });
    expect(fresh.status).toBe(201);
    const [old] = await goals(h.alice, '?includeArchived=true').then((all) =>
      all.filter((g) => g.archived),
    );
    const restore = await h.alice.patch(`/v1/goals/${old?.id ?? ''}`, {
      archived: false,
    });
    expect(restore.status).toBe(409);
    expect(code(restore)).toBe('goal_target_taken');
  });

  it('follow the balance when an account moves out of the pool', async () => {
    const pool = await savingsPool(h.alice);
    const [fund] = (await goals(h.alice)).filter((g) => g.poolId === pool.id);
    const before = fund?.saved.amountMinor ?? 0;
    const extra = await open(h.alice, 'Bonus jar', 10_000, 'off');
    const after = (await goals(h.alice)).find((g) => g.id === fund?.id);
    expect(after?.saved.amountMinor).toBe(before + 10_000);
    await h.alice.put(`/v1/accounts/${extra.id}/pool`, {
      poolId: (
        await h.alice
          .get('/v1/pools')
          .then((r) =>
            (r.body as { pools: Pool[] }).pools.find(
              (p) => p.defaultFor === 'on',
            ),
          )
      )?.id,
    });
    const moved = (await goals(h.alice)).find((g) => g.id === fund?.id);
    expect(moved?.saved.amountMinor).toBe(before);
  });
});

describe('goal privacy', () => {
  it('are not visible or editable to another user', async () => {
    const mine = (await goals(h.alice))[0];
    expect(await goals(h.bob)).toEqual([]);
    const stolen = await h.bob.patch(`/v1/goals/${mine?.id ?? ''}`, {
      name: 'Mine now',
    });
    expect(stolen.status).toBe(404);
    const foreign = await h.bob.post('/v1/goals', {
      name: 'Borrowed',
      poolId: (await savingsPool(h.alice)).id,
      target: usd(5_000),
    });
    expect(foreign.status).toBe(404);
  });
});
