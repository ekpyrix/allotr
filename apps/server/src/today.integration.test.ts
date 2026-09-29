import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient, TestResponse } from './testing/http-client.ts';
import { startWithTwoUsers, userIdOf, type TwoUsers } from './testing/users.ts';

// Today's figures, ledger settings, exchange rates and bills through the
// API against real SQLite and migrations (FR-C2, FR-C4, FR-C5, FR-X2). The
// clock is fixed so the users joined on 15 March 2026 (UTC) and payday
// defaults to the 1st. All figures are made up.

type Money = { amountMinor: number; currency: string };
type Today = {
  today: string;
  cycle: { openedOn: string; openedBy: string | null; payday: string };
  cycleEnd: string;
  overdue: boolean;
  daysLeft: number;
  available: Money;
  startOfDay: Money;
  spentToday: Money;
  todayAllowance: Money;
  leftToday: Money;
  liveDaily: Money;
  cycleSpent: Money;
  billsDue: { billId: string; name: string; dueOn: string; amount: Money }[];
  cycleBills: {
    billId: string;
    dueOn: string;
    amount: Money;
    paidOn: string | null;
  }[];
  missingRates: string[];
};
type Bill = {
  id: string;
  amount: Money;
  active: boolean;
  payments: { dueOn: string; paidOn: string; transactionId: string | null }[];
};
type Rate = {
  id: string;
  base: string;
  quote: string;
  rate: string;
  asOf: string;
};

const started = new Date('2026-03-15T12:00:00Z');
let clock = started;
let h: TwoUsers;

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => clock });
  // Sign-up stamps users with the real clock; the first cycle opens on the
  // day a user joined, so move that day to the fixed clock.
  await h.db
    .updateTable('users')
    .set({ created_at: started.toISOString() })
    .execute();
});

afterAll(async () => {
  await h.close();
});

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' });

function code(response: TestResponse): unknown {
  return (response.body as { code?: string }).code;
}

async function today(client: TestClient): Promise<Today> {
  const response = await client.get('/v1/today');
  expect(response.status).toBe(200);
  return response.body as Today;
}

