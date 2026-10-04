import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient, TestResponse } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// The order of entries within a day and their optional time of day
// (docs/domain.md "Order within a day") through the API against real
// SQLite and migrations. All figures are made up.

type Entry = {
  id: string;
  occurredOn: string;
  occurredTime: string | null;
  sortRank: string;
};
type Page = { transactions: Entry[]; nextCursor: string | null };

let h: TwoUsers;
let card: string;
let groceries: string;

async function openAccount(client: TestClient, name: string): Promise<string> {
  const response = await client.post('/v1/accounts', {
    name,
    currency: 'USD',
    openingBalance: { amountMinor: 100000, currency: 'USD' },
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

function code(response: TestResponse): unknown {
  return (response.body as { code?: string }).code;
}

async function spend(
  day: string,
  amountMinor: number,
  extra: Record<string, unknown> = {},
): Promise<Entry> {
  const response = await h.alice.post('/v1/transactions', {
    kind: 'expense',
    accountId: card,
    amount: { amountMinor, currency: 'USD' },
    categoryId: groceries,
    occurredOn: day,
    ...extra,
  });
  expect(response.status).toBe(201);
  return response.body as Entry;
}

// A day's entries as the ledger list shows them: newest first.
async function listed(day: string, limit = 50): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const query: string = `from=${day}&to=${day}&limit=${String(limit)}${cursor === null ? '' : `&cursor=${cursor}`}`;
    const response = await h.alice.get(`/v1/transactions?${query}`);
    expect(response.status).toBe(200);
    const page = response.body as Page;
    ids.push(...page.transactions.map((t) => t.id));
    cursor = page.nextCursor;
  } while (cursor !== null);
  return ids;
}

async function move(id: string, afterId: string | null) {
  return h.alice.post(`/v1/transactions/${id}/move`, { afterId });
}

async function setEntryTimes(value: string) {
  const response = await h.alice.patch('/v1/settings/ledger', {
    entryTimes: value,
  });
  expect(response.status).toBe(200);
}

beforeAll(async () => {
  h = await startWithTwoUsers();
  card = await openAccount(h.alice, 'Card');
  groceries = await categoryId(h.alice, 'Groceries');
});

afterAll(async () => {
  await h.close();
});

describe('moving entries within a day', () => {
  it('lists a day in the order entries were made until they are moved', async () => {
    const a = await spend('2026-04-01', 100);
    const b = await spend('2026-04-01', 200);
    const c = await spend('2026-04-01', 300);
    expect(await listed('2026-04-01')).toEqual([c.id, b.id, a.id]);

    const response = await move(c.id, null);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      occurredOn: '2026-04-01',
      ids: [c.id, a.id, b.id],
    });
    expect(await listed('2026-04-01')).toEqual([b.id, a.id, c.id]);

    expect((await move(c.id, b.id)).status).toBe(200);
    expect(await listed('2026-04-01')).toEqual([c.id, b.id, a.id]);
  });

  it('pages through a rearranged day without losing or repeating entries', async () => {
    const day = '2026-04-02';
    const entries = [];
    for (let i = 1; i <= 7; i += 1) entries.push(await spend(day, i * 10));
    const [first, , third, , , , last] = entries.map((e) => e.id);
    if (first === undefined || third === undefined || last === undefined) {
      throw new Error('missing entries');
    }
    await move(last, null);
    await move(first, third);
    const all = await listed(day);
    expect(await listed(day, 2)).toEqual(all);
    expect(new Set(all).size).toBe(7);
  });

  it('only moves within the same day, and only your own entries', async () => {
    const here = await spend('2026-04-03', 100);
    const there = await spend('2026-04-04', 100);
    const other = await move(here.id, there.id);
    expect(other.status).toBe(400);
    expect(code(other)).toBe('different_day');
    expect((await move(here.id, here.id)).status).toBe(400);
    expect(
      (await h.bob.post(`/v1/transactions/${here.id}/move`, { afterId: null }))
        .status,
    ).toBe(404);
  });

  it('changes no balance and records nothing', async () => {
    const before = await h.alice.get(`/v1/accounts/${card}`);
    const count = async () =>
      (
        await h.db
          .selectFrom('transactions')
          .select(h.db.fn.countAll<number>().as('n'))
          .executeTakeFirstOrThrow()
      ).n;
    const entries = await count();
    const a = await spend('2026-04-05', 100);
    const b = await spend('2026-04-05', 250);
    await move(b.id, null);
    await move(a.id, null);
    const after = await h.alice.get(`/v1/accounts/${card}`);
    expect(
      (after.body as { balance: { amountMinor: number } }).balance.amountMinor,
    ).toBe(
      (before.body as { balance: { amountMinor: number } }).balance
        .amountMinor - 350,
    );
    expect(await count()).toBe(entries + 2);
  });
});

