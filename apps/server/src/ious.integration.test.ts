import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// IOUs and split bills through the API against real SQLite and migrations
// (ADR 0024). The clock is fixed to 15 March 2026. All names and amounts are
// made up: Sam Example and Alex Example split a $90 dinner three ways.

type Money = { amountMinor: number; currency: string };
type Iou = {
  id: string;
  direction: string;
  person: string;
  amount: Money;
  repaid: Money;
  writtenOff: Money;
  outstanding: Money;
  settled: boolean;
  originId: string;
  dueOn: string | null;
  overdue: boolean;
  writeOffFrom: string | null;
  canWriteOff: boolean;
  settlements: { transactionId: string; kind: string; undone: boolean }[];
};
type Entry = {
  id: string;
  kind: string;
  postings: { systemRole: string | null; amount: Money }[];
};
type Today = {
  onBudget: Money;
  available: Money;
  reserved: Money;
  spentToday: Money;
  cycleSpent: Money;
  paceSpent: Money;
  startOfDay: Money;
};
type Status = {
  budgets: { name: string; left: Money; restored: Money }[];
  free: Money;
  unbudgeted: Money;
  covered: { fromFree: Money; fromBuffer: Money; shortfall: Money };
};

const started = new Date('2026-03-15T12:00:00Z');
let tick = 0;
const clock = () => new Date(started.getTime() + (tick += 1));
let h: TwoUsers;
let everyday = '';
let food = '';
let other = '';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

beforeAll(async () => {
  h = await startWithTwoUsers({ now: clock });
  await h.db
    .updateTable('users')
    .set({ created_at: started.toISOString() })
    .execute();
  everyday = (
    (
      await h.alice.post('/v1/accounts', {
        name: 'Everyday',
        currency: 'USD',
        openingBalance: usd(150_000),
      })
    ).body as { id: string }
  ).id;
  const categories = (
    (await h.alice.get('/v1/categories')).body as {
      categories: { id: string; name: string }[];
    }
  ).categories;
  food = categories.find((c) => c.name === 'Food')?.id ?? '';
  other = categories.find((c) => c.name === 'Other')?.id ?? '';
  expect(
    (
      await h.alice.post('/v1/budgets', {
        name: 'Food',
        target: { kind: 'category', categoryId: food },
        amount: usd(10_000),
      })
    ).status,
  ).toBe(201);
  const status = (await h.alice.get('/v1/budgets')).body as {
    budgets: { id: string; name: string }[];
  };
  const buffer = status.budgets.find((b) => b.name === 'Buffer');
  expect(
    (
      await h.alice.patch(`/v1/budgets/${buffer?.id ?? ''}`, {
        amount: usd(20_000),
      })
    ).status,
  ).toBe(200);
});

afterAll(async () => {
  await h.close();
});

const today = async () => (await h.alice.get('/v1/today')).body as Today;
const status = async () => (await h.alice.get('/v1/budgets')).body as Status;
const open = async () =>
  (await h.alice.get('/v1/ious')).body as {
    ious: Iou[];
    totals: { owedToMe: Money; owedByMe: Money };
  };

let dinner: { transaction: Entry; ious: Iou[] };
let beforeDinner: Today;

