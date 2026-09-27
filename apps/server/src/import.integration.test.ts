import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DB } from './db/schema.ts';
import type { TestClient, TestResponse } from './testing/http-client.ts';
import { startWithTwoUsers, userIdOf, type TwoUsers } from './testing/users.ts';

// POST /v1/import against real SQLite and migrations (#40). The clock is
// fixed at 20 March 2026 and users joined on 1 March. All names and amounts
// are made up; currencies cover 0, 2 and 3 minor digits.

const clock = new Date('2026-03-20T12:00:00Z');
const joined = '2026-03-01T00:00:00.000Z';

const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' });
const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
const jpy = (amountMinor: number) => ({ amountMinor, currency: 'JPY' });
const kwd = (amountMinor: number) => ({ amountMinor, currency: 'KWD' });

const month = {
  format: 'allotr.bundle',
  version: 1,
  settings: { timeZone: 'UTC', defaultCurrency: 'EUR', paydayDay: 25 },
  categories: [
    { name: 'Coffee', parent: 'Food' },
    { name: 'Side gigs', kind: 'income' },
  ],
  accounts: [
    {
      name: 'Wallet',
      currency: 'EUR',
      openingBalance: eur(50_000),
      openedOn: '2026-03-01',
    },
    {
      name: 'Savings',
      currency: 'EUR',
      budgetGroup: 'off',
      openingBalance: eur(100_000),
      openedOn: '2026-03-01',
    },
    {
      name: 'Travel card',
      currency: 'USD',
      openingBalance: usd(20_000),
      openedOn: '2026-03-01',
    },
    {
      name: 'Coin jar',
      currency: 'JPY',
      openingBalance: jpy(5_000),
      openedOn: '2026-03-01',
    },
    {
      name: 'Reserve',
      currency: 'KWD',
      budgetGroup: 'off',
      openingBalance: kwd(1_500),
      openedOn: '2026-03-01',
    },
  ],
  rates: [
    { base: 'USD', quote: 'EUR', rate: '0.92', asOf: '2026-03-01' },
    { base: 'JPY', quote: 'EUR', rate: '0.0062', asOf: '2026-03-01' },
    { base: 'KWD', quote: 'EUR', rate: '3', asOf: '2026-03-01' },
  ],
  transactions: [
    {
      kind: 'expense',
      account: 'Wallet',
      amount: eur(450),
      category: 'Food/Coffee',
      occurredOn: '2026-03-02',
      tags: ['morning'],
    },
    {
      kind: 'income',
      account: 'Wallet',
      amount: eur(30_000),
      category: 'Side gigs',
      occurredOn: '2026-03-03',
    },
    {
      kind: 'expense',
      account: 'Wallet',
      amount: eur(6_000),
      category: 'Food/Groceries',
      occurredOn: '2026-03-04',
    },
    {
      kind: 'transfer',
      from: 'Wallet',
      to: 'Savings',
      sent: eur(10_000),
      occurredOn: '2026-03-05',
    },
    {
      kind: 'transfer',
      from: 'Wallet',
      to: 'Travel card',
      sent: eur(9_200),
      received: usd(10_000),
      occurredOn: '2026-03-06',
    },
    {
      kind: 'expense',
      account: 'Travel card',
      amount: usd(2_500),
      category: 'Fun',
      occurredOn: '2026-03-07',
      tags: ['trip'],
    },
    {
      kind: 'expense',
      account: 'Coin jar',
      amount: jpy(1_200),
      category: 'Food/Eating out',
      occurredOn: '2026-03-08',
      tags: ['trip', 'Trip'],
    },
    {
      kind: 'expense',
      ref: 'rent-mar',
      account: 'Wallet',
      amount: eur(40_000),
      category: 'Housing/Rent',
      occurredOn: '2026-03-10',
      note: 'March rent',
    },
  ],
  bills: [
    {
      name: 'Rent',
      account: 'Wallet',
      amount: eur(40_000),
      dueDay: 10,
      payments: [
        { dueOn: '2026-03-10', paidOn: '2026-03-10', transaction: 'rent-mar' },
      ],
    },
    { name: 'Phone', account: 'Wallet', amount: eur(2_500), dueDay: 22 },
    {
      name: 'Gym',
      account: 'Wallet',
      amount: eur(3_000),
      dueDay: 15,
      active: false,
    },
  ],
};

