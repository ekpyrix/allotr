import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient, TestResponse } from './testing/http-client.ts';
import { startWithTwoUsers, userIdOf, type TwoUsers } from './testing/users.ts';

// Pools through the API against real SQLite and migrations (ADR 0021): the
// default Budget and Savings pools, moving accounts, and the setting that
// lets a savings pool count. The clock is fixed to 15 March 2026. All
// figures are made up.

type Money = { amountMinor: number; currency: string };
type Pool = {
  id: string;
  name: string;
  kind: string;
  countsTowardDaily: boolean;
  counts: boolean;
  defaultFor: 'on' | 'off' | null;
  archived: boolean;
  accountIds: string[];
  balance: { amount: Money; missingRates: string[] };
};
type Account = { id: string; budgetGroup: string; poolId: string };

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

async function pools(client: TestClient, query = ''): Promise<Pool[]> {
  const response = await client.get(`/v1/pools${query}`);
  expect(response.status).toBe(200);
  return (response.body as { pools: Pool[] }).pools;
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

function code(response: TestResponse): unknown {
  return (response.body as { code?: string }).code;
}

const todayOf = async (client: TestClient) =>
  (
    (await client.get('/v1/today')).body as {
      onBudget: Money;
      available: Money;
    }
  ).onBudget;

describe('default pools', () => {
  it('exist for every user, Budget counting and Savings not', async () => {
    const list = await pools(h.alice);
    expect(list.map((p) => [p.name, p.kind, p.defaultFor, p.counts])).toEqual([
      ['Budget', 'spending', 'on', true],
      ['Savings', 'savings', 'off', false],
    ]);
    expect(await pools(h.bob)).toHaveLength(2);
  });

  it('hold accounts by their budget group', async () => {
    const everyday = await open(h.alice, 'Everyday', 100_000, 'on');
    const rainy = await open(h.alice, 'Rainy day', 40_000, 'off');
    expect(everyday.poolId).not.toBe(rainy.poolId);
    const [budget, savings] = await pools(h.alice);
    expect(budget?.accountIds).toEqual([everyday.id]);
    expect(budget?.balance.amount).toEqual(usd(100_000));
    expect(savings?.accountIds).toEqual([rainy.id]);
    expect(savings?.balance.amount).toEqual(usd(40_000));
  });

  it('are not shared between users', async () => {
    const aliceIds = (await pools(h.alice)).map((p) => p.id);
    const bobIds = (await pools(h.bob)).map((p) => p.id);
    expect(aliceIds.some((id) => bobIds.includes(id))).toBe(false);
    const stolen = await h.bob.patch(`/v1/pools/${aliceIds[0] ?? ''}`, {
      name: 'Mine',
    });
    expect(stolen.status).toBe(404);
  });
});

describe('moving accounts between pools', () => {
  it('moves an account into a new pool from today', async () => {
    const spare = await open(h.alice, 'Spare cash', 30_000, 'on');
    const created = await h.alice.post('/v1/pools', {
      name: 'Emergency',
      kind: 'savings',
    });
    expect(created.status).toBe(201);
    const emergency = created.body as Pool;
    expect(emergency).toMatchObject({
      countsTowardDaily: false,
      counts: false,
      defaultFor: null,
    });

    const before = await todayOf(h.alice);
    const moved = await h.alice.put(`/v1/accounts/${spare.id}/pool`, {
      poolId: emergency.id,
    });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({
      poolId: emergency.id,
      budgetGroup: 'off',
    });
    expect((await todayOf(h.alice)).amountMinor).toBe(
      before.amountMinor - 30_000,
    );
    const list = await pools(h.alice);
    expect(list.find((p) => p.id === emergency.id)?.balance.amount).toEqual(
      usd(30_000),
    );
  });

  it('keeps savings out of the daily number even when a pool says it counts', async () => {
    const [, , emergency] = await pools(h.alice);
    if (emergency === undefined) throw new Error('missing pool');
    const before = await todayOf(h.alice);
    const patched = await h.alice.patch(`/v1/pools/${emergency.id}`, {
      countsTowardDaily: true,
    });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      countsTowardDaily: true,
      counts: false,
    });
    expect(await todayOf(h.alice)).toEqual(before);
  });

  it('counts a savings pool once the setting is on, and not before', async () => {
    const [, , emergency] = await pools(h.alice);
    const before = await todayOf(h.alice);
    const on = await h.alice.patch('/v1/settings/ledger', {
      countSavingsInDaily: true,
    });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ countSavingsInDaily: true });
    expect((await todayOf(h.alice)).amountMinor).toBe(
      before.amountMinor + 30_000,
    );
    expect(
      (await pools(h.alice)).find((p) => p.id === emergency?.id)?.counts,
    ).toBe(true);
    // The default Savings pool's own switch is off, so it still never counts.
    expect((await pools(h.alice))[1]?.counts).toBe(false);

    await h.alice.patch('/v1/settings/ledger', { countSavingsInDaily: false });
    expect(await todayOf(h.alice)).toEqual(before);
  });

  it('refuses unknown or archived targets', async () => {
    const [budget] = await pools(h.alice);
    const accounts = (
      (await h.alice.get('/v1/accounts')).body as { accounts: Account[] }
    ).accounts;
    const id = accounts[0]?.id ?? '';
    const unknown = await h.alice.put(`/v1/accounts/${id}/pool`, {
      poolId: 'nope',
    });
    expect(unknown.status).toBe(404);
    expect(code(unknown)).toBe('pool_not_found');
    const other = await h.bob.put(`/v1/accounts/${id}/pool`, {
      poolId: budget?.id,
    });
    expect(other.status).toBe(404);
  });

  it('applies a back-dated move to past days and leaves entries alone', async () => {
    const travel = await open(h.alice, 'Travel fund', 20_000, 'on');
    const [, , emergency] = await pools(h.alice);
    const before = (await h.alice.get('/v1/transactions')).body;
    const moved = await h.alice.put(`/v1/accounts/${travel.id}/pool`, {
      poolId: emergency?.id,
      effectiveOn: '2026-03-10',
    });
    expect(moved.status).toBe(200);
    expect((await h.alice.get('/v1/transactions')).body).toEqual(before);
    // Moving back today is its own row; the history of moves is kept.
    const rows = await h.db
      .selectFrom('pool_moves')
      .select('effective_on')
      .where('user_id', '=', await userIdOf(h.alice))
      .orderBy('effective_on')
      .execute();
    expect(rows.map((r) => r.effective_on)).toContain('2026-03-10');
  });

  it('never updates or deletes a recorded move', async () => {
    await expect(
      h.db
        .updateTable('pool_moves')
        .set({ effective_on: '2026-01-01' })
        .execute(),
    ).rejects.toThrow(/append-only/);
    await expect(h.db.deleteFrom('pool_moves').execute()).rejects.toThrow(
      /append-only/,
    );
  });
});