describe('a split bill', () => {
  it('records the share as an expense and one receivable line per person', async () => {
    beforeDinner = await today();
    const response = await h.alice.post('/v1/ious', {
      direction: 'owed-to-me',
      accountId: everyday,
      people: [
        { person: 'Sam Example', amount: usd(3_000) },
        { person: 'Alex Example', amount: usd(3_000), dueOn: '2026-03-30' },
      ],
      ownShare: { amount: usd(3_000), categoryId: food },
      note: 'Dinner',
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    dinner = response.body as typeof dinner;
    expect(dinner.transaction.kind).toBe('expense');
    expect(
      dinner.transaction.postings.map((p) => [
        p.systemRole,
        p.amount.amountMinor,
      ]),
    ).toEqual([
      [null, -9_000],
      ['expenses', 3_000],
      ['receivables', 3_000],
      ['receivables', 3_000],
    ]);
    expect(dinner.ious.map((i) => i.person)).toEqual([
      'Sam Example',
      'Alex Example',
    ]);
  });

  it('counts only the share as spending, but takes all $90 out of the money', async () => {
    const after = await today();
    expect(after.spentToday).toEqual(usd(3_000));
    expect(after.cycleSpent).toEqual(usd(3_000));
    expect(after.paceSpent).toEqual(usd(3_000));
    expect(after.onBudget.amountMinor).toBe(
      beforeDinner.onBudget.amountMinor - 9_000,
    );
    expect(after.reserved).toEqual(usd(0));
  });

  it('counts the share in its budget and covers the loans from free money', async () => {
    const s = await status();
    expect(s.budgets.find((b) => b.name === 'Food')?.left).toEqual(usd(7_000));
    expect(s.unbudgeted).toEqual(usd(0));
    expect(s.covered.fromFree).toEqual(usd(6_000));
  });

  it('lists what is owed, with totals', async () => {
    const list = await open();
    expect(list.ious).toHaveLength(2);
    expect(list.totals.owedToMe).toEqual(usd(6_000));
    expect(list.totals.owedByMe).toEqual(usd(0));
    expect(list.ious.find((i) => i.person === 'Alex Example')).toMatchObject({
      dueOn: '2026-03-30',
      overdue: false,
      outstanding: usd(3_000),
    });
  });

  it('suggests names used before', async () => {
    const response = await h.alice.get('/v1/ious/people?query=sa');
    expect(response.body).toEqual({ people: ['Sam Example'] });
    const all = (await h.alice.get('/v1/ious/people')).body as {
      people: string[];
    };
    expect(all.people.sort()).toEqual(['Alex Example', 'Sam Example']);
  });

  it("does not show one user the other's IOUs or names", async () => {
    const theirs = (await h.bob.get('/v1/ious')).body as { ious: Iou[] };
    expect(theirs.ious).toEqual([]);
    expect((await h.bob.get('/v1/ious/people')).body).toEqual({ people: [] });
    expect(
      (
        await h.bob.patch(`/v1/ious/${dinner.ious[0]?.id ?? ''}`, {
          dueOn: null,
        })
      ).status,
    ).toBe(404);
  });

  it('settles with a repayment that names the IOU, and refuses too much', async () => {
    const sam = dinner.ious.find((i) => i.person === 'Sam Example');
    const tooMuch = await h.alice.post('/v1/ious/repayments', {
      accountId: everyday,
      settles: [{ iouId: sam?.id, amount: usd(3_001) }],
    });
    expect(tooMuch.status).toBe(409);
    expect((tooMuch.body as { code?: string }).code ?? '').toContain(
      'over_settled',
    );

    const before = await today();
    const paid = await h.alice.post('/v1/ious/repayments', {
      accountId: everyday,
      settles: [{ iouId: sam?.id, amount: usd(3_000) }],
    });
    expect(paid.status, JSON.stringify(paid.body)).toBe(201);
    const body = paid.body as { transaction: Entry; ious: Iou[] };
    expect(body.ious[0]).toMatchObject({ settled: true, repaid: usd(3_000) });
    const after = await today();
    expect(after.onBudget.amountMinor).toBe(
      before.onBudget.amountMinor + 3_000,
    );
    // Money coming back is not income and not negative spending.
    expect(after.spentToday).toEqual(before.spentToday);
    expect(after.cycleSpent).toEqual(before.cycleSpent);
    expect((await open()).ious).toHaveLength(1);
    expect(
      ((await h.alice.get('/v1/ious?status=settled')).body as { ious: Iou[] })
        .ious,
    ).toHaveLength(1);
  });

  it('keeps an entry with a live payment, and refuses to edit or restore IOU entries', async () => {
    const sam = dinner.ious.find((i) => i.person === 'Sam Example');
    const undoOrigin = await h.alice.post(
      `/v1/transactions/${dinner.transaction.id}/reverse`,
      {},
    );
    expect(undoOrigin.status).toBe(409);
    expect((undoOrigin.body as { code?: string }).code ?? '').toContain(
      'iou_has_payments',
    );
    const edit = await h.alice.post(
      `/v1/transactions/${dinner.transaction.id}/edit`,
      {
        kind: 'expense',
        accountId: everyday,
        amount: usd(100),
        categoryId: other,
      },
    );
    expect(edit.status).toBe(409);
    expect(sam).toBeDefined();
  });

  it('owes again when the payment is undone', async () => {
    const sam = (await open()).ious;
    expect(sam).toHaveLength(1);
    const settled = (
      (await h.alice.get('/v1/ious?status=settled')).body as { ious: Iou[] }
    ).ious[0];
    const paying = settled?.settlements[0]?.transactionId ?? '';
    const undo = await h.alice.post(`/v1/transactions/${paying}/reverse`, {});
    expect(undo.status).toBe(201);
    const list = await open();
    expect(list.ious).toHaveLength(2);
    expect(list.totals.owedToMe).toEqual(usd(6_000));
    // And an undone payment cannot be restored as a plain entry either.
    const restore = await h.alice.post(`/v1/transactions/${paying}/restore`);
    expect(restore.status).toBe(409);
  });
});

describe('lending', () => {
  it('covers the loan from free money and the Buffer, and a repayment refills the Buffer first', async () => {
    const free = (await status()).free.amountMinor;
    // More than free money, so the Buffer covers the rest.
    const amount = free + 5_000;
    const loan = await h.alice.post('/v1/ious/cover-preview', {
      direction: 'owed-to-me',
      accountId: everyday,
      people: [{ person: 'Sam Example', amount: usd(amount) }],
    });
    expect(loan.status, JSON.stringify(loan.body)).toBe(200);
    expect((loan.body as { reachesSetAside: boolean }).reachesSetAside).toBe(
      true,
    );

    const made = await h.alice.post('/v1/ious', {
      direction: 'owed-to-me',
      accountId: everyday,
      people: [{ person: 'Sam Example', amount: usd(amount) }],
    });
    expect(made.status).toBe(201);
    const lent = made.body as { transaction: Entry; ious: Iou[] };
    expect(lent.transaction.kind).toBe('transfer');
    expect((await today()).spentToday).toEqual(usd(3_000));
    let s = await status();
    expect(s.unbudgeted).toEqual(usd(0));
    expect(s.covered.fromBuffer).toEqual(usd(5_000));
    expect(s.budgets.find((b) => b.name === 'Buffer')?.left).toEqual(
      usd(15_000),
    );

    const back = await h.alice.post('/v1/ious/repayments', {
      accountId: everyday,
      settles: [{ iouId: lent.ious[0]?.id, amount: usd(amount) }],
    });
    expect(back.status).toBe(201);
    s = await status();
    const buffer = s.budgets.find((b) => b.name === 'Buffer');
    expect(buffer?.restored).toEqual(usd(5_000));
    expect(buffer?.left).toEqual(usd(20_000));
    expect(s.covered.fromBuffer).toEqual(usd(5_000));
  });
});

describe('borrowing', () => {
  it('reserves what is owed until it is paid, without spending', async () => {
    const before = await today();
    const borrowed = await h.alice.post('/v1/ious', {
      direction: 'owed-by-me',
      accountId: everyday,
      people: [{ person: 'Alex Example', amount: usd(6_000) }],
    });
    expect(borrowed.status).toBe(201);
    const { ious } = borrowed.body as { ious: Iou[] };
    const mid = await today();
    expect(mid.onBudget.amountMinor).toBe(before.onBudget.amountMinor + 6_000);
    expect(mid.available).toEqual(before.available);
    expect(mid.reserved.amountMinor).toBe(before.reserved.amountMinor + 6_000);
    expect(mid.spentToday).toEqual(before.spentToday);
    expect((await open()).totals.owedByMe).toEqual(usd(6_000));

    const paid = await h.alice.post('/v1/ious/repayments', {
      accountId: everyday,
      settles: [{ iouId: ious[0]?.id, amount: usd(6_000) }],
    });
    expect(paid.status).toBe(201);
    const after = await today();
    expect(after.reserved).toEqual(before.reserved);
    expect(after.available).toEqual(before.available);
    expect(after.cycleSpent).toEqual(before.cycleSpent);
    expect((await open()).totals.owedByMe).toEqual(usd(0));
  });

  it('refuses to mix directions in one payment', async () => {
    const [toMe] = (await open()).ious;
    const borrowed = await h.alice.post('/v1/ious', {
      direction: 'owed-by-me',
      accountId: everyday,
      people: [{ person: 'Pat Example', amount: usd(1_000) }],
    });
    const mine = (borrowed.body as { ious: Iou[] }).ious[0];
    const mixed = await h.alice.post('/v1/ious/repayments', {
      accountId: everyday,
      settles: [
        { iouId: toMe?.id, amount: usd(100) },
        { iouId: mine?.id, amount: usd(100) },
      ],
    });
    expect(mixed.status).toBe(400);
  });
});

describe('write-off', () => {
  it('is offered after the configured time and turns the remainder into an expense', async () => {
    const alex = (await open()).ious.find((i) => i.person === 'Alex Example');
    expect(alex?.direction).toBe('owed-to-me');
    const early = await h.alice.post(`/v1/ious/${alex?.id ?? ''}/write-off`, {
      categoryId: other,
    });
    expect(early.status).toBe(409);
    expect((early.body as { code?: string }).code ?? '').toContain(
      'write_off_not_yet',
    );

    // One day after the due date is enough once the setting says so.
    expect(
      (await h.alice.patch('/v1/settings/ledger', { iouWriteOffAfterDays: 1 }))
        .status,
    ).toBe(200);
    const due = await h.alice.patch(`/v1/ious/${alex?.id ?? ''}`, {
      dueOn: '2026-03-10',
    });
    expect(due.status).toBe(200);
    expect((due.body as Iou).overdue).toBe(true);
    expect((due.body as Iou).canWriteOff).toBe(true);

    const before = await today();
    const written = await h.alice.post(`/v1/ious/${alex?.id ?? ''}/write-off`, {
      categoryId: other,
    });
    expect(written.status, JSON.stringify(written.body)).toBe(201);
    const body = written.body as { transaction: Entry; iou: Iou };
    expect(body.transaction.kind).toBe('write_off');
    expect(body.iou).toMatchObject({
      settled: true,
      writtenOff: usd(3_000),
      repaid: usd(0),
    });
    // No cash moved, so the day's spending and the balances are unchanged.
    const after = await today();
    expect(after.spentToday).toEqual(before.spentToday);
    expect(after.onBudget).toEqual(before.onBudget);
    // It is an expense in the chosen category for reports.
    const entries = (
      (await h.alice.get('/v1/transactions?limit=100')).body as {
        transactions: Entry[];
      }
    ).transactions;
    expect(entries.find((t) => t.id === body.transaction.id)?.postings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ systemRole: 'expenses', amount: usd(3_000) }),
      ]),
    );
    const again = await h.alice.post(`/v1/ious/${alex?.id ?? ''}/write-off`, {
      categoryId: other,
    });
    expect(again.status).toBe(409);
  });

  it('does not write off money the user owes', async () => {
    const mine = (
      (await h.alice.get('/v1/ious?status=open')).body as { ious: Iou[] }
    ).ious.find((i) => i.direction === 'owed-by-me');
    const response = await h.alice.post(
      `/v1/ious/${mine?.id ?? ''}/write-off`,
      {
        categoryId: other,
      },
    );
    expect(response.status).toBe(409);
  });
});

