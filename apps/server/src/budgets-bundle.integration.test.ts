import { bundleSchema } from '@allotr/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, userIdOf, type TwoUsers } from './testing/users.ts';

// Pools, budgets and cover in the export and import bundle (#213, ADR 0021):
// the JSON export writes the budget setup, and an import on an empty ledger
// brings back the same pools, budgets, cover order, overrides and figures.
// The clock is 20 March 2026. Names and amounts are made up.

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
const clock = { now: new Date('2026-03-20T12:00:00Z') };
let h: TwoUsers;
let exported: unknown;

// Ids differ between users, and rows made in the same instant list in id
// order, so lists of named things are compared by name.
function comparable(value: unknown): Json {
  if (Array.isArray(value)) {
    const items = value.map(comparable);
    return items.every(
      (i) => typeof i === 'object' && i !== null && 'name' in i,
    )
      ? items.sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))
      : items;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !/(^id$|Id$|Ids$|^createdAt$|^source$)/.test(k))
        .map(([k, v]) => [
          k,
          // A name an archived pool or an ended budget gave up is suffixed.
          k === 'name' && typeof v === 'string'
            ? v.replace(/ \((archived|ended)( \d+)?\)$/, '')
            : comparable(v),
        ]),
    );
  }
  return value as Json;
}

const byJson = (x: unknown, y: unknown) =>
  JSON.stringify(x).localeCompare(JSON.stringify(y));

async function figures(client: TwoUsers['alice']) {
  const [budgets, pools, covers, today, accounts, settings] = await Promise.all(
    [
      client.get('/v1/budgets'),
      client.get('/v1/pools?includeArchived=true'),
      client.get('/v1/budgets/covers'),
      client.get('/v1/today'),
      client.get('/v1/accounts?includeArchived=true'),
      client.get('/v1/settings/ledger'),
    ],
  );
  for (const r of [budgets, pools, covers, today, accounts, settings]) {
    expect(r.status).toBe(200);
  }
  // Covers name their entries by id; their order and sums are what matter.
  const { period, covers: list } = covers.body as {
    period: unknown;
    covers: { entryId: string }[];
  };
  return comparable({
    budgets: budgets.body,
    pools: pools.body,
    covers: {
      period,
      covers: list.map((c) => comparable(c)).sort(byJson),
    },
    today: today.body,
    accounts: accounts.body,
    settings: settings.body,
  });
}

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => clock.now });
  for (const client of [h.alice, h.bob]) {
    await h.db
      .updateTable('users')
      .set({ created_at: '2026-03-01T12:00:00.000Z' })
      .where('id', '=', await userIdOf(client))
      .execute();
  }
  const a = h.alice;
  const ok = async (r: Promise<{ status: number; body: unknown }>) => {
    const response = await r;
    expect(response.status, JSON.stringify(response.body)).toBeLessThan(300);
    return response.body as Record<string, unknown>;
  };
  await ok(
    a.patch('/v1/settings/ledger', {
      defaultCurrency: 'USD',
      paydayDay: 25,
      dailyMode: 'daily-budgets',
      budgetPeriod: 'month',
      countSavingsInDaily: true,
    }),
  );
  const open = async (name: string, minor: number, budgetGroup: string) =>
    (
      await ok(
        a.post('/v1/accounts', {
          name,
          currency: 'USD',
          budgetGroup,
          openingBalance: usd(minor),
          openedOn: '2026-03-01',
        }),
      )
    ).id as string;
  const card = await open('Card', 200_000, 'on');
  const jar = await open('Jar', 50_000, 'on');
  await open('Vault', 80_000, 'off');

  const categories = (
    (await a.get('/v1/categories')).body as {
      categories: { id: string; name: string }[];
    }
  ).categories;
  const cat = (name: string) =>
    categories.find((c) => c.name === name)?.id ?? '';
  const trip = (
    (await ok(a.post('/v1/tags', { name: 'trip' }))) as { id: string }
  ).id;

  // A pool of its own, an account moved into it, and one pool given up.
  const rainy = (
    (await ok(a.post('/v1/pools', { name: 'Rainy day', kind: 'savings' }))) as {
      id: string;
    }
  ).id;
  const old = (
    (await ok(
      a.post('/v1/pools', {
        name: 'Rainy day 2',
        kind: 'spending',
      }),
    )) as { id: string }
  ).id;
  await ok(
    a.put(`/v1/accounts/${jar}/pool`, {
      poolId: old,
      effectiveOn: '2026-03-05',
    }),
  );
  await ok(
    a.put(`/v1/accounts/${jar}/pool`, {
      poolId: rainy,
      effectiveOn: '2026-03-12',
    }),
  );
  await ok(a.patch(`/v1/pools/${old}`, { archived: true, name: 'Rainy day' }));

  const plan = (body: Record<string, unknown>) =>
    ok(a.post('/v1/budgets', body));
  await plan({
    name: 'Food',
    target: { kind: 'category', categoryId: cat('Food') },
    amount: usd(30_000),
  });
  await plan({
    name: 'Fun',
    target: { kind: 'category', categoryId: cat('Fun') },
    amount: usd(10_000),
    mode: 'set-aside',
  });
  await plan({
    name: 'Trips',
    target: { kind: 'tag', tagId: trip },
    amount: usd(25_000),
    leftover: 'carry',
  });
  await plan({
    name: 'Shopping',
    target: { kind: 'category', categoryId: cat('Shopping') },
    amount: usd(5_000),
  });
  const listed = async () =>
    (
      (await a.get('/v1/budgets')).body as {
        budgets: { id: string; name: string }[];
      }
    ).budgets;
  const idIn = (list: { id: string; name: string }[], name: string) =>
    list.find((b) => b.name === name)?.id ?? '';
  // A raise from a later day, a Buffer with an amount, and an ended budget
  // whose name a new one takes over.
  const first = await listed();
  clock.now = new Date('2026-03-21T12:00:00Z');
  await ok(
    a.patch(`/v1/budgets/${idIn(first, 'Food')}`, { amount: usd(35_000) }),
  );
  await ok(
    a.patch(`/v1/budgets/${idIn(first, 'Buffer')}`, { amount: usd(20_000) }),
  );
  await ok(a.delete(`/v1/budgets/${idIn(first, 'Shopping')}`));
  await plan({
    name: 'Shopping',
    target: { kind: 'category', categoryId: cat('Shopping') },
    amount: usd(7_000),
  });
  const budgets = await listed();
  const id = (name: string) => idIn(budgets, name);

  // Spending that passes the Food budget and is covered, one entry with a
  // chosen cover.
  const spend = async (category: string, amount: number, note: string) =>
    (
      await ok(
        a.post('/v1/transactions', {
          kind: 'expense',
          accountId: card,
          amount: usd(amount),
          categoryId: cat(category),
          occurredOn: '2026-03-18',
          note,
          ...(category === 'Fun' ? { tagIds: [trip] } : {}),
        }),
      )
    ).id as string;
  await spend('Food', 33_000, 'Big shop');
  const chosen = await spend('Food', 9_000, 'Party');
  await spend('Fun', 12_000, 'Concert');
  await ok(
    a.put('/v1/budgets/cover-order', {
      order: [id('Trips'), 'free', id('Buffer')],
    }),
  );
  await ok(
    a.put(`/v1/transactions/${chosen}/cover`, {
      covers: [
        { source: id('Fun'), amount: usd(2_000) },
        { source: 'free', amount: usd(1_000) },
      ],
    }),
  );
  exported = (await a.get('/v1/export?format=json')).body;
});