async function openAccount(
  client: TestClient,
  name: string,
  opening: Money,
): Promise<string> {
  const response = await client.post('/v1/accounts', {
    name,
    currency: opening.currency,
    openingBalance: opening,
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

async function patchSettings(
  client: TestClient,
  body: Record<string, unknown>,
): Promise<TestResponse> {
  return client.patch('/v1/settings/ledger', body);
}

describe('today for a new user', () => {
  it('starts the first cycle on the day the user joined', async () => {
    expect(await today(h.alice)).toEqual({
      today: '2026-03-15',
      cycle: { openedOn: '2026-03-15', openedBy: null, payday: '2026-04-01' },
      cycleEnd: '2026-04-01',
      overdue: false,
      daysLeft: 17,
      available: usd(0),
      startOfDay: usd(0),
      spentToday: usd(0),
      todayAllowance: usd(0),
      leftToday: usd(0),
      liveDaily: usd(0),
      cycleSpent: usd(0),
      billsDue: [],
      cycleBills: [],
      missingRates: [],
    });
  });

  it('needs a signed-in user', async () => {
    const anonymous = await fetch(new URL('/v1/today', h.server.url));
    expect(anonymous.status).toBe(401);
  });
});

describe('daily figures', () => {
  let everyday: string;
  let groceries: string;

  beforeAll(async () => {
    everyday = await openAccount(h.alice, 'Everyday', usd(170000));
    groceries = await categoryId(h.alice, 'Groceries');
  });

  const spend = (amountMinor: number, occurredOn?: string) =>
    h.alice.post('/v1/transactions', {
      kind: 'expense',
      accountId: everyday,
      amount: usd(amountMinor),
      categoryId: groceries,
      ...(occurredOn === undefined ? {} : { occurredOn }),
    });

  it('splits the start of the day over the days left', async () => {
    expect((await spend(2500)).status).toBe(201);
    expect(await today(h.alice)).toMatchObject({
      available: usd(167500),
      startOfDay: usd(170000),
      spentToday: usd(2500),
      todayAllowance: usd(10000),
      leftToday: usd(7500),
      // 167500 / 17 = 9852.94, rounded down.
      liveDaily: usd(9852),
      cycleSpent: usd(2500),
    });
  });

  it("changes today's figures for a back-dated entry, and back on undo", async () => {
    const response = await spend(3400, '2026-03-14');
    expect(response.status).toBe(201);
    expect(await today(h.alice)).toMatchObject({
      available: usd(164100),
      startOfDay: usd(166600),
      spentToday: usd(2500),
      todayAllowance: usd(9800),
      leftToday: usd(7300),
      liveDaily: usd(9652),
      // The cycle opened on the 15th, so the 14th is not in it.
      cycleSpent: usd(2500),
    });

    const { id } = response.body as { id: string };
    expect(
      (await h.alice.post(`/v1/transactions/${id}/reverse`, {})).status,
    ).toBe(201);
    expect(await today(h.alice)).toMatchObject({
      available: usd(167500),
      todayAllowance: usd(10000),
    });
  });

  describe('bills', () => {
    let rent: Bill;

    it('reserves a bill due in the cycle until it is paid', async () => {
      const created = await h.alice.post('/v1/bills', {
        name: 'Rent',
        amount: usd(30000),
        accountId: everyday,
        dueDay: 20,
      });
      expect(created.status).toBe(201);
      rent = created.body as Bill;
      expect(rent).toMatchObject({ amount: usd(30000), active: true });
      expect((await today(h.alice)).available).toEqual(usd(137500));

      const paid = await h.alice.post(`/v1/bills/${rent.id}/payments`, {
        dueOn: '2026-03-20',
      });
      expect(paid.status).toBe(201);
      expect((paid.body as Bill).payments).toEqual([
        { dueOn: '2026-03-20', paidOn: '2026-03-15', transactionId: null },
      ]);
      expect((await today(h.alice)).available).toEqual(usd(167500));
      expect((await today(h.alice)).cycleBills).toEqual([
        {
          billId: rent.id,
          dueOn: '2026-03-20',
          amount: usd(30000),
          paidOn: '2026-03-15',
        },
      ]);

      const again = await h.alice.post(`/v1/bills/${rent.id}/payments`, {
        dueOn: '2026-03-20',
      });
      expect(again.status).toBe(409);
      expect(code(again)).toBe('bill_already_paid');

      const undone = await h.alice.delete(
        `/v1/bills/${rent.id}/payments/2026-03-20`,
      );
      expect(undone.status).toBe(200);
      expect((undone.body as Bill).payments).toEqual([]);
      expect((await today(h.alice)).available).toEqual(usd(137500));
      expect((await today(h.alice)).cycleBills).toEqual([
        {
          billId: rent.id,
          dueOn: '2026-03-20',
          amount: usd(30000),
          paidOn: null,
        },
      ]);
    });

    it('lists a due date that has passed unpaid until it is paid', async () => {
      expect((await today(h.alice)).billsDue).toEqual([]);
      clock = new Date('2026-03-21T12:00:00Z');
      try {
        expect((await today(h.alice)).billsDue).toEqual([
          {
            billId: rent.id,
            name: 'Rent',
            dueOn: '2026-03-20',
            amount: usd(30000),
          },
        ]);
        const paid = await h.alice.post(`/v1/bills/${rent.id}/payments`, {
          dueOn: '2026-03-20',
        });
        expect(paid.status).toBe(201);
        expect((await today(h.alice)).billsDue).toEqual([]);
        expect(
          (await h.alice.delete(`/v1/bills/${rent.id}/payments/2026-03-20`))
            .status,
        ).toBe(200);
      } finally {
        clock = started;
      }
    });

    it('only accepts payments for real due dates and entries', async () => {
      const wrongDay = await h.alice.post(`/v1/bills/${rent.id}/payments`, {
        dueOn: '2026-03-21',
      });
      expect(wrongDay.status).toBe(400);
      expect(code(wrongDay)).toBe('not_a_due_date');

      const unknownEntry = await h.alice.post(`/v1/bills/${rent.id}/payments`, {
        dueOn: '2026-03-20',
        transactionId: 'no-such-entry',
      });
      expect(unknownEntry.status).toBe(404);
      expect(code(unknownEntry)).toBe('transaction_not_found');

      const notPaid = await h.alice.delete(
        `/v1/bills/${rent.id}/payments/2026-04-20`,
      );
      expect(notPaid.status).toBe(404);
      expect(code(notPaid)).toBe('payment_not_found');
    });

    it("refuses an amount outside the account's currency", async () => {
      const response = await h.alice.post('/v1/bills', {
        name: 'Streaming',
        amount: eur(1299),
        accountId: everyday,
        dueDay: 3,
      });
      expect(response.status).toBe(400);
      expect(code(response)).toBe('currency_mismatch');
    });

    it("keeps each user's bills to themselves", async () => {
      expect((await h.bob.get(`/v1/bills/${rent.id}`)).status).toBe(404);
      expect((await h.bob.delete(`/v1/bills/${rent.id}`)).status).toBe(404);
      expect((await h.bob.get('/v1/bills')).body as { bills: Bill[] }).toEqual({
        bills: [],
      });
    });

    it('stops reserving an inactive or deleted bill', async () => {
      const inactive = await h.alice.patch(`/v1/bills/${rent.id}`, {
        active: false,
      });
      expect(inactive.status).toBe(200);
      expect((await today(h.alice)).available).toEqual(usd(167500));

      expect(
        (await h.alice.patch(`/v1/bills/${rent.id}`, { active: true })).status,
      ).toBe(200);
      expect((await today(h.alice)).available).toEqual(usd(137500));

      expect((await h.alice.delete(`/v1/bills/${rent.id}`)).status).toBe(204);
      expect((await h.alice.get(`/v1/bills/${rent.id}`)).status).toBe(404);
      expect((await today(h.alice)).available).toEqual(usd(167500));
    });
  });
});

describe('ledger settings', () => {
  it('has defaults for a new user', async () => {
    const response = await h.alice.get('/v1/settings/ledger');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      locale: 'en-US',
      timeZone: 'UTC',
      defaultCurrency: 'USD',
      paydayDay: 1,
      paydayOverride: null,
    });
  });

  it('moves payday by day of month and by override', async () => {
    expect((await patchSettings(h.alice, { paydayDay: 20 })).status).toBe(200);
    expect(await today(h.alice)).toMatchObject({
      cycleEnd: '2026-03-20',
      daysLeft: 5,
    });

    const overridden = await patchSettings(h.alice, {
      paydayOverride: '2026-03-25',
    });
    expect(overridden.body).toMatchObject({
      paydayDay: 20,
      paydayOverride: '2026-03-25',
    });
    expect(await today(h.alice)).toMatchObject({
      cycle: { payday: '2026-03-25' },
      daysLeft: 10,
    });

    await patchSettings(h.alice, { paydayOverride: null, paydayDay: 1 });
    expect((await today(h.alice)).cycleEnd).toBe('2026-04-01');
  });

  it("takes the user's calendar day from the time zone", async () => {
    // 12:00 UTC on 15 March is already 16 March at UTC+14.
    const changed = await patchSettings(h.alice, {
      timeZone: 'Pacific/Kiritimati',
    });
    expect(changed.status).toBe(200);
    expect((await today(h.alice)).today).toBe('2026-03-16');
    await patchSettings(h.alice, { timeZone: 'UTC' });
    expect((await today(h.alice)).today).toBe('2026-03-15');
  });

  it('canonicalizes the locale and refuses unknown values', async () => {
    const locale = await patchSettings(h.alice, { locale: 'en-gb' });
    expect(locale.body).toMatchObject({ locale: 'en-GB' });

    const zone = await patchSettings(h.alice, { timeZone: 'Mars/Olympus' });
    expect(zone.status).toBe(400);
    expect(code(zone)).toBe('invalid_time_zone');

    const badLocale = await patchSettings(h.alice, { locale: 'not a locale' });
    expect(badLocale.status).toBe(400);
    expect(code(badLocale)).toBe('invalid_locale');

    expect((await patchSettings(h.alice, {})).status).toBe(400);
    expect(
      (await patchSettings(h.alice, { defaultCurrency: 'XYZ' })).status,
    ).toBe(400);
  });

  it('marks payday overdue once it passes without a paycheck', async () => {
    await patchSettings(h.alice, { paydayOverride: '2026-03-17' });
    clock = new Date('2026-03-18T12:00:00Z');
    try {
      expect(await today(h.alice)).toMatchObject({
        today: '2026-03-18',
        cycle: { payday: '2026-03-17' },
        overdue: true,
        cycleEnd: '2026-03-19',
        daysLeft: 1,
      });
    } finally {
      clock = started;
      await patchSettings(h.alice, { paydayOverride: null });
    }
  });
});

describe('default currency and exchange rates', () => {
  let bobId: string;
  let checking: string;
  let rate: Rate;

  beforeAll(async () => {
    bobId = await userIdOf(h.bob);
    checking = await openAccount(h.bob, 'Checking', usd(100000));
    await openAccount(h.bob, 'Euro account', eur(50000));
  });

  async function postingCount(): Promise<number> {
    const { n } = await h.db
      .selectFrom('postings')
      .select(h.db.fn.countAll<number>().as('n'))
      .where('user_id', '=', bobId)
      .executeTakeFirstOrThrow();
    return n;
  }

  it('leaves out a currency without a rate and flags it', async () => {
    expect(await today(h.bob)).toMatchObject({
      available: usd(100000),
      missingRates: ['EUR'],
    });
  });

  it('converts with a manual rate, replacing one of the same day', async () => {
    const created = await h.bob.post('/v1/rates', {
      base: 'EUR',
      quote: 'USD',
      rate: '1.2',
    });
    expect(created.status).toBe(201);
    rate = created.body as Rate;
    expect(rate).toMatchObject({
      base: 'EUR',
      quote: 'USD',
      asOf: '2026-03-15',
    });
    expect(await today(h.bob)).toMatchObject({
      available: usd(160000),
      missingRates: [],
    });

    const replaced = await h.bob.post('/v1/rates', {
      base: 'EUR',
      quote: 'USD',
      rate: '1.1',
      asOf: '2026-03-15',
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body).toMatchObject({ id: rate.id, rate: '1.1' });
    expect((await today(h.bob)).available).toEqual(usd(155000));
  });

  it('switches the default currency without touching the ledger', async () => {
    const postings = await postingCount();
    const balance = (await h.bob.get(`/v1/accounts/${checking}`)).body;

    const switched = await patchSettings(h.bob, { defaultCurrency: 'EUR' });
    expect(switched.status).toBe(200);
    // 50000 EUR plus 100000 USD at 1.1 USD per EUR (90909.09, half to even).
    expect(await today(h.bob)).toMatchObject({
      available: eur(140909),
      missingRates: [],
    });

    expect(await postingCount()).toBe(postings);
    expect((await h.bob.get(`/v1/accounts/${checking}`)).body).toEqual(balance);
  });

  it('uses only rates dated on or before the day', async () => {
    const deleted = await h.bob.delete(`/v1/rates/${rate.id}`);
    expect(deleted.status).toBe(204);
    const future = await h.bob.post('/v1/rates', {
      base: 'USD',
      quote: 'EUR',
      rate: '0.8',
      asOf: '2026-03-16',
    });
    expect(future.status).toBe(201);
    expect(await today(h.bob)).toMatchObject({
      available: eur(50000),
      missingRates: ['USD'],
    });
  });

  it('lists rates newest first and keeps them to their user', async () => {
    await h.bob.post('/v1/rates', { base: 'GBP', quote: 'EUR', rate: '1.15' });
    const all = (await h.bob.get('/v1/rates')).body as { rates: Rate[] };
    expect(all.rates.map((r) => [r.base, r.quote, r.asOf])).toEqual([
      ['USD', 'EUR', '2026-03-16'],
      ['GBP', 'EUR', '2026-03-15'],
    ]);
    const usdOnly = (await h.bob.get('/v1/rates?currency=USD')).body as {
      rates: Rate[];
    };
    expect(usdOnly.rates).toHaveLength(1);

    expect((await h.alice.get('/v1/rates')).body).toEqual({ rates: [] });
    const [first] = all.rates;
    expect((await h.alice.delete(`/v1/rates/${first?.id ?? ''}`)).status).toBe(
      404,
    );
  });

  it('refuses a rate between one currency and itself', async () => {
    const response = await h.bob.post('/v1/rates', {
      base: 'EUR',
      quote: 'EUR',
      rate: '1',
    });
    expect(response.status).toBe(400);
  });
});
