import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient, TestResponse } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Transactions, undo and edit through the API against real SQLite and
// migrations (FR-L1, FR-L4, FR-X3). All figures are made up.

type Money = { amountMinor: number; currency: string };
type Posting = {
  accountId: string;
  systemRole: string | null;
  amount: Money;
  categoryId: string | null;
};
type Entry = {
  id: string;
  kind: string;
  occurredOn: string;
  categoryId: string | null;
  note: string | null;
  postings: Posting[];
  reversesId: string | null;
  reversedById: string | null;
  impliedRate: string | null;
  tagIds: string[];
};
type Account = { id: string; balance: Money };

let h: TwoUsers;
let card: string;
let cash: string;
let wallet: string;
let groceries: string;
let paycheck: string;

async function openAccount(
  client: TestClient,
  name: string,
  currency: string,
  amountMinor = 0,
): Promise<string> {
  const response = await client.post('/v1/accounts', {
    name,
    currency,
    ...(amountMinor === 0 ? {} : { openingBalance: { amountMinor, currency } }),
  });
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

async function categoryId(client: TestClient, name: string): Promise<string> {
  const list = await client.get('/v1/categories');
  const found = (
    list.body as { categories: { id: string; name: string }[] }
  ).categories.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no category ${name}`);
  return found.id;
}

async function balance(client: TestClient, id: string): Promise<number> {
  const response = await client.get(`/v1/accounts/${id}`);
  return (response.body as Account).balance.amountMinor;
}

async function rowCounts() {
  const count = async (table: 'transactions' | 'postings' | 'accounts') =>
    (
      await h.db
        .selectFrom(table)
        .select(h.db.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow()
    ).n;
  return {
    transactions: await count('transactions'),
    postings: await count('postings'),
    accounts: await count('accounts'),
  };
}

function code(response: TestResponse): unknown {
  return (response.body as { code?: string }).code;
}

function spend(amountMinor: number, extra: Record<string, unknown> = {}) {
  return {
    kind: 'expense',
    accountId: card,
    amount: { amountMinor, currency: 'USD' },
    categoryId: groceries,
    occurredOn: '2026-03-10',
    ...extra,
  };
}

beforeAll(async () => {
  h = await startWithTwoUsers();
  card = await openAccount(h.alice, 'Card', 'USD', 200000);
  cash = await openAccount(h.alice, 'Cash', 'USD', 5000);
  wallet = await openAccount(h.alice, 'Euro wallet', 'EUR');
  groceries = await categoryId(h.alice, 'Groceries');
  paycheck = await categoryId(h.alice, 'Paycheck');
});

afterAll(async () => {
  await h.close();
});

describe('recording entries', () => {
  it('records an expense against the category', async () => {
    const response = await h.alice.post(
      '/v1/transactions',
      spend(4250, { note: 'weekly shop' }),
    );
    expect(response.status).toBe(201);
    const entry = response.body as Entry;
    expect(entry).toMatchObject({
      kind: 'expense',
      occurredOn: '2026-03-10',
      categoryId: groceries,
      note: 'weekly shop',
      reversesId: null,
      reversedById: null,
    });
    expect(entry.postings).toEqual([
      {
        accountId: card,
        systemRole: null,
        amount: { amountMinor: -4250, currency: 'USD' },
        categoryId: null,
      },
      expect.objectContaining({
        systemRole: 'expenses',
        amount: { amountMinor: 4250, currency: 'USD' },
        categoryId: groceries,
      }),
    ]);
    expect(await balance(h.alice, card)).toBe(200000 - 4250);
    expect((await h.alice.get(`/v1/transactions/${entry.id}`)).body).toEqual(
      entry,
    );
  });

  it('records income and a transfer', async () => {
    const pay = await h.alice.post('/v1/transactions', {
      kind: 'income',
      accountId: card,
      amount: { amountMinor: 300000, currency: 'USD' },
      categoryId: paycheck,
      occurredOn: '2026-03-01',
    });
    expect(pay.status).toBe(201);
    const before = await balance(h.alice, cash);
    const move = await h.alice.post('/v1/transactions', {
      kind: 'transfer',
      fromAccountId: card,
      toAccountId: cash,
      sent: { amountMinor: 2000, currency: 'USD' },
    });
    expect(move.status).toBe(201);
    expect((move.body as Entry).impliedRate).toBeNull();
    expect(await balance(h.alice, cash)).toBe(before + 2000);
  });

  it('records both amounts of a cross-currency transfer', async () => {
    const response = await h.alice.post('/v1/transactions', {
      kind: 'transfer',
      fromAccountId: card,
      toAccountId: wallet,
      sent: { amountMinor: 10000, currency: 'USD' },
      received: { amountMinor: 9150, currency: 'EUR' },
    });
    expect(response.status).toBe(201);
    const entry = response.body as Entry;
    expect(entry.impliedRate).toBe('0.915');
    expect(entry.postings.map((p) => [p.systemRole, p.amount])).toEqual([
      [null, { amountMinor: -10000, currency: 'USD' }],
      ['conversion', { amountMinor: 10000, currency: 'USD' }],
      ['conversion', { amountMinor: -9150, currency: 'EUR' }],
      [null, { amountMinor: 9150, currency: 'EUR' }],
    ]);
    expect(await balance(h.alice, wallet)).toBe(9150);
  });

  it('records a foreign purchase with both amounts', async () => {
    const response = await h.alice.post(
      '/v1/transactions',
      spend(1100, { foreignAmount: { amountMinor: 1000, currency: 'EUR' } }),
    );
    expect(response.status).toBe(201);
    const entry = response.body as Entry;
    expect(entry.impliedRate).toBe('0.909090909091');
    expect(entry.postings.at(-1)).toMatchObject({
      systemRole: 'expenses',
      amount: { amountMinor: 1000, currency: 'EUR' },
    });
  });

  it('tags an entry with the user’s tags only', async () => {
    const tag = await h.alice.post('/v1/tags', { name: 'groceries run' });
    const tagId = (tag.body as { id: string }).id;
    const tagged = await h.alice.post(
      '/v1/transactions',
      spend(500, { tagIds: [tagId, tagId] }),
    );
    expect((tagged.body as Entry).tagIds).toEqual([tagId]);

    const unknown = await h.alice.post(
      '/v1/transactions',
      spend(500, { tagIds: ['no-such-tag'] }),
    );
    expect(unknown.status).toBe(400);
    expect(code(unknown)).toBe('unknown_tag');
  });

  it('refuses a category of the wrong kind', async () => {
    const response = await h.alice.post(
      '/v1/transactions',
      spend(500, { categoryId: paycheck }),
    );
    expect(response.status).toBe(400);
    expect(code(response)).toBe('invalid_category');
  });
});

describe('refused entries write nothing', () => {
  it.each([
    [
      'an unbalanced transfer',
      () => ({
        kind: 'transfer',
        fromAccountId: card,
        toAccountId: cash,
        sent: { amountMinor: 1000, currency: 'USD' },
        received: { amountMinor: 999, currency: 'USD' },
      }),
      400,
      'unbalanced',
    ],
    [
      'an amount in another currency than the account',
      () => spend(1000, { amount: { amountMinor: 1000, currency: 'JPY' } }),
      400,
      'currency_mismatch',
    ],
    [
      'a cross-currency transfer without the amount received',
      () => ({
        kind: 'transfer',
        fromAccountId: card,
        toAccountId: wallet,
        sent: { amountMinor: 1000, currency: 'USD' },
      }),
      400,
      'invalid_amount',
    ],
    ['a negative expense', () => spend(-500), 400, 'invalid_amount'],
    [
      'a transfer to the same account',
      () => ({
        kind: 'transfer',
        fromAccountId: card,
        toAccountId: card,
        sent: { amountMinor: 1000, currency: 'USD' },
      }),
      400,
      'same_account',
    ],
    [
      'an unknown account',
      () => spend(1000, { accountId: 'no-such-account' }),
      404,
      'unknown_account',
    ],
  ])('%s', async (_, body, status, expected) => {
    // A new currency would create system accounts; they must roll back too.
    const before = await rowCounts();
    const response = await h.alice.post('/v1/transactions', body());
    expect(response.status).toBe(status);
    expect(response.headers.get('content-type')).toBe(
      'application/problem+json',
    );
    expect(code(response)).toBe(expected);
    expect(await rowCounts()).toEqual(before);
  });

  it('rolls back system accounts created for a refused entry', async () => {
    const yen = await openAccount(h.alice, 'Yen cash', 'JPY');
    const before = await rowCounts();
    const response = await h.alice.post('/v1/transactions', {
      kind: 'transfer',
      fromAccountId: card,
      toAccountId: yen,
      sent: { amountMinor: 1000, currency: 'USD' },
      received: { amountMinor: 1500, currency: 'USD' },
    });
    expect(response.status).toBe(400);
    expect(await rowCounts()).toEqual(before);
  });
});

describe('idempotency', () => {
  it('returns the first entry for a repeated key', async () => {
    const headers = { 'idempotency-key': 'offline-0001' };
    const first = await h.alice.post('/v1/transactions', spend(777), headers);
    expect(first.status).toBe(201);
    const before = await rowCounts();
    const second = await h.alice.post('/v1/transactions', spend(777), headers);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await rowCounts()).toEqual(before);
  });

  it('keeps keys separate per user', async () => {
    const headers = { 'idempotency-key': 'shared-key' };
    const bobCard = await openAccount(h.bob, 'Bob card', 'USD', 1000);
    const bobFood = await categoryId(h.bob, 'Groceries');
    const alice = await h.alice.post('/v1/transactions', spend(100), headers);
    const bob = await h.bob.post(
      '/v1/transactions',
      spend(100, { accountId: bobCard, categoryId: bobFood }),
      headers,
    );
    expect([alice.status, bob.status]).toEqual([201, 201]);
    expect((bob.body as Entry).id).not.toBe((alice.body as Entry).id);
  });

  it('records each request once when repeats race', async () => {
    const headers = { 'idempotency-key': 'offline-race' };
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        h.alice.post('/v1/transactions', spend(321), headers),
      ),
    );
    const ids = new Set(responses.map((r) => (r.body as Entry).id));
    expect(ids.size).toBe(1);
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
  });
});

describe('undo and edit', () => {
  it('undoes an entry with a reversal on the same date', async () => {
    const original = await h.alice.post('/v1/transactions', spend(1500));
    const id = (original.body as Entry).id;
    const before = await balance(h.alice, card);

    const undo = await h.alice.post(`/v1/transactions/${id}/reverse`, {
      note: 'entered twice',
    });
    expect(undo.status).toBe(201);
    const reversal = undo.body as Entry;
    expect(reversal).toMatchObject({
      kind: 'reversal',
      reversesId: id,
      occurredOn: '2026-03-10',
      note: 'entered twice',
    });
    expect(reversal.postings.map((p) => p.amount.amountMinor)).toEqual([
      1500, -1500,
    ]);
    expect(await balance(h.alice, card)).toBe(before + 1500);

    // The original is untouched and points at its undo.
    const stored = (await h.alice.get(`/v1/transactions/${id}`)).body as Entry;
    expect(stored).toEqual({
      ...(original.body as Entry),
      reversedById: reversal.id,
    });

    const again = await h.alice.post(`/v1/transactions/${id}/reverse`);
    expect(again.status).toBe(409);
    expect(code(again)).toBe('already_reversed');
    const undoUndo = await h.alice.post(
      `/v1/transactions/${reversal.id}/reverse`,
    );
    expect(code(undoUndo)).toBe('reversal_of_reversal');
  });

  it('edits an entry as a reversal plus a replacement', async () => {
    const original = await h.alice.post('/v1/transactions', spend(2000));
    const id = (original.body as Entry).id;
    const before = await balance(h.alice, card);

    const edited = await h.alice.post(
      `/v1/transactions/${id}/edit`,
      spend(2500, { occurredOn: '2026-03-11' }),
    );
    expect(edited.status).toBe(201);
    const { reversal, replacement } = edited.body as {
      reversal: Entry;
      replacement: Entry;
    };
    expect(reversal).toMatchObject({ kind: 'reversal', reversesId: id });
    expect(replacement).toMatchObject({
      kind: 'expense',
      occurredOn: '2026-03-11',
    });
    expect(await balance(h.alice, card)).toBe(before + 2000 - 2500);
  });

  it('refuses an edit that breaks a rule and writes nothing', async () => {
    const original = await h.alice.post('/v1/transactions', spend(900));
    const id = (original.body as Entry).id;
    const before = await rowCounts();
    const response = await h.alice.post(
      `/v1/transactions/${id}/edit`,
      spend(900, { amount: { amountMinor: 900, currency: 'EUR' } }),
    );
    expect(code(response)).toBe('currency_mismatch');
    expect(await rowCounts()).toEqual(before);
    expect(
      ((await h.alice.get(`/v1/transactions/${id}`)).body as Entry)
        .reversedById,
    ).toBeNull();
  });

  it('never updates or deletes a stored row', async () => {
    const rows = await h.db.selectFrom('transactions').select('id').execute();
    await expect(
      h.db.updateTable('transactions').set({ note: 'x' }).execute(),
    ).rejects.toThrow(/append-only/);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('listing', () => {
  let lister: TestClient;
  let a: string;
  let b: string;
  let food: string;
  let transport: string;

  beforeAll(async () => {
    // Bob's ledger is small, so the filters are easy to check.
    lister = h.bob;
    a = await openAccount(lister, 'List A', 'USD', 100000);
    b = await openAccount(lister, 'List B', 'USD');
    food = await categoryId(lister, 'Food');
    transport = await categoryId(lister, 'Transport');
    const eatingOut = await categoryId(lister, 'Eating out');
    const post = (body: Record<string, unknown>) =>
      lister.post('/v1/transactions', {
        kind: 'expense',
        accountId: a,
        amount: { amountMinor: 100, currency: 'USD' },
        ...body,
      });
    await post({ categoryId: food, occurredOn: '2026-04-01' });
    await post({ categoryId: eatingOut, occurredOn: '2026-04-02' });
    await post({ categoryId: transport, occurredOn: '2026-04-03' });
    await lister.post('/v1/transactions', {
      kind: 'transfer',
      fromAccountId: a,
      toAccountId: b,
      sent: { amountMinor: 50, currency: 'USD' },
      occurredOn: '2026-04-04',
    });
  });

  async function list(query: string): Promise<Entry[]> {
    const response = await lister.get(`/v1/transactions?${query}`);
    expect(response.status).toBe(200);
    return (response.body as { transactions: Entry[] }).transactions;
  }

  it('filters by date range', async () => {
    const entries = await list('from=2026-04-02&to=2026-04-03');
    expect(entries.map((e) => e.occurredOn)).toEqual([
      '2026-04-03',
      '2026-04-02',
    ]);
  });

  it('filters by account', async () => {
    const entries = await list(`accountId=${b}`);
    expect(entries.map((e) => e.kind)).toEqual(['transfer']);
  });

  it('filters by category, including subcategories', async () => {
    const entries = await list(`categoryId=${food}&from=2026-04-01`);
    expect(entries.map((e) => e.occurredOn)).toEqual([
      '2026-04-02',
      '2026-04-01',
    ]);
  });

  it('pages newest first with a cursor', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await lister.get(
        `/v1/transactions?limit=2${cursor === null ? '' : `&cursor=${cursor}`}`,
      );
      const page = response.body as {
        transactions: Entry[];
        nextCursor: string | null;
      };
      seen.push(...page.transactions.map((e) => e.id));
      cursor = page.nextCursor;
    } while (cursor !== null);
    const all = await list('limit=200');
    expect(seen).toEqual(all.map((e) => e.id));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('refuses a bad cursor', async () => {
    const response = await lister.get('/v1/transactions?cursor=nonsense');
    expect(response.status).toBe(400);
    expect(code(response)).toBe('invalid_cursor');
  });
});

describe('isolation between users', () => {
  it('refuses cross-user reads and writes', async () => {
    const entry = await h.alice.post('/v1/transactions', spend(1234));
    const id = (entry.body as Entry).id;
    const bobCard = await openAccount(h.bob, 'Bob wallet', 'USD', 5000);
    const bobFood = await categoryId(h.bob, 'Groceries');
    const before = await rowCounts();

    const attempts = await Promise.all([
      h.bob.get(`/v1/transactions/${id}`),
      h.bob.post(`/v1/transactions/${id}/reverse`),
      h.bob.post(
        `/v1/transactions/${id}/edit`,
        spend(1, { accountId: bobCard, categoryId: bobFood }),
      ),
      // Spending from Alice's account, or moving money into it.
      h.bob.post('/v1/transactions', spend(1, { categoryId: bobFood })),
      h.bob.post('/v1/transactions', {
        kind: 'transfer',
        fromAccountId: bobCard,
        toAccountId: card,
        sent: { amountMinor: 1, currency: 'USD' },
      }),
      h.bob.get(`/v1/transactions?accountId=${card}`),
    ]);
    expect(attempts.map((r) => r.status)).toEqual([
      404, 404, 404, 404, 404, 200,
    ]);
    expect(
      (attempts[5].body as { transactions: Entry[] }).transactions,
    ).toEqual([]);

    const category = await h.bob.post(
      '/v1/transactions',
      spend(1, { accountId: bobCard }),
    );
    expect(code(category)).toBe('invalid_category');
    expect(await rowCounts()).toEqual(before);
  });
});