afterAll(async () => {
  await h.close();
});

describe('the exported budget setup', () => {
  it('writes pools, budgets, the cover order and overrides', () => {
    const bundle = bundleSchema.parse(exported);
    expect(bundle.settings).toMatchObject({
      dailyMode: 'daily-budgets',
      budgetPeriod: 'month',
      countSavingsInDaily: true,
    });
    expect(bundle.pools.map((p) => [p.name, p.defaultFor, p.archived])).toEqual(
      [
        ['Budget', 'on', undefined],
        ['Savings', 'off', undefined],
        ['Rainy day', undefined, undefined],
        ['Rainy day (archived)', undefined, true],
      ],
    );
    expect(bundle.accounts.find((a) => a.name === 'Jar')?.poolMoves).toEqual([
      { on: '2026-03-05', pool: 'Rainy day (archived)' },
      { on: '2026-03-12', pool: 'Rainy day' },
    ]);
    expect(
      bundle.budgets
        .map((b) => [b.name, b.target.kind, b.endedOn, b.amounts.length])
        .sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
    ).toEqual([
      ['Buffer', 'buffer', undefined, 2],
      ['Food', 'category', undefined, 2],
      ['Fun', 'category', undefined, 1],
      ['Shopping', 'category', undefined, 1],
      ['Shopping (ended)', 'category', '2026-02-28', 1],
      ['Trips', 'tag', undefined, 1],
    ]);
    expect(bundle.coverOrder).toEqual([
      { budget: 'Trips' },
      'free',
      { budget: 'Buffer' },
    ]);
    expect(bundle.coverOverrides).toHaveLength(1);
    expect(bundle.coverOverrides[0]?.covers).toEqual([
      { source: { budget: 'Fun' }, amount: usd(2_000) },
      { source: 'free', amount: usd(1_000) },
    ]);
  });
});

