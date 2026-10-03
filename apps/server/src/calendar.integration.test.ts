import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// The calendar through the API against real SQLite and migrations: spending
// per day with a linked bill payment left out of the heat, bill and IOU
// due dates, and user scoping. The clock is fixed; all figures are made up.

type Money = { amountMinor: number; currency: string };
type Day = {
  date: string;
  spent: Money | null;
  heat: number | null;
  bills: { billId: string; amount: Money; paid: boolean }[];
  payday: boolean;
  ious: { person: string; outstanding: Money }[];
};
type Calendar = {
  from: string;
  to: string;
  today: string;
  days: Day[];
  peak: Money;
};

let clock = new Date('2026-03-15T12:00:00Z');
let h: TwoUsers;
const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
let billId = '';

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => clock });
  await h.db
    .updateTable('users')
    .set({ created_at: clock.toISOString() })
    .execute();
  const account = (
    (
      await h.alice.post('/v1/accounts', {
        name: 'Everyday',
        currency: 'USD',
        openingBalance: usd(500000),
      })
    ).body as { id: string }
  ).id;
  const categories = (
    (await h.alice.get('/v1/categories')).body as {
      categories: { id: string; name: string }[];
    }
  ).categories;
  const groceries = categories.find((c) => c.name === 'Groceries')?.id ?? '';
  const rent = categories.find((c) => c.name === 'Housing')?.id ?? groceries;
  clock = new Date('2026-03-20T12:00:00Z');
  const spend = async (
    amountMinor: number,
    occurredOn: string,
    categoryId = groceries,
  ) =>
    (
      (
        await h.alice.post('/v1/transactions', {
          kind: 'expense',
          accountId: account,
          amount: usd(amountMinor),
          categoryId,
          occurredOn,
        })
      ).body as { id: string }
    ).id;
  await spend(3000, '2026-03-17');
  await spend(1000, '2026-03-18');
  const paid = await spend(80000, '2026-03-05', rent);
  const bill = await h.alice.post('/v1/bills', {
    name: 'Rent',
    amount: usd(80000),
    dueDay: 5,
    accountId: account,
    categoryId: rent,
  });
  billId = (bill.body as { id: string }).id;
  await h.alice.post(`/v1/bills/${billId}/payments`, {
    dueOn: '2026-03-05',
    paidOn: '2026-03-05',
    transactionId: paid,
  });
  await h.alice.post('/v1/ious', {
    direction: 'owed-to-me',
    accountId: account,
    people: [
      { person: 'Alex Example', amount: usd(2000), dueOn: '2026-03-25' },
    ],
    occurredOn: '2026-03-19',
  });
});

afterAll(async () => {
  await h.close();
});

describe('GET /v1/reports/calendar', () => {
  it('defaults to the current month and scales the heat to the busiest day', async () => {
    const response = await h.alice.get('/v1/reports/calendar');
    expect(response.status).toBe(200);
    const body = response.body as Calendar;
    expect(body).toMatchObject({
      from: '2026-03-01',
      to: '2026-03-31',
      today: '2026-03-20',
    });
    expect(body.days).toHaveLength(31);
    const on = (date: string) => body.days.find((d) => d.date === date);
    expect(on('2026-03-17')).toMatchObject({ spent: usd(3000), heat: 4 });
    expect(on('2026-03-18')).toMatchObject({ spent: usd(1000), heat: 2 });
    expect(on('2026-03-21')).toMatchObject({ spent: null, heat: null });
    expect(body.peak).toEqual(usd(3000));
  });

  it('leaves the linked bill payment out of the heat and marks its due date', async () => {
    const body = (await h.alice.get('/v1/reports/calendar')).body as Calendar;
    const fifth = body.days.find((d) => d.date === '2026-03-05');
    expect(fifth?.spent).toEqual(usd(0));
    expect(fifth?.bills).toEqual([{ billId, amount: usd(80000), paid: true }]);
  });

  it('marks IOU due dates', async () => {
    const body = (
      await h.alice.get('/v1/reports/calendar?from=2026-03-24&to=2026-03-26')
    ).body as Calendar;
    expect(body.days.map((d) => d.ious.map((i) => i.person))).toEqual([
      [],
      ['Alex Example'],
      [],
    ]);
  });

  it('is scoped to the user', async () => {
    const body = (await h.bob.get('/v1/reports/calendar')).body as Calendar;
    expect(
      body.days.every((d) => d.bills.length === 0 && d.ious.length === 0),
    ).toBe(true);
    expect(body.peak.amountMinor).toBe(0);
  });

  it('refuses an empty or too long range and a half range', async () => {
    expect(
      (await h.alice.get('/v1/reports/calendar?from=2026-03-10&to=2026-03-01'))
        .status,
    ).toBe(400);
    expect(
      (await h.alice.get('/v1/reports/calendar?from=2026-01-01&to=2026-04-01'))
        .status,
    ).toBe(400);
    expect(
      (await h.alice.get('/v1/reports/calendar?from=2026-03-10')).status,
    ).toBe(400);
  });
});
