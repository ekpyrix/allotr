import { bundleSchema } from '@allotr/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, userIdOf, type TwoUsers } from './testing/users.ts';

// IOUs in the export and import bundle (ADR 0024): the JSON export writes
// them as `iou`, `iou_payment` and `iou_write_off` entries that import back
// on an empty ledger with the same figures, and the CSV and Beancount
// exports balance. The clock is 20 April 2026. Names and amounts are made up.

type Money = { amountMinor: number; currency: string };
type Iou = {
  person: string;
  direction: string;
  amount: Money;
  outstanding: Money;
  repaid: Money;
  writtenOff: Money;
  dueOn: string | null;
  settled: boolean;
};

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
const clock = { now: new Date('2026-04-20T12:00:00Z') };
let h: TwoUsers;
let exported: unknown;

async function ious(client: TwoUsers['alice']) {
  const list = (await client.get('/v1/ious?status=all')).body as {
    ious: Iou[];
  };
  return list.ious
    .map((i) => ({
      person: i.person,
      direction: i.direction,
      amount: i.amount,
      outstanding: i.outstanding,
      repaid: i.repaid,
      writtenOff: i.writtenOff,
      dueOn: i.dueOn,
      settled: i.settled,
    }))
    .sort((a, b) => a.person.localeCompare(b.person));
}

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => clock.now });
  for (const client of [h.alice, h.bob]) {
    await h.db
      .updateTable('users')
      .set({ created_at: '2026-04-01T12:00:00.000Z' })
      .where('id', '=', await userIdOf(client))
      .execute();
  }
  const a = h.alice;
  const account = (
    (
      await a.post('/v1/accounts', {
        name: 'Everyday',
        currency: 'USD',
        openingBalance: usd(100_000),
        openedOn: '2026-04-01',
      })
    ).body as { id: string }
  ).id;
  const categories = (
    (await a.get('/v1/categories')).body as {
      categories: { id: string; name: string }[];
    }
  ).categories;
  const id = (name: string) =>
    categories.find((c) => c.name === name)?.id ?? '';
  expect(
    (await a.patch('/v1/settings/ledger', { iouWriteOffAfterDays: 7 })).status,
  ).toBe(200);

  const dinner = await a.post('/v1/ious', {
    direction: 'owed-to-me',
    accountId: account,
    people: [
      { person: 'Sam Example', amount: usd(3_000) },
      { person: 'Alex Example', amount: usd(3_000), dueOn: '2026-04-05' },
    ],
    ownShare: { amount: usd(3_000), categoryId: id('Eating out') },
    occurredOn: '2026-04-03',
    note: 'Dinner',
  });
  expect(dinner.status, JSON.stringify(dinner.body)).toBe(201);
  const [sam, alex] = (dinner.body as { ious: { id: string }[] }).ious;
  const borrowed = await a.post('/v1/ious', {
    direction: 'owed-by-me',
    accountId: account,
    people: [
      { person: 'Pat Example', amount: usd(5_000), dueOn: '2026-05-01' },
    ],
    occurredOn: '2026-04-06',
  });
  expect(borrowed.status).toBe(201);
  // A loan that was undone does not travel.
  const undone = await a.post('/v1/ious', {
    direction: 'owed-to-me',
    accountId: account,
    people: [{ person: 'Robin Example', amount: usd(900) }],
    occurredOn: '2026-04-07',
  });
  expect(
    (
      await a.post(
        `/v1/transactions/${(undone.body as { transaction: { id: string } }).transaction.id}/reverse`,
        {},
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await a.post('/v1/ious/repayments', {
        accountId: account,
        settles: [{ iouId: sam?.id, amount: usd(2_000) }],
        occurredOn: '2026-04-09',
        note: 'Part payment',
      })
    ).status,
  ).toBe(201);
  const written = await a.post(`/v1/ious/${alex?.id ?? ''}/write-off`, {
    categoryId: id('Eating out'),
    occurredOn: '2026-04-15',
  });
  expect(written.status, JSON.stringify(written.body)).toBe(201);
});

afterAll(async () => {
  await h.close();
});

describe('IOUs in the bundle', () => {
  it('exports IOU entries as their own kinds and leaves undone ones out', async () => {
    const response = await h.alice.get('/v1/export?format=json');
    expect(response.status).toBe(200);
    exported = response.body;
    const bundle = bundleSchema.parse(exported);
    expect(bundle.transactions.map((t) => [t.kind, t.occurredOn])).toEqual([
      ['iou', '2026-04-03'],
      ['iou', '2026-04-06'],
      ['iou_payment', '2026-04-09'],
      ['iou_write_off', '2026-04-15'],
    ]);
    const [dinner] = bundle.transactions;
    expect(dinner).toMatchObject({
      kind: 'iou',
      direction: 'owed-to-me',
      ownShare: { amount: usd(3_000), category: 'Food/Eating out' },
    });
    expect(bundle.settings?.iouWriteOffAfterDays).toBe(7);
  });

  it('imports back with the same people, amounts, figures and net worth', async () => {
    const imported = await h.bob.post('/v1/import', exported);
    expect(imported.status, JSON.stringify(imported.body)).toBe(201);
    expect((imported.body as { ious: number }).ious).toBe(3);
    expect(await ious(h.bob)).toEqual(await ious(h.alice));
    const [aliceToday, bobToday] = await Promise.all([
      h.alice.get('/v1/today'),
      h.bob.get('/v1/today'),
    ]);
    expect(bobToday.body).toEqual(aliceToday.body);
    const [aliceList, bobList] = await Promise.all([
      h.alice.get('/v1/ious'),
      h.bob.get('/v1/ious'),
    ]);
    expect((bobList.body as { totals: unknown }).totals).toEqual(
      (aliceList.body as { totals: unknown }).totals,
    );
    // The reserve for what Pat is owed came across too.
    expect(
      (bobList.body as { totals: { owedByMe: Money } }).totals.owedByMe,
    ).toEqual(usd(5_000));
  });

  it('exports CSV and Beancount that balance per currency', async () => {
    const csv = await h.alice.get('/v1/export?format=csv');
    expect(csv.status).toBe(200);
    const rows = String(csv.body).trim().split('\r\n').slice(1);
    // Postings of a live entry and of the undone loan and its undo.
    expect(rows.filter((r) => r.includes(',Receivables,'))).not.toHaveLength(0);
    const total = rows
      .map((r) => r.split(','))
      .reduce((sum, cols) => sum + Math.round(Number(cols[4]) * 100), 0);
    expect(total).toBe(0);
    const beancount = await h.alice.get('/v1/export?format=beancount');
    expect(beancount.status).toBe(200);
    expect(String(beancount.body)).toContain('Assets:Receivables-IOU');
    expect(String(beancount.body)).toContain('Liabilities:Payables-IOU');
  });

  it('refuses a payment that names an IOU no earlier entry created', async () => {
    const bundle = bundleSchema.parse(exported);
    const payment = bundle.transactions.find((t) => t.kind === 'iou_payment');
    const other = await startWithTwoUsers();
    try {
      const refused = await other.alice.post('/v1/import', {
        ...bundle,
        transactions: [payment],
      });
      expect(refused.status).toBe(400);
    } finally {
      await other.close();
    }
  });
});
