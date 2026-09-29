import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Account reconciliation with the default policy (FR-L9), through the API
// against real SQLite. The clock is fixed; all figures are made up.

type Money = { amountMinor: number; currency: string };
type Posting = { accountId: string; amount: Money; categoryId: string | null };
type Entry = {
  id: string;
  kind: string;
  occurredOn: string;
  categoryId: string | null;
  postings: Posting[];
};
type Result = {
  on: string;
  stated: Money;
  ledgerBalance: Money;
  difference: Money;
  reconciled: boolean;
  adjustment: Entry | null;
};
type Account = {
  id: string;
  balance: Money;
  lastReconciledOn: string | null;
};
type Category = { id: string; name: string; kind: string; isPaycheck: boolean };

const usd = (amountMinor: number): Money => ({ amountMinor, currency: 'USD' });

let h: TwoUsers;
let everyday: string;
let card: string;

beforeAll(async () => {
  h = await startWithTwoUsers({
    now: () => new Date('2026-03-15T12:00:00.000Z'),
  });
  everyday = await open('Everyday', 'asset', 100_000, '2026-03-01');
  card = await open('Card', 'liability', -20_000, '2026-03-01');
});

afterAll(async () => {
  await h.close();
});

async function open(
  name: string,
  kind: string,
  amountMinor: number,
  openedOn: string,
): Promise<string> {
  const response = await h.alice.post('/v1/accounts', {
    name,
    kind,
    currency: 'USD',
    openingBalance: usd(amountMinor),
    openedOn,
  });
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

async function reconcile(
  id: string,
  body: Record<string, unknown>,
  client: TestClient = h.alice,
) {
  return client.post(`/v1/accounts/${id}/reconcile`, body);
}

async function ok(id: string, body: Record<string, unknown>): Promise<Result> {
  const response = await reconcile(id, body);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as Result;
}

async function account(id: string): Promise<Account> {
  const response = await h.alice.get(`/v1/accounts/${id}`);
  expect(response.status).toBe(200);
  return response.body as Account;
}

async function entryCount(): Promise<number> {
  const response = await h.alice.get('/v1/transactions?limit=200');
  expect(response.status).toBe(200);
  return (response.body as { transactions: unknown[] }).transactions.length;
}

async function available(): Promise<number> {
  const response = await h.alice.get('/v1/today');
  expect(response.status).toBe(200);
  return (response.body as { available: Money }).available.amountMinor;
}

async function categories(): Promise<Category[]> {
  const response = await h.alice.get('/v1/categories?includeMerged=true');
  return (response.body as { categories: Category[] }).categories;
}

async function category(id: string | null): Promise<Category | undefined> {
  return (await categories()).find((c) => c.id === id);
}

describe('reconcile', () => {
  it('records a match without posting anything', async () => {
    const before = await entryCount();
    const result = await ok(everyday, {
      balance: usd(100_000),
      on: '2026-03-10',
    });
    expect(result).toMatchObject({
      on: '2026-03-10',
      ledgerBalance: usd(100_000),
      difference: usd(0),
      reconciled: true,
      adjustment: null,
    });
    expect(await entryCount()).toBe(before);
    expect((await account(everyday)).lastReconciledOn).toBe('2026-03-10');
  });

  it('only reports a difference until asked to adjust', async () => {
    const before = await entryCount();
    const result = await ok(everyday, { balance: usd(97_500) });
    expect(result).toMatchObject({
      on: '2026-03-15',
      ledgerBalance: usd(100_000),
      difference: usd(-2_500),
      reconciled: false,
      adjustment: null,
    });
    expect(await entryCount()).toBe(before);
    expect((await account(everyday)).lastReconciledOn).toBe('2026-03-10');
  });

  const adjustments: { shortfall: string } = { shortfall: '' };

  it('posts a shortfall as a balanced Unrecorded expense', async () => {
    const figure = await available();
    const result = await ok(everyday, {
      balance: usd(97_500),
      adjust: true,
      expectedDifference: usd(-2_500),
    });
    expect(result.reconciled).toBe(true);
    const entry = result.adjustment;
    expect(entry).toMatchObject({ kind: 'expense', occurredOn: '2026-03-15' });
    if (entry === null) throw new Error('no adjustment');
    adjustments.shortfall = entry.id;
    expect(
      entry.postings.reduce((sum, p) => sum + p.amount.amountMinor, 0),
    ).toBe(0);
    expect(await category(entry.categoryId)).toMatchObject({
      name: 'Unrecorded',
      kind: 'expense',
    });
    // Only the category the entry needs is created.
    expect(
      (await categories()).some((c) => c.name === 'Unrecorded income'),
    ).toBe(false);

    const after = await account(everyday);
    expect(after.balance).toEqual(usd(97_500));
    expect(after.lastReconciledOn).toBe('2026-03-15');
    expect(await available()).toBe(figure - 2_500);
  });

  it('is undone like any entry, and the reconciliation with it', async () => {
    const figure = await available();
    const response = await h.alice.post(
      `/v1/transactions/${adjustments.shortfall}/reverse`,
      {},
    );
    expect(response.status).toBe(201);
    const after = await account(everyday);
    expect(after.balance).toEqual(usd(100_000));
    expect(after.lastReconciledOn).toBe('2026-03-10');
    expect(await available()).toBe(figure + 2_500);
  });

  it('posts a surplus as income that never opens a cycle', async () => {
    const cycleOf = async () =>
      (
        (await h.alice.get('/v1/today')).body as {
          cycle: { openedBy: unknown };
        }
      ).cycle;
    const cycle = await cycleOf();
    const result = await ok(everyday, {
      balance: usd(100_300),
      on: '2026-03-12',
      adjust: true,
    });
    expect(result.adjustment).toMatchObject({
      kind: 'income',
      occurredOn: '2026-03-12',
    });
    expect(await category(result.adjustment?.categoryId ?? null)).toMatchObject(
      { name: 'Unrecorded income', kind: 'income', isPaycheck: false },
    );
    expect(await cycleOf()).toEqual(cycle);
    expect((await account(everyday)).lastReconciledOn).toBe('2026-03-12');
  });

  it('takes debts as negative balances', async () => {
    const result = await ok(card, {
      balance: usd(-21_000),
      adjust: true,
    });
    expect(result.difference).toEqual(usd(-1_000));
    expect(result.adjustment?.kind).toBe('expense');
    expect((await account(card)).balance).toEqual(usd(-21_000));
  });

  it('takes an amount owed exactly as the negative balance', async () => {
    const owed = await ok(card, { amountOwed: usd(21_500) });
    const negative = await ok(card, { balance: usd(-21_500) });
    expect(owed).toEqual(negative);
    expect(owed).toMatchObject({
      stated: usd(-21_500),
      ledgerBalance: usd(-21_000),
      difference: usd(-500),
      reconciled: false,
    });

    const adjusted = await ok(card, {
      amountOwed: usd(21_500),
      adjust: true,
      expectedDifference: usd(-500),
    });
    expect(adjusted.adjustment?.kind).toBe('expense');
    expect((await account(card)).balance).toEqual(usd(-21_500));
    // A credit on the statement is a negative amount owed.
    expect((await ok(card, { amountOwed: usd(-100) })).difference).toEqual(
      usd(21_600),
    );
  });

  it('takes exactly one of balance and amountOwed, in the account currency', async () => {
    const both = await reconcile(card, {
      balance: usd(-21_500),
      amountOwed: usd(21_500),
    });
    expect(both.status).toBe(400);
    const neither = await reconcile(card, { adjust: true });
    expect(neither.status).toBe(400);
    const euro = await reconcile(card, {
      amountOwed: { amountMinor: 1, currency: 'EUR' },
    });
    expect(euro.status).toBe(400);
    expect(euro.body).toMatchObject({ code: 'currency_mismatch' });
  });

  it('keeps using the categories after a rename and a merge', async () => {
    const first = await ok(everyday, {
      balance: usd(100_200),
      adjust: true,
    });
    const id = first.adjustment?.categoryId ?? '';
    const renamed = await h.alice.patch(`/v1/categories/${id}`, {
      name: 'Missing receipts',
    });
    expect(renamed.status).toBe(200);
    const second = await ok(everyday, {
      balance: usd(100_100),
      adjust: true,
    });
    expect(second.adjustment?.categoryId).toBe(id);

    const other = (await categories()).find(
      (c) => c.name === 'Other' && c.kind === 'expense',
    );
    const merged = await h.alice.delete(
      `/v1/categories/${id}?mergeInto=${other?.id ?? ''}`,
    );
    expect(merged.status).toBe(204);
    const third = await ok(everyday, {
      balance: usd(100_000),
      adjust: true,
    });
    expect(third.adjustment?.categoryId).toBe(other?.id);
  });

  it('refuses an adjustment when the difference moved', async () => {
    const before = await entryCount();
    const response = await reconcile(everyday, {
      balance: usd(90_000),
      adjust: true,
      expectedDifference: usd(-5),
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'reconcile_stale' });
    expect(await entryCount()).toBe(before);
  });

  it('records a match when the difference dropped to zero meanwhile', async () => {
    const { balance } = await account(everyday);
    const stated = usd(balance.amountMinor - 800);
    const seen = await ok(everyday, { balance: stated });
    expect(seen).toMatchObject({ difference: usd(-800), reconciled: false });

    // The missing entry is logged before the user adjusts.
    const other = (await categories()).find(
      (c) => c.name === 'Other' && c.kind === 'expense',
    );
    const logged = await h.alice.post('/v1/transactions', {
      kind: 'expense',
      accountId: everyday,
      amount: usd(800),
      categoryId: other?.id,
    });
    expect(logged.status, JSON.stringify(logged.body)).toBe(201);
    const before = await entryCount();

    const result = await ok(everyday, {
      balance: stated,
      adjust: true,
      expectedDifference: seen.difference,
    });
    expect(result).toMatchObject({
      on: '2026-03-15',
      ledgerBalance: stated,
      difference: usd(0),
      reconciled: true,
      adjustment: null,
    });
    expect(await entryCount()).toBe(before);
    expect((await account(everyday)).lastReconciledOn).toBe('2026-03-15');
  });

  it('refuses a future date and another currency', async () => {
    const future = await reconcile(everyday, {
      balance: usd(1),
      on: '2026-03-16',
    });
    expect(future.status).toBe(400);
    expect(future.body).toMatchObject({ code: 'future_date' });
    const euro = await reconcile(everyday, {
      balance: { amountMinor: 1, currency: 'EUR' },
    });
    expect(euro.status).toBe(400);
    expect(euro.body).toMatchObject({ code: 'currency_mismatch' });
  });

  it("does not reach another user's or an archived account", async () => {
    const other = await reconcile(everyday, { balance: usd(1) }, h.bob);
    expect(other.status).toBe(404);

    const spare = await open('Spare', 'asset', 0, '2026-03-01');
    expect(
      (await h.alice.post(`/v1/accounts/${spare}/archive`, {})).status,
    ).toBe(200);
    const archived = await reconcile(spare, { balance: usd(0) });
    expect(archived.status).toBe(409);
    expect(archived.body).toMatchObject({ code: 'account_archived' });
  });
});