type Json = Record<string, unknown>;
const body = (r: TestResponse) => r.body as Json;

// Every row an import could touch, for "nothing was written" checks.
async function snapshot(db: Kysely<DB>, userId: string) {
  const rows = (
    table:
      | 'accounts'
      | 'categories'
      | 'tags'
      | 'transactions'
      | 'postings'
      | 'bills'
      | 'bill_payments'
      | 'fx_rates'
      | 'user_settings',
  ) => db.selectFrom(table).selectAll().where('user_id', '=', userId).execute();
  return {
    user: await db
      .selectFrom('users')
      .select(['locale', 'tz', 'default_currency'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow(),
    accounts: await rows('accounts'),
    categories: await rows('categories'),
    tags: await rows('tags'),
    transactions: await rows('transactions'),
    postings: await rows('postings'),
    bills: await rows('bills'),
    billPayments: await rows('bill_payments'),
    rates: await rows('fx_rates'),
    settings: await rows('user_settings'),
  };
}

async function start(): Promise<TwoUsers> {
  const h = await startWithTwoUsers({ now: () => clock });
  // Sign-up stamps users with the real clock; pin the day they joined.
  await h.db.updateTable('users').set({ created_at: joined }).execute();
  return h;
}

describe('refused imports write nothing', () => {
  let h: TwoUsers;
  let aliceId: string;

  beforeAll(async () => {
    h = await start();
    aliceId = await userIdOf(h.alice);
  });

  afterAll(async () => {
    await h.close();
  });

  const withTransaction = (index: number, entry: Json) => {
    const transactions: Json[] = [...month.transactions];
    transactions.splice(index, 0, entry);
    return { ...month, transactions };
  };
  // Fails only while applying: the resolve pass does not know currencies.
  const wrongCurrency = {
    kind: 'expense',
    account: 'Wallet',
    amount: usd(100),
    category: 'Fun',
    occurredOn: '2026-03-09',
  };
  const unknownAccount = { ...wrongCurrency, account: 'Nowhere' };
  const last = month.transactions.length;

  it.each([
    [
      'a schema error first',
      withTransaction(0, { kind: 'expense' }),
      'invalid_bundle',
      '/transactions/0/account',
    ],
    [
      'a reference error in the middle',
      withTransaction(4, unknownAccount),
      'invalid_reference',
      '/transactions/4/account',
    ],
    [
      'an apply error last',
      withTransaction(last, wrongCurrency),
      'currency_mismatch',
      `/transactions/${String(last)}`,
    ],
    [
      'an apply error first',
      withTransaction(0, wrongCurrency),
      'currency_mismatch',
      '/transactions/0',
    ],
    [
      'a bad time zone',
      { ...month, settings: { timeZone: 'Mars/Olympus' } },
      'invalid_time_zone',
      '/settings',
    ],
    [
      'another version',
      { ...month, version: 2 },
      'unsupported_bundle_version',
      '/version',
    ],
  ])('%s', async (_, bundle, code, path) => {
    const before = await snapshot(h.db, aliceId);
    const response = await h.alice.post('/v1/import', bundle);
    expect(response.status).toBe(400);
    expect(body(response).code).toBe(code);
    expect(
      (body(response).errors as { path: string }[]).map((e) => e.path),
    ).toContain(path);
    expect(await snapshot(h.db, aliceId)).toEqual(before);
  });

  it('refuses a body over 10 MB', async () => {
    const response = await h.alice.post('/v1/import', {
      ...month,
      padding: 'x'.repeat(10 * 1024 * 1024),
    });
    expect(response.status).toBe(413);
  });

  it('needs a signed-in user', async () => {
    const anonymous = await fetch(new URL('/v1/import', h.server.url), {
      method: 'POST',
    });
    expect([401, 403]).toContain(anonymous.status);
  });

  it('imports a bundle with only settings', async () => {
    const response = await h.bob.post('/v1/import', {
      format: 'allotr.bundle',
      version: 1,
      settings: { paydayDay: 12 },
    });
    expect(response.status).toBe(201);
    expect(body(response)).toEqual({
      accounts: 0,
      categoriesCreated: 0,
      categoriesMatched: 0,
      rates: 0,
      tags: 0,
      transactions: 0,
      bills: 0,
      billPayments: 0,
    });
    expect(body(await h.bob.get('/v1/settings/ledger')).paydayDay).toBe(12);
  });

  it('opens an account without a date on the earliest entry day', async () => {
    const response = await h.bob.post('/v1/import', {
      format: 'allotr.bundle',
      version: 1,
      accounts: [
        { name: 'Spare', currency: 'USD', openingBalance: usd(1_000) },
      ],
      transactions: [
        {
          kind: 'expense',
          account: 'Spare',
          amount: usd(100),
          category: 'Fun',
          occurredOn: '2026-02-14',
        },
        {
          kind: 'expense',
          account: 'Spare',
          amount: usd(100),
          category: 'Fun',
          occurredOn: '2026-02-10',
        },
      ],
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const list = body(await h.bob.get('/v1/transactions?limit=200'))
      .transactions as { kind: string; occurredOn: string }[];
    expect(list.find((t) => t.kind === 'opening')?.occurredOn).toBe(
      '2026-02-10',
    );
  });

  it('refuses a ledger that already has entries', async () => {
    const response = await h.bob.post('/v1/import', month);
    expect(response.status).toBe(409);
    expect(body(response).code).toBe('ledger_not_empty');
  });
});

// The same month, posted one call at a time through the public API.
async function postOneByOne(client: TestClient): Promise<void> {
  const ok = async (request: Promise<TestResponse>, status = 201) => {
    const response = await request;
    expect(response.status, JSON.stringify(response.body)).toBe(status);
    return body(response);
  };
  await ok(client.patch('/v1/settings/ledger', month.settings), 200);
  const categoryId = async (path: string) => {
    const [top, child] = path.split('/');
    const all = body(await client.get('/v1/categories')).categories as {
      id: string;
      name: string;
      parentId: string | null;
    }[];
    const parent = all.find((c) => c.name === top && c.parentId === null);
    const found =
      child === undefined
        ? parent
        : all.find((c) => c.name === child && c.parentId === parent?.id);
    if (found === undefined) throw new Error(`no category ${path}`);
    return found.id;
  };
  await ok(
    client.post('/v1/categories', {
      name: 'Coffee',
      parentId: await categoryId('Food'),
    }),
  );
  await ok(
    client.post('/v1/categories', { name: 'Side gigs', kind: 'income' }),
  );
  const accounts = new Map<string, string>();
  for (const account of month.accounts) {
    const created = await ok(client.post('/v1/accounts', account));
    accounts.set(account.name, created.id as string);
  }
  const accountId = (name: string) => accounts.get(name) ?? '';
  for (const rate of month.rates) await ok(client.post('/v1/rates', rate));
  const tags = new Map<string, string>();
  for (const name of ['morning', 'trip']) {
    tags.set(name, (await ok(client.post('/v1/tags', { name }))).id as string);
  }
  const refs = new Map<string, string>();
  for (const t of month.transactions) {
    const tagIds =
      t.tags === undefined
        ? undefined
        : [...new Set(t.tags.map((n) => tags.get(n.toLowerCase()) ?? ''))];
    const common = {
      occurredOn: t.occurredOn,
      ...(t.note === undefined ? {} : { note: t.note }),
      ...(tagIds === undefined ? {} : { tagIds }),
    };
    const request =
      t.kind === 'transfer'
        ? {
            kind: t.kind,
            fromAccountId: accountId(t.from ?? ''),
            toAccountId: accountId(t.to ?? ''),
            sent: t.sent,
            ...(t.received === undefined ? {} : { received: t.received }),
            ...common,
          }
        : {
            kind: t.kind,
            accountId: accountId(t.account ?? ''),
            amount: t.amount,
            categoryId: await categoryId(t.category ?? ''),
            ...common,
          };
    const created = await ok(client.post('/v1/transactions', request));
    if (t.ref !== undefined) refs.set(t.ref, created.id as string);
  }
  for (const bill of month.bills) {
    const created = await ok(
      client.post('/v1/bills', {
        name: bill.name,
        amount: bill.amount,
        accountId: accountId(bill.account),
        dueDay: bill.dueDay,
      }),
    );
    const id = created.id as string;
    for (const p of bill.payments ?? []) {
      await ok(
        client.post(`/v1/bills/${id}/payments`, {
          dueOn: p.dueOn,
          paidOn: p.paidOn,
          transactionId: refs.get(p.transaction),
        }),
      );
    }
    if (bill.active !== undefined) {
      await ok(client.patch(`/v1/bills/${id}`, { active: bill.active }), 200);
    }
  }
}

// What a user sees, with ids replaced by names.
async function view(client: TestClient) {
  const accounts = body(await client.get('/v1/accounts')).accounts as {
    id: string;
    name: string;
    kind: string;
    currency: string;
    budgetGroup: string;
    balance: unknown;
  }[];
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categories = body(await client.get('/v1/categories')).categories as {
    id: string;
    name: string;
    kind: string;
    parentId: string | null;
  }[];
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const transactions = body(await client.get('/v1/transactions?limit=200'))
    .transactions as {
    kind: string;
    occurredOn: string;
    note: string | null;
    tagIds: string[];
    postings: {
      accountId: string;
      amount: { amountMinor: number; currency: string };
    }[];
  }[];
  const bills = body(await client.get('/v1/bills')).bills as {
    name: string;
    amount: unknown;
    dueDay: number;
    active: boolean;
    payments: {
      dueOn: string;
      paidOn: string;
      transactionId: string | null;
    }[];
  }[];
  const rates = body(await client.get('/v1/rates')).rates as {
    base: string;
    quote: string;
    rate: string;
    asOf: string;
  }[];
  return {
    accounts: accounts
      .map((a) => ({
        name: a.name,
        kind: a.kind,
        currency: a.currency,
        budgetGroup: a.budgetGroup,
        balance: a.balance,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    categories: categories
      .map((c) => {
        const parent =
          c.parentId === null ? '' : `${categoryName.get(c.parentId) ?? ''}/`;
        return `${parent}${c.name}:${c.kind}`;
      })
      .sort(),
    transactions: transactions
      .map((t) =>
        JSON.stringify([
          t.occurredOn,
          t.kind,
          t.note,
          t.tagIds.length,
          t.postings
            .map((p) => [accountName.get(p.accountId) ?? 'system', p.amount])
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        ]),
      )
      .sort(),
    bills: bills
      .map((b) => ({
        name: b.name,
        amount: b.amount,
        dueDay: b.dueDay,
        active: b.active,
        payments: b.payments.map((p) => ({
          dueOn: p.dueOn,
          paidOn: p.paidOn,
          linked: p.transactionId !== null,
        })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    rates: rates
      .map(({ base, quote, rate, asOf }) => ({ base, quote, rate, asOf }))
      .sort((a, b) => a.base.localeCompare(b.base)),
    today: body(await client.get('/v1/today')),
    settings: body(await client.get('/v1/settings/ledger')),
  };
}

describe('an imported bundle matches the same entries posted one by one', () => {
  let h: TwoUsers;

  beforeAll(async () => {
    h = await start();
  });

  afterAll(async () => {
    await h.close();
  });

  it('reports what it created', async () => {
    const response = await h.alice.post('/v1/import', month);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(body(response)).toEqual({
      accounts: 5,
      categoriesCreated: 2,
      categoriesMatched: 0,
      rates: 3,
      tags: 2,
      transactions: 8,
      bills: 3,
      billPayments: 1,
    });
  });

  it('gives the same balances, entries, bills and today figures', async () => {
    await postOneByOne(h.bob);
    expect(await view(h.alice)).toEqual(await view(h.bob));
  });

  it('marks imported entries as imported', async () => {
    const list = body(await h.alice.get('/v1/transactions?limit=200'))
      .transactions as { source: string }[];
    expect(new Set(list.map((t) => t.source))).toEqual(new Set(['import']));
  });

  it('refuses a second import', async () => {
    expect((await h.alice.post('/v1/import', month)).status).toBe(409);
  });
});
