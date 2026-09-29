import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Cycle snapshots through the API against real SQLite and migrations
// (FR-C1, FR-C6, FR-W2). The users joined on 15 March 2026 (UTC) and the
// clock moves forward per step. All figures are made up.

type Money = { amountMinor: number; currency: string };
type Summary = {
  openedOn: string;
  openedBy: string | null;
  closedOn: string | null;
  lastDay: string;
  payday: string;
  income: Money;
  spending: Money;
  leftover: Money;
  savingsNetChange: Money;
  offBudgetClosing: Money;
  amended: boolean;
  missingRates: string[];
};
type Detail = Summary & {
  opening: { on: Money; off: Money };
  closing: { on: Money; off: Money };
  incomeByCategory: { categoryId: string | null; amount: Money }[];
  spendingByCategory: { categoryId: string | null; amount: Money }[];
  amendments: {
    transactionId: string;
    kind: string;
    occurredOn: string;
    recordedAt: string;
    note: string | null;
  }[];
};

const started = new Date('2026-03-15T12:00:00Z');
let clock = started;
let h: TwoUsers;

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => clock });
  await h.db
    .updateTable('users')
    .set({ created_at: started.toISOString() })
    .execute();
});

afterAll(async () => {
  await h.close();
});

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

async function cycles(client: TestClient): Promise<Summary[]> {
  const response = await client.get('/v1/cycles');
  expect(response.status).toBe(200);
  return (response.body as { cycles: Summary[] }).cycles;
}

async function detail(client: TestClient, openedOn: string): Promise<Detail> {
  const response = await client.get(`/v1/cycles/${openedOn}`);
  expect(response.status).toBe(200);
  return response.body as Detail;
}