describe('times of day', () => {
  it('drops a time while entry times are off', async () => {
    const entry = await spend('2026-05-01', 100, { occurredTime: '09:30' });
    expect(entry.occurredTime).toBeNull();
  });

  it('keeps timed entries in time order and refuses to break it', async () => {
    await setEntryTimes('optional');
    const day = '2026-05-02';
    const evening = await spend(day, 100, { occurredTime: '19:00' });
    const loose = await spend(day, 100);
    const morning = await spend(day, 100, { occurredTime: '08:15' });
    expect(morning.occurredTime).toBe('08:15');
    // Oldest first: the morning entry goes before the evening one.
    expect((await listed(day)).reverse()).toEqual([
      morning.id,
      evening.id,
      loose.id,
    ]);

    const refused = await move(morning.id, loose.id);
    expect(refused.status).toBe(409);
    expect(code(refused)).toBe('out_of_time_order');
    // An entry without a time goes anywhere.
    expect((await move(loose.id, null)).status).toBe(200);
    expect((await listed(day)).reverse()).toEqual([
      loose.id,
      morning.id,
      evening.id,
    ]);
    await setEntryTimes('off');
  });
});

describe('edits and restores', () => {
  it('keep the place of the entry they replace', async () => {
    const day = '2026-06-01';
    const a = await spend(day, 100);
    const b = await spend(day, 200);
    const c = await spend(day, 300);
    const edited = await h.alice.post(`/v1/transactions/${a.id}/edit`, {
      kind: 'expense',
      accountId: card,
      amount: { amountMinor: 150, currency: 'USD' },
      categoryId: groceries,
      occurredOn: day,
    });
    expect(edited.status).toBe(201);
    const replacement = (edited.body as { replacement: Entry }).replacement;
    const visible = async () =>
      (
        (
          await h.alice.get(
            `/v1/transactions?from=${day}&to=${day}&undone=hide&limit=50`,
          )
        ).body as Page
      ).transactions
        .map((t) => t.id)
        .reverse();
    expect(await visible()).toEqual([replacement.id, b.id, c.id]);

    expect(
      (await h.alice.post(`/v1/transactions/${b.id}/reverse`, {})).status,
    ).toBe(201);
    const restored = await h.alice.post(`/v1/transactions/${b.id}/restore`);
    expect(restored.status).toBe(201);
    expect(await visible()).toEqual([
      replacement.id,
      (restored.body as Entry).id,
      c.id,
    ]);
  });
});

describe('list cursors', () => {
  it('refuses a cursor from before entries had a place', async () => {
    const old = Buffer.from(
      JSON.stringify(['2026-04-01', '2026-04-01T00:00:00.000Z', 'x']),
    ).toString('base64url');
    const response = await h.alice.get(`/v1/transactions?cursor=${old}`);
    expect(response.status).toBe(400);
    expect(code(response)).toBe('invalid_cursor');
  });
});

describe('export and import', () => {
  it('keep times and the order within each day', async () => {
    await setEntryTimes('optional');
    const day = '2026-07-01';
    await spend(day, 100, { note: 'first' });
    await spend(day, 200, { note: 'second', occurredTime: '12:30' });
    const c = await spend(day, 300, { note: 'third' });
    await move(c.id, null);
    await setEntryTimes('off');
    const notes = async (client: TestClient) =>
      (
        (
          await client.get(
            `/v1/transactions?from=${day}&to=${day}&undone=hide&limit=50`,
          )
        ).body as { transactions: (Entry & { note: string | null })[] }
      ).transactions
        .map((t) => [t.note, t.occurredTime])
        .reverse();
    expect(await notes(h.alice)).toEqual([
      ['third', null],
      ['first', null],
      ['second', '12:30'],
    ]);

    const exported = await h.alice.get('/v1/export?format=json');
    expect(exported.status).toBe(200);
    // Bob's ledger is empty, and his entry times are off: an import keeps
    // the times its history has anyway.
    const imported = await h.bob.post('/v1/import', exported.body);
    expect(imported.status).toBe(201);
    expect(await notes(h.bob)).toEqual(await notes(h.alice));

    const csv = await h.alice.get('/v1/export?format=csv');
    const text = csv.body as string;
    expect(text.split('\r\n')[0]?.endsWith(',time')).toBe(true);
    expect(text).toContain(',12:30\r\n');
  });
});
