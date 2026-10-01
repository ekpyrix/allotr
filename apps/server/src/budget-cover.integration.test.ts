import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient, TestResponse } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Cover through the API against real SQLite and migrations (ADR 0021): the
// cover order, the per-entry override, the covered list and the preview. The
// clock is fixed to 15 March 2026. All names and amounts are made up.

type Money = { amountMinor: number; currency: string };
type Source = { source: string; name: string; amount: Money };
type Status = {
  budgets: {
    id: string;
    name: string;
    left: Money;
    held: Money;
    overflow: Money;
    coveredOut: Money;
  }[];
  free: Money;
  held: Money;
  dailyNumber: Money;
  coverOrder: { id: string; name: string; kind: string }[];
  covered: {
    shortfall: Money;
    fromFree: Money;
    fromBuffer: Money;
    fromBudgets: Money;
    uncovered: Money;
  };
};
type Covers = {
  covers: {
    entryId: string;
    own: Money;
    amount: Money;
    covers: Source[];
    uncovered: Money;
    overridden: boolean;
  }[];
};
type Preview = {
  counted: boolean;
  budgetId: string | null;
  amount: Money;
  own: Money;
  covers: (Source & { setAside: boolean })[];
  uncovered: Money;
  reachesSetAside: boolean;
  overspend: boolean;
  needsConfirmation: boolean;
  leftToday: { before: Money; after: Money };
};

const started = new Date('2026-03-15T12:00:00Z');
// The clock moves on a millisecond per call, so entries made on the same day
// keep the order they were recorded in.
let tick = 0;
const clock = () => new Date(started.getTime() + (tick += 1));
let h: TwoUsers;
let everyday = '';
let savings = '';
const ids: Record<string, string> = {};
let groceriesEntry = '';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