async function categoryId(client: TestClient, name: string): Promise<string> {
  const list = await client.get('/v1/categories');
  const found = (
    list.body as { categories: { id: string; name: string }[] }
  ).categories.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no category ${name}`);
  return found.id;
}

describe('cycles', () => {
  let everyday: string;
  let groceries: string;
  let paycheck: string;
  let aprilPay: string;

  const post = async (body: Record<string, unknown>) => {
    const response = await h.alice.post('/v1/transactions', body);
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  };
  const spend = (amountMinor: number, occurredOn: string, note: string) =>
    post({
      kind: 'expense',
      accountId: everyday,
      amount: usd(amountMinor),
      categoryId: groceries,
      occurredOn,
      note,
    });

  beforeAll(async () => {
    const account = await h.alice.post('/v1/accounts', {
      name: 'Everyday',
      currency: 'USD',
      openingBalance: usd(100000),
    });
    everyday = (account.body as { id: string }).id;
    groceries = await categoryId(h.alice, 'Groceries');
    paycheck = await categoryId(h.alice, 'Paycheck');
    clock = new Date('2026-03-20T12:00:00Z');
    await spend(2000, '2026-03-20', 'Market');
    clock = new Date('2026-04-01T09:00:00Z');
    aprilPay = await post({
      kind: 'income',
      accountId: everyday,
      amount: usd(300000),
      categoryId: paycheck,
      occurredOn: '2026-04-01',
    });
    clock = new Date('2026-04-03T12:00:00Z');
  });

  it('lists the current cycle first, then the past ones', async () => {
    const list = await cycles(h.alice);
    expect(list.map((c) => [c.openedOn, c.closedOn])).toEqual([
      ['2026-04-01', null],
      ['2026-03-15', '2026-04-01'],
    ]);
    expect(list[1]).toEqual({
      openedOn: '2026-03-15',
      openedBy: null,
      closedOn: '2026-04-01',
      lastDay: '2026-03-31',
      payday: '2026-04-01',
      income: usd(0),
      spending: usd(2000),
      leftover: usd(98000),
      savingsNetChange: usd(0),
      offBudgetClosing: usd(0),
      amended: false,
      missingRates: [],
    });
    expect(list[0]).toMatchObject({
      lastDay: '2026-04-03',
      income: usd(300000),
      leftover: usd(398000),
      amended: false,
    });
  });

  it('shows a cycle in detail', async () => {
    expect(await detail(h.alice, '2026-03-15')).toMatchObject({
      // The account opened in this cycle: its balance is opening money.
      opening: { on: usd(100000), off: usd(0) },
      closing: { on: usd(98000), off: usd(0) },
      incomeByCategory: [],
      spendingByCategory: [{ categoryId: groceries, amount: usd(2000) }],
      amendments: [],
    });
    expect(await detail(h.alice, '2026-04-01')).toMatchObject({
      opening: { on: usd(98000), off: usd(0) },
      incomeByCategory: [{ categoryId: paycheck, amount: usd(300000) }],
    });
  });

  it('marks a past cycle amended by a back-dated entry', async () => {
    const late = await spend(3000, '2026-03-25', 'Forgotten receipt');
    const [current, past] = await cycles(h.alice);
    expect(current?.amended).toBe(false);
    expect(past).toMatchObject({
      amended: true,
      spending: usd(5000),
      leftover: usd(95000),
    });
    expect((await detail(h.alice, '2026-03-15')).amendments).toEqual([
      {
        transactionId: late,
        kind: 'expense',
        occurredOn: '2026-03-25',
        recordedAt: '2026-04-03T12:00:00.000Z',
        note: 'Forgotten receipt',
      },
    ]);
  });

  it('stays amended when the closing paycheck is edited later', async () => {
    clock = new Date('2026-04-05T12:00:00Z');
    const edited = await h.alice.post(`/v1/transactions/${aprilPay}/edit`, {
      kind: 'income',
      accountId: everyday,
      amount: usd(310000),
      categoryId: paycheck,
      occurredOn: '2026-04-01',
    });
    expect(edited.status).toBe(201);
    const [current, past] = await cycles(h.alice);
    expect(current).toMatchObject({ openedOn: '2026-04-01', amended: false });
    expect(past).toMatchObject({ openedOn: '2026-03-15', amended: true });
    expect((await detail(h.alice, '2026-03-15')).amendments).toHaveLength(1);
  });

  it('answers 404 for a day no cycle opened on', async () => {
    const response = await h.alice.get('/v1/cycles/2026-03-20');
    expect(response.status).toBe(404);
    expect((response.body as { code: string }).code).toBe('cycle_not_found');
  });

  it('needs a signed-in user', async () => {
    const anonymous = await fetch(new URL('/v1/cycles', h.server.url));
    expect(anonymous.status).toBe(401);
  });
});

describe('cycles of an imported ledger', () => {
  it('start with the imported history and are not amended by it', async () => {
    const imported = await h.bob.post('/v1/import', {
      format: 'allotr.bundle',
      version: 1,
      settings: { paydayDay: 25 },
      accounts: [
        {
          name: 'Main',
          currency: 'USD',
          openingBalance: usd(50000),
          openedOn: '2026-02-01',
        },
      ],
      transactions: [
        {
          kind: 'expense',
          account: 'Main',
          amount: usd(1000),
          category: 'Food/Groceries',
          occurredOn: '2026-02-10',
        },
        {
          kind: 'income',
          account: 'Main',
          amount: usd(200000),
          category: 'Paycheck',
          occurredOn: '2026-02-25',
        },
      ],
    });
    expect(imported.status).toBe(201);

    const list = await cycles(h.bob);
    expect(list.map((c) => [c.openedOn, c.closedOn, c.amended])).toEqual([
      ['2026-02-25', null, false],
      ['2026-02-01', '2026-02-25', false],
    ]);
    expect(list[1]).toMatchObject({
      spending: usd(1000),
      leftover: usd(49000),
    });
  });
});

describe('cycles of an imported ledger without a paycheck', () => {
  let fresh: TwoUsers;

  beforeAll(async () => {
    fresh = await startWithTwoUsers({ now: () => clock });
    await fresh.db
      .updateTable('users')
      .set({ created_at: started.toISOString() })
      .execute();
  });

  afterAll(async () => {
    await fresh.close();
  });

  it('keep the join day, so payday is not long past', async () => {
    const imported = await fresh.alice.post('/v1/import', {
      format: 'allotr.bundle',
      version: 1,
      accounts: [
        {
          name: 'Main',
          currency: 'USD',
          openingBalance: usd(50000),
          openedOn: '2026-01-10',
        },
      ],
    });
    expect(imported.status).toBe(201);
    const list = await cycles(fresh.alice);
    expect(list.map((c) => [c.openedOn, c.payday])).toEqual([
      ['2026-03-15', '2026-04-01'],
    ]);
  });
});
