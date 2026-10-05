import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Where an entry was typed (docs/domain.md "Entry source") through the API
// against real SQLite and migrations. All figures are made up.

type Entry = { id: string; source: string };

let h: TwoUsers;
let card: string;
let groceries: string;

beforeAll(async () => {
  h = await startWithTwoUsers();
  const account = await h.alice.post('/v1/accounts', {
    name: 'Card',
    currency: 'USD',
    openingBalance: { amountMinor: 100000, currency: 'USD' },
  });
  card = (account.body as { id: string }).id;
  const list = await h.alice.get('/v1/categories');
  const found = (
    list.body as { categories: { id: string; name: string }[] }
  ).categories.find((c) => c.name === 'Groceries');
  if (found === undefined) throw new Error('no Groceries category');
  groceries = found.id;
});

afterAll(async () => {
  await h.close();
});

async function spend(client?: string): Promise<Entry> {
  const response = await h.alice.post(
    '/v1/transactions',
    {
      kind: 'expense',
      accountId: card,
      amount: { amountMinor: 100, currency: 'USD' },
      categoryId: groceries,
      occurredOn: '2026-04-01',
    },
    client === undefined ? {} : { 'x-allotr-client': client },
  );
  expect(response.status).toBe(201);
  return response.body as Entry;
}

async function sourceOf(id: string): Promise<string | undefined> {
  const list = await h.alice.get(
    '/v1/transactions?from=2026-04-01&to=2026-04-01',
  );
  return (list.body as { transactions: Entry[] }).transactions.find(
    (t) => t.id === id,
  )?.source;
}

describe('entry source', () => {
  it('reads as the app, chat or plain API by the client header', async () => {
    const web = await spend('web');
    const chat = await spend('Chat');
    const plain = await spend();
    expect(web.source).toBe('web');
    expect(chat.source).toBe('chat');
    expect(plain.source).toBe('api');
    expect(await sourceOf(web.id)).toBe('web');
    expect(await sourceOf(chat.id)).toBe('chat');
    expect(await sourceOf(plain.id)).toBe('api');
  });

  it('treats a header it does not know as a plain API call', async () => {
    const entry = await spend('toaster');
    expect(await sourceOf(entry.id)).toBe('api');
  });

  it('records the client on an undo too', async () => {
    const entry = await spend();
    const undone = await h.alice.post(
      `/v1/transactions/${entry.id}/reverse`,
      {},
      { 'x-allotr-client': 'web' },
    );
    expect(undone.status).toBe(201);
    expect((undone.body as Entry).source).toBe('web');
  });
});