beforeAll(async () => {
  h = await startWithTwoUsers({ now: clock });
  await h.db
    .updateTable('users')
    .set({ created_at: started.toISOString() })
    .execute();
  const open = async (name: string, amountMinor: number, group: string) =>
    (
      (
        await h.alice.post('/v1/accounts', {
          name,
          currency: 'USD',
          budgetGroup: group,
          openingBalance: usd(amountMinor),
        })
      ).body as { id: string }
    ).id;
  everyday = await open('Everyday', 150_000, 'on');
  savings = await open('Rainy day', 80_000, 'off');
  const categories = (
    (await h.alice.get('/v1/categories')).body as {
      categories: { id: string; name: string }[];
    }
  ).categories;
  for (const name of ['Food', 'Groceries', 'Other'])
    ids[name] = categories.find((c) => c.name === name)?.id ?? '';
  ids.Travel = (
    (await h.alice.post('/v1/categories', { name: 'Travel', kind: 'expense' }))
      .body as { id: string }
  ).id;
  const plan = (body: Record<string, unknown>) =>
    h.alice.post('/v1/budgets', body);
  expect(
    (
      await plan({
        name: 'Food',
        target: { kind: 'category', categoryId: ids.Food },
        amount: usd(10_000),
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await plan({
        name: 'Travel',
        target: { kind: 'category', categoryId: ids.Travel },
        amount: usd(30_000),
        mode: 'set-aside',
      })
    ).status,
  ).toBe(201);
  const status = await getStatus();
  for (const b of status.budgets) ids[`b:${b.name}`] = b.id;
  expect(
    (
      await h.alice.patch(`/v1/budgets/${ids['b:Buffer'] ?? ''}`, {
        amount: usd(20_000),
      })
    ).status,
  ).toBe(200);
});

afterAll(async () => {
  await h.close();
});

async function getStatus(client: TestClient = h.alice): Promise<Status> {
  const response = await client.get('/v1/budgets');
  expect(response.status).toBe(200);
  return response.body as Status;
}

function line(s: Status, name: string) {
  const found = s.budgets.find((b) => b.name === name);
  if (found === undefined) throw new Error(`no budget ${name}`);
  return found;
}

async function spend(
  account: string,
  category: string,
  amountMinor: number,
): Promise<string> {
  const response = await h.alice.post('/v1/transactions', {
    kind: 'expense',
    accountId: account,
    amount: usd(amountMinor),
    categoryId: category,
    occurredOn: '2026-03-15',
  });
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

function code(response: TestResponse): unknown {
  return (response.body as { code?: string }).code;
}

async function entryCount(): Promise<number> {
  return (
    await h.db
      .selectFrom('transactions')
      .select(h.db.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow()
  ).n;
}

describe('before any overspending', () => {
  it('lists the default cover order: free money, the Buffer, then budgets', async () => {
    const s = await getStatus();
    expect(s.coverOrder.map((o) => [o.name, o.kind])).toEqual([
      ['Free money', 'free'],
      ['Buffer', 'buffer'],
      ['Food', 'budget'],
      ['Travel', 'budget'],
    ]);
    expect(s.covered.shortfall).toEqual(usd(0));
    // $1,500 counted, $500 held for Travel and the Buffer.
    expect(s.free).toEqual(usd(100_000));
    expect((await h.alice.get('/v1/budgets/covers')).body).toMatchObject({
      covers: [],
    });
  });
});

describe('preview', () => {
  it('says free money covers a small overspend, without recording it', async () => {
    const before = await entryCount();
    const response = await h.alice.post('/v1/budgets/cover-preview', {
      accountId: everyday,
      amount: usd(14_000),
      categoryId: ids.Food,
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      counted: true,
      budgetId: ids['b:Food'],
      amount: usd(14_000),
      own: usd(10_000),
      uncovered: usd(0),
      reachesSetAside: false,
      needsConfirmation: false,
    });
    expect((response.body as Preview).covers).toEqual([
      {
        source: 'free',
        name: 'Free money',
        amount: usd(4_000),
        setAside: false,
      },
    ]);
    expect(await entryCount()).toBe(before);
  });

  it('is not counted when savings pay', async () => {
    const response = await h.alice.post('/v1/budgets/cover-preview', {
      accountId: savings,
      amount: usd(1_000),
      categoryId: ids.Food,
    });
    expect((response.body as Preview).counted).toBe(false);
  });

  it('refuses bad input', async () => {
    const bad = await h.alice.post('/v1/budgets/cover-preview', {
      accountId: everyday,
      amount: { amountMinor: 1_000, currency: 'EUR' },
      categoryId: ids.Food,
    });
    expect(code(bad)).toBe('currency_mismatch');
    const noCategory = await h.alice.post('/v1/budgets/cover-preview', {
      accountId: everyday,
      amount: usd(1_000),
      categoryId: 'nope',
    });
    expect(code(noCategory)).toBe('invalid_category');
    const other = await h.bob.post('/v1/budgets/cover-preview', {
      accountId: everyday,
      amount: usd(1_000),
      categoryId: ids.Food,
    });
    expect(other.status).toBe(404);
  });
});

describe('cover once free money is used up', () => {
  it('has the Buffer cover a Food overspend and asks for a second tap', async () => {
    await spend(everyday, ids.Other ?? '', 95_000);
    const preview = (
      await h.alice.post('/v1/budgets/cover-preview', {
        accountId: everyday,
        amount: usd(14_000),
        categoryId: ids.Groceries,
      })
    ).body as Preview;
    expect(preview).toMatchObject({
      reachesSetAside: true,
      needsConfirmation: true,
      overspend: false,
    });
    expect(preview.covers).toEqual([
      {
        source: ids['b:Buffer'],
        name: 'Buffer',
        amount: usd(4_000),
        setAside: true,
      },
    ]);
    expect(preview.leftToday.after.amountMinor).toBeLessThan(
      preview.leftToday.before.amountMinor,
    );

    groceriesEntry = await spend(everyday, ids.Groceries ?? '', 14_000);
    const s = await getStatus();
    expect(line(s, 'Buffer')).toMatchObject({
      left: usd(16_000),
      held: usd(16_000),
      coveredOut: usd(4_000),
    });
    expect(line(s, 'Food')).toMatchObject({
      left: usd(0),
      overflow: usd(4_000),
    });
    expect(s.covered).toEqual({
      shortfall: usd(99_000),
      fromFree: usd(95_000),
      fromBuffer: usd(4_000),
      fromBudgets: usd(0),
      uncovered: usd(0),
    });
  });

  it('lists the covered entries, newest first', async () => {
    const { covers } = (await h.alice.get('/v1/budgets/covers')).body as Covers;
    expect(covers.map((c) => c.entryId)[0]).toBe(groceriesEntry);
    expect(covers[0]).toMatchObject({
      own: usd(10_000),
      amount: usd(14_000),
      uncovered: usd(0),
      overridden: false,
    });
    expect(covers[0]?.covers).toEqual([
      { source: ids['b:Buffer'], name: 'Buffer', amount: usd(4_000) },
    ]);
  });
});

describe('cover order', () => {
  it('can be changed and puts new budgets last', async () => {
    const set = await h.alice.put('/v1/budgets/cover-order', {
      order: [ids['b:Travel'] ?? '', 'free'],
    });
    expect(set.status).toBe(200);
    expect((set.body as Status).coverOrder.map((o) => o.name)).toEqual([
      'Travel',
      'Free money',
      'Buffer',
      'Food',
    ]);
    // Travel pays first now, so it covers the $950 of rent (all of its $300)
    // and the Buffer is untouched.
    const s = set.body as Status;
    expect(line(s, 'Travel').coveredOut).toEqual(usd(30_000));
    expect(line(s, 'Buffer').coveredOut).toEqual(usd(0));
  });

  it('refuses unknown or repeated sources', async () => {
    const unknown = await h.alice.put('/v1/budgets/cover-order', {
      order: ['free', 'nope'],
    });
    expect(unknown.status).toBe(400);
    expect(code(unknown)).toBe('unknown_budget');
    const twice = await h.alice.put('/v1/budgets/cover-order', {
      order: ['free', 'free'],
    });
    expect(code(twice)).toBe('duplicate_source');
  });

  it('is kept per user', async () => {
    expect((await getStatus(h.bob)).coverOrder.map((o) => o.name)).toEqual([
      'Free money',
      'Buffer',
    ]);
  });
});

describe('cover override', () => {
  it('splits an entry as chosen without changing the ledger', async () => {
    await h.alice.put('/v1/budgets/cover-order', {
      order: ['free', ids['b:Buffer'] ?? ''],
    });
    const before = await entryCount();
    const postings = await h.db
      .selectFrom('postings')
      .select(h.db.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow();
    const response = await h.alice.put(
      `/v1/transactions/${groceriesEntry}/cover`,
      {
        covers: [{ source: ids['b:Travel'], amount: usd(4_000) }],
      },
    );
    expect(response.status).toBe(204);
    const { covers } = (await h.alice.get('/v1/budgets/covers')).body as Covers;
    expect(covers[0]).toMatchObject({
      entryId: groceriesEntry,
      overridden: true,
    });
    expect(
      covers[0]?.covers.map((c) => [c.name, c.amount.amountMinor]),
    ).toEqual([['Travel', 4_000]]);
    expect(line(await getStatus(), 'Buffer').left).toEqual(usd(20_000));
    expect(await entryCount()).toBe(before);
    const after = await h.db
      .selectFrom('postings')
      .select(h.db.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow();
    expect(after.n).toBe(postings.n);
  });

  it('caps a request at what the source had', async () => {
    await h.alice.put(`/v1/transactions/${groceriesEntry}/cover`, {
      covers: [{ source: ids['b:Travel'], amount: usd(900_000) }],
    });
    const { covers } = (await h.alice.get('/v1/budgets/covers')).body as Covers;
    // The shortfall is $40: Travel gives that and no more.
    expect(covers[0]?.covers.map((c) => c.amount.amountMinor)).toEqual([4_000]);
  });

  it('goes back to the cover order when cleared', async () => {
    expect(
      (await h.alice.delete(`/v1/transactions/${groceriesEntry}/cover`)).status,
    ).toBe(204);
    const { covers } = (await h.alice.get('/v1/budgets/covers')).body as Covers;
    expect(covers[0]).toMatchObject({ overridden: false });
    expect(covers[0]?.covers.map((c) => c.name)).toEqual(['Buffer']);
  });

  it('refuses a bad source, a missing entry and another user’s entry', async () => {
    const unknown = await h.alice.put(
      `/v1/transactions/${groceriesEntry}/cover`,
      {
        covers: [{ source: 'nope', amount: usd(100) }],
      },
    );
    expect(code(unknown)).toBe('invalid_cover');
    const twice = await h.alice.put(
      `/v1/transactions/${groceriesEntry}/cover`,
      {
        covers: [
          { source: 'free', amount: usd(100) },
          { source: 'free', amount: usd(100) },
        ],
      },
    );
    expect(code(twice)).toBe('invalid_cover');
    const euro = await h.alice.put(`/v1/transactions/${groceriesEntry}/cover`, {
      covers: [
        { source: 'free', amount: { amountMinor: 100, currency: 'EUR' } },
      ],
    });
    expect(code(euro)).toBe('budget_currency');
    const missing = await h.alice.put('/v1/transactions/nope/cover', {
      covers: [{ source: 'free', amount: usd(100) }],
    });
    expect(missing.status).toBe(404);
    const theirs = await h.bob.put(`/v1/transactions/${groceriesEntry}/cover`, {
      covers: [{ source: 'free', amount: usd(100) }],
    });
    expect(theirs.status).toBe(404);
  });

  it('only applies to spending', async () => {
    const pay = (
      await h.alice.post('/v1/transactions', {
        kind: 'income',
        accountId: everyday,
        amount: usd(1_000),
        categoryId: (
          (await h.alice.get('/v1/categories')).body as {
            categories: { id: string; name: string }[];
          }
        ).categories.find((c) => c.name === 'Other income')?.id,
        occurredOn: '2026-03-15',
      })
    ).body as { id: string };
    const response = await h.alice.put(`/v1/transactions/${pay.id}/cover`, {
      covers: [{ source: 'free', amount: usd(100) }],
    });
    expect(code(response)).toBe('not_an_expense');
  });
});

describe('undo', () => {
  it('gives the cover back with the entry', async () => {
    const undo = await h.alice.post(
      `/v1/transactions/${groceriesEntry}/reverse`,
      {},
    );
    expect(undo.status).toBe(201);
    const s = await getStatus();
    expect(line(s, 'Buffer').left).toEqual(usd(20_000));
    expect(line(s, 'Food').overflow).toEqual(usd(0));
  });
});
