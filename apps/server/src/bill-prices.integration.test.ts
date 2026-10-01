import { bundleSchema } from '@allotr/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient, TestResponse } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Bills priced in another currency through the API against real SQLite:
// a subscription priced in USD, paid from a THB account for a different
// amount each month. The clock is fixed so the users joined on 15 March
// 2026 (UTC). All figures are made up.

type Money = { amountMinor: number; currency: string };
type Payment = {
  dueOn: string;
  paidOn: string;
  transactionId: string | null;
  recorded: boolean;
  paid: Money | null;
  price: Money | null;
};
type Bill = {
  id: string;
  amount: Money;
  price: Money | null;
  reserve: Money;
  categoryId: string | null;
  payments: Payment[];
};

const started = new Date('2026-03-15T12:00:00Z');
let h: TwoUsers;
let everyday: string;
let subscriptions: string;

const thb = (amountMinor: number) => ({ amountMinor, currency: 'THB' });
const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

function code(response: TestResponse): unknown {
  return (response.body as { code?: string }).code;
}

async function available(client: TestClient): Promise<Money> {
  const response = await client.get('/v1/today');
  expect(response.status).toBe(200);
  return (response.body as { available: Money }).available;
}

async function categoryId(client: TestClient, name: string): Promise<string> {
  const list = await client.get('/v1/categories');
  const found = (
    list.body as { categories: { id: string; name: string }[] }
  ).categories.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no category ${name}`);
  return found.id;
}

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => started });
  await h.db
    .updateTable('users')
    .set({ created_at: started.toISOString() })
    .execute();
  // A cycle to the end of April holds the due dates of 20 March and 20 April.
  expect(
    (
      await h.alice.patch('/v1/settings/ledger', {
        defaultCurrency: 'THB',
        paydayRule: 'manual',
        paydayOverride: '2026-04-30',
      })
    ).status,
  ).toBe(200);
  const account = await h.alice.post('/v1/accounts', {
    name: 'Everyday',
    currency: 'THB',
    openingBalance: thb(3000000),
  });
  expect(account.status).toBe(201);
  everyday = (account.body as { id: string }).id;
  subscriptions = await categoryId(h.alice, 'Bills and subscriptions');
});

afterAll(async () => {
  await h.close();
});

describe('a bill priced in another currency', () => {
  let streaming: Bill;

  it('reserves its estimate until a payment took an amount', async () => {
    const created = await h.alice.post('/v1/bills', {
      name: 'Streaming',
      amount: thb(45000),
      price: usd(1250),
      accountId: everyday,
      categoryId: subscriptions,
      dueDay: 20,
    });
    expect(created.status).toBe(201);
    streaming = created.body as Bill;
    expect(streaming).toMatchObject({
      amount: thb(45000),
      price: usd(1250),
      reserve: thb(45000),
      categoryId: subscriptions,
    });
    expect(await available(h.alice)).toEqual(thb(3000000 - 2 * 45000));
  });

  it('reserves each due date in the cycle at the estimate', async () => {
    const due = await h.alice.get('/v1/today');
    expect(due.status).toBe(200);
    // Nothing is due by 15 March; the cycle lists both due dates.
    expect((due.body as { cycleBills: unknown[] }).cycleBills).toEqual([
      {
        billId: streaming.id,
        dueOn: '2026-03-20',
        amount: thb(45000),
        paidOn: null,
      },
      {
        billId: streaming.id,
        dueOn: '2026-04-20',
        amount: thb(45000),
        paidOn: null,
      },
    ]);
  });

  it('refuses a price in the account currency or a non-expense category', async () => {
    const sameCurrency = await h.alice.post('/v1/bills', {
      name: 'Gym',
      amount: thb(90000),
      price: thb(90000),
      accountId: everyday,
      dueDay: 1,
    });
    expect(sameCurrency.status).toBe(400);
    expect(code(sameCurrency)).toBe('price_same_currency');

    const income = await h.alice.post('/v1/bills', {
      name: 'Gym',
      amount: thb(90000),
      accountId: everyday,
      categoryId: await categoryId(h.alice, 'Paycheck'),
      dueDay: 1,
    });
    expect(income.status).toBe(400);
    expect(code(income)).toBe('invalid_category');
  });

  it('records the amount paid as an expense and reserves it next time', async () => {
    const paid = await h.alice.post(`/v1/bills/${streaming.id}/payments`, {
      dueOn: '2026-03-20',
      paid: thb(46275),
    });
    expect(paid.status).toBe(201);
    const bill = paid.body as Bill;
    const [payment] = bill.payments;
    expect(payment).toMatchObject({
      dueOn: '2026-03-20',
      paidOn: '2026-03-15',
      recorded: true,
      paid: thb(46275),
      price: usd(1250),
    });
    expect(bill.reserve).toEqual(thb(46275));

    const entry = await h.alice.get(
      `/v1/transactions/${payment?.transactionId ?? ''}`,
    );
    expect(entry.status).toBe(200);
    expect(entry.body).toMatchObject({
      kind: 'expense',
      occurredOn: '2026-03-15',
      note: 'Streaming',
      categoryId: subscriptions,
    });

    // March is spent; April now reserves what March took.
    expect(await available(h.alice)).toEqual(thb(3000000 - 2 * 46275));
  });

  it('undoes the recorded entry with the mark', async () => {
    const undone = await h.alice.delete(
      `/v1/bills/${streaming.id}/payments/2026-03-20`,
    );
    expect(undone.status).toBe(200);
    expect((undone.body as Bill).payments).toEqual([]);
    expect((undone.body as Bill).reserve).toEqual(thb(45000));
    expect(await available(h.alice)).toEqual(thb(3000000 - 2 * 45000));
  });

  it('falls back to the estimate once the entry itself is undone', async () => {
    const paid = await h.alice.post(`/v1/bills/${streaming.id}/payments`, {
      dueOn: '2026-03-20',
      paid: thb(45510),
      price: usd(1275),
    });
    expect(paid.status).toBe(201);
    const [payment] = (paid.body as Bill).payments;
    expect(payment?.price).toEqual(usd(1275));

    const reversed = await h.alice.post(
      `/v1/transactions/${payment?.transactionId ?? ''}/reverse`,
      {},
    );
    expect(reversed.status).toBe(201);
    const bill = (await h.alice.get(`/v1/bills/${streaming.id}`)).body as Bill;
    expect(bill.payments[0]).toMatchObject({ recorded: true, paid: null });
    expect(bill.reserve).toEqual(thb(45000));
    // March stays marked paid; April reserves the estimate again.
    expect(await available(h.alice)).toEqual(thb(3000000 - 45000));

    // Undoing the mark leaves the entry, already undone, as it is.
    expect(
      (await h.alice.delete(`/v1/bills/${streaming.id}/payments/2026-03-20`))
        .status,
    ).toBe(200);
    expect(await available(h.alice)).toEqual(thb(3000000 - 2 * 45000));
  });

  it('refuses a payment it cannot record', async () => {
    const both = await h.alice.post(`/v1/bills/${streaming.id}/payments`, {
      dueOn: '2026-03-20',
      paid: thb(46275),
      transactionId: streaming.id,
    });
    expect(both.status).toBe(400);

    const wrongCurrency = await h.alice.post(
      `/v1/bills/${streaming.id}/payments`,
      { dueOn: '2026-03-20', paid: usd(1250) },
    );
    expect(wrongCurrency.status).toBe(400);
    expect(code(wrongCurrency)).toBe('currency_mismatch');

    const noCategory = await h.alice.patch(`/v1/bills/${streaming.id}`, {
      categoryId: null,
    });
    expect(noCategory.status).toBe(200);
    const uncategorised = await h.alice.post(
      `/v1/bills/${streaming.id}/payments`,
      { dueOn: '2026-03-20', paid: thb(46275) },
    );
    expect(uncategorised.status).toBe(400);
    expect(code(uncategorised)).toBe('category_required');
    // Nothing was recorded or marked.
    expect(await available(h.alice)).toEqual(thb(3000000 - 2 * 45000));

    const named = await h.alice.post(`/v1/bills/${streaming.id}/payments`, {
      dueOn: '2026-03-20',
      paid: thb(46275),
      categoryId: subscriptions,
    });
    expect(named.status).toBe(201);
    expect(
      (await h.alice.delete(`/v1/bills/${streaming.id}/payments/2026-03-20`))
        .status,
    ).toBe(200);
  });

  it('changes or removes the price', async () => {
    const changed = await h.alice.patch(`/v1/bills/${streaming.id}`, {
      price: { amountMinor: 990, currency: 'EUR' },
    });
    expect(changed.status).toBe(200);
    expect((changed.body as Bill).price).toEqual({
      amountMinor: 990,
      currency: 'EUR',
    });

    const same = await h.alice.patch(`/v1/bills/${streaming.id}`, {
      price: thb(45000),
    });
    expect(same.status).toBe(400);
    expect(code(same)).toBe('price_same_currency');

    const removed = await h.alice.patch(`/v1/bills/${streaming.id}`, {
      price: null,
    });
    expect(removed.status).toBe(200);
    expect((removed.body as Bill).price).toBeNull();
  });

  it('exports the price, category and recorded payment, and imports them back', async () => {
    const restored = await h.alice.patch(`/v1/bills/${streaming.id}`, {
      price: usd(1250),
      categoryId: subscriptions,
    });
    expect(restored.status).toBe(200);
    expect(
      (
        await h.alice.post(`/v1/bills/${streaming.id}/payments`, {
          dueOn: '2026-03-20',
          paid: thb(46275),
        })
      ).status,
    ).toBe(201);

    const exported = await h.alice.get('/v1/export?format=json');
    expect(exported.status).toBe(200);
    const bundle = bundleSchema.parse(exported.body);
    expect(bundle.bills).toEqual([
      expect.objectContaining({
        name: 'Streaming',
        price: usd(1250),
        category: 'Bills and subscriptions',
        payments: [
          expect.objectContaining({ dueOn: '2026-03-20', recorded: true }),
        ],
      }),
    ]);

    // Bob starts empty, so the bundle imports as his ledger.
    expect((await h.bob.post('/v1/import', exported.body)).status).toBe(201);
    const bills = (await h.bob.get('/v1/bills')).body as { bills: Bill[] };
    expect(bills.bills).toEqual([
      expect.objectContaining({
        price: usd(1250),
        reserve: thb(46275),
        categoryId: await categoryId(h.bob, 'Bills and subscriptions'),
        payments: [
          expect.objectContaining({
            recorded: true,
            paid: thb(46275),
            price: usd(1250),
          }),
        ],
      }),
    ]);
  });

  it("keeps each user's bills to themselves", async () => {
    expect((await h.bob.get(`/v1/bills/${streaming.id}`)).status).toBe(404);
    const paid = await h.bob.post(`/v1/bills/${streaming.id}/payments`, {
      dueOn: '2026-04-20',
      paid: thb(46275),
    });
    expect(paid.status).toBe(404);
  });
});