describe('importing it on an empty ledger', () => {
  it('brings back the same pools, budgets, cover and figures', async () => {
    const imported = await h.bob.post('/v1/import', exported);
    expect(imported.status, JSON.stringify(imported.body)).toBe(201);
    expect(imported.body).toMatchObject({
      pools: 4,
      budgets: 6,
      coverOverrides: 1,
    });
    expect(await figures(h.bob)).toEqual(await figures(h.alice));
  });

  it('exports the same setup again', async () => {
    const again = (await h.bob.get('/v1/export?format=json')).body;
    // Refs are entry ids; the rest of the setup is what we compare.
    const strip = (b: unknown) =>
      JSON.parse(
        JSON.stringify(b, (key, value: unknown) =>
          key === 'ref' || key === 'transaction' ? 'ref' : value,
        ),
      ) as Record<string, unknown>;
    const withoutEntries = (b: unknown) =>
      comparable({ ...strip(b), transactions: undefined });
    expect(withoutEntries(again)).toEqual(withoutEntries(exported));
  });

  it('is refused on a ledger that already has budgets', async () => {
    const response = await h.bob.post('/v1/import', exported);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'ledger_not_empty' });
  });
});

describe('refused bundles', () => {
  const base = { format: 'allotr.bundle', version: 1 };
  const plan = (budgets: unknown[], extra: Record<string, unknown> = {}) => ({
    ...base,
    settings: { defaultCurrency: 'USD' },
    categories: [{ name: 'Fun', kind: 'expense' }],
    budgets,
    ...extra,
  });
  const fun = {
    name: 'Fun',
    target: { kind: 'category', category: 'Fun' },
    amounts: [{ from: '2026-03-01', amount: usd(1_000) }],
  };
  async function importOnFresh(bundle: unknown) {
    const fresh = await startWithTwoUsers();
    try {
      return await fresh.alice.post('/v1/import', bundle);
    } finally {
      await fresh.close();
    }
  }

  it('points at a budget on a category that does not exist', async () => {
    const response = await importOnFresh(
      plan([{ ...fun, target: { kind: 'category', category: 'Nope' } }]),
    );
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'invalid_reference',
      errors: [{ path: '/budgets/0/target/category' }],
    });
  });

  it('refuses two budgets in use for one category', async () => {
    const response = await importOnFresh(
      plan([fun, { ...fun, name: 'Fun two' }]),
    );
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      errors: [{ path: '/budgets/1/target' }],
    });
  });

  it('refuses a cover order that names no budget', async () => {
    const response = await importOnFresh(
      plan([fun], { coverOrder: [{ budget: 'Gone' }] }),
    );
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      errors: [{ path: '/coverOrder/0/budget' }],
    });
  });

  it('refuses a budget planned in another currency than the default', async () => {
    const response = await importOnFresh(
      plan([
        {
          ...fun,
          amounts: [
            {
              from: '2026-03-01',
              amount: { amountMinor: 100, currency: 'EUR' },
            },
          ],
        },
      ]),
    );
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'budget_currency',
      errors: [{ path: '/budgets/0/amounts/0/amount' }],
    });
  });

  it('refuses a move into a pool the bundle does not list', async () => {
    const response = await importOnFresh({
      ...base,
      accounts: [
        {
          name: 'Jar',
          currency: 'USD',
          poolMoves: [{ on: '2026-03-02', pool: 'Nowhere' }],
        },
      ],
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      errors: [{ path: '/accounts/0/poolMoves/0/pool' }],
    });
  });

  it('refuses a cover override on an entry that is not spending', async () => {
    const response = await importOnFresh(
      plan([fun], {
        accounts: [{ name: 'Card', currency: 'USD' }],
        transactions: [
          {
            kind: 'income',
            ref: 'pay',
            account: 'Card',
            amount: usd(5_000),
            category: 'Fun',
            occurredOn: '2026-03-02',
          },
        ],
        coverOverrides: [
          {
            transaction: 'pay',
            covers: [{ source: 'free', amount: usd(100) }],
          },
        ],
      }),
    );
    expect(response.status).toBe(400);
  });
});
