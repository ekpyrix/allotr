import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Turning a logged expense into a split bill or a loan (ADR 0024, docs/
// domain.md "IOUs") through the API against real SQLite and migrations. The
// clock is fixed to 15 March 2026. All names and amounts are made up: a
// $1,000 dinner from Bank One is split five ways, and one person pays back
// into Bank Two.

type Money = { amountMinor: number; currency: string };
type Entry = {
  id: string;
  kind: string;
  occurredOn: string;
  note: string | null;
  reversesId: string | null;
  postings: {
    accountId: string;
    systemRole: string | null;
    amount: Money;
    categoryId: string | null;
  }[];
};
type Iou = { id: string; person: string; outstanding: Money; settled: boolean };
type Converted = { reversal: Entry; transaction: Entry; ious: Iou[] };
type Account = { id: string; balance: Money };

const started = new Date('2026-03-15T12:00:00Z');
let tick = 0;
const clock = () => new Date(started.getTime() + (tick += 1));
let h: TwoUsers;
let bankOne = '';
let bankTwo = '';
let food = '';
let other = '';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
const friends = ['Alex', 'Sam', 'Robin', 'Kim'].map((n) => `${n} Example`);

async function account(name: string, opening: number) {
  const response = await h.alice.post('/v1/accounts', {
    name,
    currency: 'USD',
    openingBalance: usd(opening),
  });
  return (response.body as { id: string }).id;
}

async function expense(amount: number, note?: string) {
  const response = await h.alice.post('/v1/transactions', {
    kind: 'expense',
    accountId: bankOne,
    amount: usd(amount),
    categoryId: food,
    occurredOn: '2026-03-14',
    ...(note === undefined ? {} : { note }),
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return (response.body as { id: string }).id;
}

const balance = async (id: string) =>
  (
    (await h.alice.get('/v1/accounts')).body as { accounts: Account[] }
  ).accounts.find((a) => a.id === id)?.balance.amountMinor;

beforeAll(async () => {
  h = await startWithTwoUsers({ now: clock });
  bankOne = await account('Bank One', 500_000);
  bankTwo = await account('Bank Two', 0);
  const categories = (
    (await h.alice.get('/v1/categories')).body as {
      categories: { id: string; name: string }[];
    }
  ).categories;
  food = categories.find((c) => c.name === 'Food')?.id ?? '';
  other = categories.find((c) => c.name === 'Other')?.id ?? '';
});

afterAll(async () => {
  await h.close();
});

describe('splitting a logged expense', () => {
  let dinner = '';
  let converted: Converted;

  it('undoes the expense and records the same payment as a split bill', async () => {
    dinner = await expense(100_000, 'Dinner');
    const before = await balance(bankOne);
    const response = await h.alice.post(
      `/v1/ious/from/${dinner}`,
      { people: friends.map((person) => ({ person, amount: usd(20_000) })) },
      { 'idempotency-key': 'split-dinner' },
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    converted = response.body as Converted;
    expect(converted.reversal.reversesId).toBe(dinner);
    expect(converted.transaction).toMatchObject({
      kind: 'expense',
      occurredOn: '2026-03-14',
      note: 'Dinner',
      // An edit of the expense, not a delete of it.
      replacesId: dinner,
    });
    expect(
      converted.transaction.postings.map((p) => [
        p.systemRole,
        p.amount.amountMinor,
      ]),
    ).toEqual([
      [null, -100_000],
      ['expenses', 20_000],
      ['receivables', 20_000],
      ['receivables', 20_000],
      ['receivables', 20_000],
      ['receivables', 20_000],
    ]);
    expect(converted.ious.map((i) => i.person)).toEqual(friends);
    // The bank line is unchanged: the undo and the split cancel out to it.
    expect(await balance(bankOne)).toBe(before);
  });

  it('replays an idempotent request', async () => {
    const again = await h.alice.post(
      `/v1/ious/from/${dinner}`,
      { people: friends.map((person) => ({ person, amount: usd(20_000) })) },
      { 'idempotency-key': 'split-dinner' },
    );
    expect(again.status).toBe(200);
    expect((again.body as Converted).transaction.id).toBe(
      converted.transaction.id,
    );
  });

  it('settles a repayment into another account', async () => {
    const response = await h.alice.post('/v1/ious/repayments', {
      accountId: bankTwo,
      person: 'Alex Example',
      amount: usd(20_000),
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(await balance(bankTwo)).toBe(20_000);
    const { ious } = (await h.alice.get('/v1/ious?status=all')).body as {
      ious: Iou[];
    };
    const alex = ious.find((i) => i.person === 'Alex Example');
    expect(alex?.settled).toBe(true);
    expect(
      ious
        .filter((i) => !i.settled)
        .reduce((sum, i) => sum + i.outstanding.amountMinor, 0),
    ).toBe(60_000);
  });

  it('refuses an entry that is already split, or undone', async () => {
    for (const id of [dinner, converted.transaction.id]) {
      const response = await h.alice.post(`/v1/ious/from/${id}`, {
        people: [{ person: 'Alex Example', amount: usd(100) }],
      });
      expect(response.status).toBe(409);
      expect((response.body as { code: string }).code).toBe(
        'not_plain_expense',
      );
    }
  });
});

describe('lending a logged expense', () => {
  it('is a loan with no spending when people owe all of it', async () => {
    const coffee = await expense(5_500);
    const response = await h.alice.post(`/v1/ious/from/${coffee}`, {
      people: [{ person: 'Sam Example', amount: usd(5_500) }],
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const { transaction } = response.body as Converted;
    expect(transaction.kind).toBe('transfer');
    expect(
      transaction.postings.map((p) => [p.systemRole, p.amount.amountMinor]),
    ).toEqual([
      [null, -5_500],
      ['receivables', 5_500],
    ]);
  });

  it('puts the own share in another category when asked', async () => {
    const lunch = await expense(3_000);
    const response = await h.alice.post(`/v1/ious/from/${lunch}`, {
      people: [{ person: 'Kim Example', amount: usd(1_000) }],
      categoryId: other,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const share = (response.body as Converted).transaction.postings.find(
      (p) => p.systemRole === 'expenses',
    );
    expect(share).toMatchObject({ amount: usd(2_000), categoryId: other });
  });
});

describe('refusals', () => {
  it('refuses people owing more than the expense', async () => {
    const id = await expense(1_000);
    const response = await h.alice.post(`/v1/ious/from/${id}`, {
      people: [{ person: 'Alex Example', amount: usd(1_001) }],
    });
    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe('owed_exceeds_total');
  });

  it('refuses income and expenses in several categories', async () => {
    const income = await h.alice.post('/v1/transactions', {
      kind: 'income',
      accountId: bankOne,
      amount: usd(1_000),
      categoryId: (
        (await h.alice.get('/v1/categories')).body as {
          categories: { id: string; kind: string }[];
        }
      ).categories.find((c) => c.kind === 'income')?.id,
    });
    const lines = await h.alice.post('/v1/transactions', {
      kind: 'expense',
      accountId: bankOne,
      amount: usd(2_000),
      lines: [
        { categoryId: food, amount: usd(1_000) },
        { categoryId: other, amount: usd(1_000) },
      ],
    });
    for (const made of [income, lines]) {
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      const response = await h.alice.post(
        `/v1/ious/from/${(made.body as { id: string }).id}`,
        { people: [{ person: 'Alex Example', amount: usd(100) }] },
      );
      expect(response.status).toBe(409);
    }
  });

  it("does not touch another user's entry", async () => {
    const id = await expense(1_000);
    const response = await h.bob.post(`/v1/ious/from/${id}`, {
      people: [{ person: 'Alex Example', amount: usd(100) }],
    });
    expect(response.status).toBe(404);
  });
});