describe('requests', () => {
  it('replays an idempotent request instead of lending twice', async () => {
    const body = {
      direction: 'owed-to-me',
      accountId: everyday,
      people: [{ person: 'Robin Example', amount: usd(500) }],
    };
    const first = await h.alice.post('/v1/ious', body, {
      'idempotency-key': 'lend-robin',
    });
    const second = await h.alice.post('/v1/ious', body, {
      'idempotency-key': 'lend-robin',
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect((second.body as { ious: Iou[] }).ious[0]?.id).toBe(
      (first.body as { ious: Iou[] }).ious[0]?.id,
    );
  });

  it('refuses amounts in another currency than the account', async () => {
    const response = await h.alice.post('/v1/ious', {
      direction: 'owed-to-me',
      accountId: everyday,
      people: [
        {
          person: 'Sam Example',
          amount: { amountMinor: 100, currency: 'EUR' },
        },
      ],
    });
    expect(response.status).toBe(400);
  });

  it('refuses a split bill for money the user owes', async () => {
    const response = await h.alice.post('/v1/ious', {
      direction: 'owed-by-me',
      accountId: everyday,
      people: [{ person: 'Sam Example', amount: usd(100) }],
      ownShare: { amount: usd(100), categoryId: food },
    });
    expect(response.status).toBe(400);
  });

  it('needs a signed-in user', async () => {
    const anonymous = await fetch(new URL('/v1/ious', h.server.url));
    expect(anonymous.status).toBe(401);
  });
});