describe('editing pools', () => {
  it('rejects a name already in use', async () => {
    const taken = await h.alice.post('/v1/pools', {
      name: 'emergency',
      kind: 'savings',
    });
    expect(taken.status).toBe(409);
    expect(code(taken)).toBe('pool_name_taken');
  });

  it('keeps the Budget pool counting and the defaults unarchived', async () => {
    const [budget, savings] = await pools(h.alice);
    const off = await h.alice.patch(`/v1/pools/${budget?.id ?? ''}`, {
      countsTowardDaily: false,
    });
    expect(off.status).toBe(409);
    expect(code(off)).toBe('pool_fixed');
    const archived = await h.alice.patch(`/v1/pools/${savings?.id ?? ''}`, {
      archived: true,
    });
    expect(code(archived)).toBe('pool_fixed');
  });

  it('archives only an empty pool', async () => {
    const [, , emergency] = await pools(h.alice);
    const full = await h.alice.patch(`/v1/pools/${emergency?.id ?? ''}`, {
      archived: true,
    });
    expect(full.status).toBe(409);
    expect(code(full)).toBe('pool_not_empty');

    const empty = (
      await h.alice.post('/v1/pools', { name: 'Holiday', kind: 'spending' })
    ).body as Pool;
    expect(empty.countsTowardDaily).toBe(true);
    const gone = await h.alice.patch(`/v1/pools/${empty.id}`, {
      archived: true,
    });
    expect(gone.status).toBe(200);
    expect((await pools(h.alice)).some((p) => p.id === empty.id)).toBe(false);
    expect(
      (await pools(h.alice, '?includeArchived=true')).some(
        (p) => p.id === empty.id,
      ),
    ).toBe(true);
    const into = await h.alice.put(
      `/v1/accounts/${(await open(h.alice, 'Odd', 100, 'on')).id}/pool`,
      { poolId: empty.id },
    );
    expect(code(into)).toBe('pool_archived');
  });
});
