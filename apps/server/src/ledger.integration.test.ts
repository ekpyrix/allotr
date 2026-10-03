import { accountId, categoryId, expense } from '@allotr/core';
import { localDate, money } from '@allotr/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appendTransaction,
  ensureSystemAccounts,
  loadChart,
  newEntry,
} from './ledger/store.ts';
import {
  createClient,
  type TestClient,
  type TestResponse,
} from './testing/http-client.ts';
import { startWithTwoUsers, userIdOf, type TwoUsers } from './testing/users.ts';

// Accounts, categories and tags through the API, against real SQLite and
// migrations (FR-L2, FR-L3, FR-L7, FR-L8). All figures are made up.

type Account = {
  id: string;
  name: string;
  currency: string;
  budgetGroup: 'on' | 'off';
  balance: { amountMinor: number; currency: string };
  archived: boolean;
};
type Category = {
  id: string;
  name: string;
  kind: string;
  parentId: string | null;
  isPaycheck: boolean;
  colour: string | null;
  icon: string | null;
  mergedIntoId: string | null;
};

let h: TwoUsers;

beforeAll(async () => {
  h = await startWithTwoUsers();
});

afterAll(async () => {
  await h.close();
});

function code(response: TestResponse): unknown {
  return (response.body as { code?: string }).code;
}

async function openAccount(
  client: TestClient,
  name: string,
  extra: Record<string, unknown> = {},
): Promise<Account> {
  const response = await client.post('/v1/accounts', {
    name,
    currency: 'USD',
    ...extra,
  });
  expect(response.status).toBe(201);
  return response.body as Account;
}

async function categories(client: TestClient, query = ''): Promise<Category[]> {
  const response = await client.get(`/v1/categories${query}`);
  expect(response.status).toBe(200);
  return (response.body as { categories: Category[] }).categories;
}

describe('accounts', () => {
  it('opens an account with an opening balance', async () => {
    const account = await openAccount(h.alice, 'Everyday card', {
      openingBalance: { amountMinor: 125000, currency: 'USD' },
    });
    expect(account).toMatchObject({
      name: 'Everyday card',
      currency: 'USD',
      budgetGroup: 'on',
      balance: { amountMinor: 125000, currency: 'USD' },
      archived: false,
    });
    const list = await h.alice.get('/v1/accounts');
    expect((list.body as { accounts: Account[] }).accounts).toContainEqual(
      account,
    );
  });

  it('keeps 0- and 3-digit currencies exact', async () => {
    const yen = await openAccount(h.alice, 'Yen wallet', {
      currency: 'JPY',
      openingBalance: { amountMinor: 12000, currency: 'JPY' },
    });
    const dinar = await openAccount(h.alice, 'Dinar account', {
      currency: 'KWD',
      budgetGroup: 'off',
      openingBalance: { amountMinor: 1500, currency: 'KWD' },
    });
    expect(yen.balance).toEqual({ amountMinor: 12000, currency: 'JPY' });
    expect(dinar).toMatchObject({
      budgetGroup: 'off',
      balance: { amountMinor: 1500, currency: 'KWD' },
    });
  });

  it('refuses an opening balance in another currency', async () => {
    const response = await h.alice.post('/v1/accounts', {
      name: 'Mismatch',
      currency: 'USD',
      openingBalance: { amountMinor: 100, currency: 'EUR' },
    });
    expect(response.status).toBe(400);
    expect(code(response)).toBe('currency_mismatch');
  });

  it('refuses an unknown currency and a duplicate name', async () => {
    const unknown = await h.alice.post('/v1/accounts', {
      name: 'Nowhere',
      currency: 'XYZ',
    });
    expect(unknown.status).toBe(400);

    await openAccount(h.alice, 'Travel fund');
    const duplicate = await h.alice.post('/v1/accounts', {
      name: 'travel FUND',
      currency: 'EUR',
    });
    expect(duplicate.status).toBe(409);
    expect(code(duplicate)).toBe('account_name_taken');
  });

  it('keeps the currency fixed', async () => {
    const account = await openAccount(h.alice, 'Fixed');
    const response = await h.alice.patch(`/v1/accounts/${account.id}`, {
      currency: 'EUR',
    });
    expect(response.status).toBe(400);
    const after = await h.alice.get(`/v1/accounts/${account.id}`);
    expect((after.body as Account).currency).toBe('USD');
  });

  it('renames an account', async () => {
    const account = await openAccount(h.alice, 'Old name');
    const response = await h.alice.patch(`/v1/accounts/${account.id}`, {
      name: 'New name',
    });
    expect(response.status).toBe(200);
    expect((response.body as Account).name).toBe('New name');
  });

  it('moves an account off budget from today with a system transaction', async () => {
    const account = await openAccount(h.alice, 'Rainy day', {
      openingBalance: { amountMinor: 50000, currency: 'USD' },
    });
    const response = await h.alice.patch(`/v1/accounts/${account.id}`, {
      budgetGroup: 'off',
    });
    expect(response.status).toBe(200);
    expect((response.body as Account).budgetGroup).toBe('off');

    const switches = await h.db
      .selectFrom('transactions')
      .select(['kind', 'source', 'occurred_on', 'switch_budget_group'])
      .where('switch_account_id', '=', account.id)
      .execute();
    expect(switches).toEqual([
      {
        kind: 'budget_switch',
        source: 'system',
        occurred_on: new Date().toISOString().slice(0, 10),
        switch_budget_group: 'off',
      },
    ]);

    // Asking for the group it is already in records nothing.
    await h.alice.patch(`/v1/accounts/${account.id}`, { budgetGroup: 'off' });
    const again = await h.db
      .selectFrom('transactions')
      .select('id')
      .where('switch_account_id', '=', account.id)
      .execute();
    expect(again).toHaveLength(1);
  });
});

describe('archiving', () => {
  it('refuses a non-zero balance', async () => {
    const account = await openAccount(h.alice, 'Nearly empty', {
      openingBalance: { amountMinor: 1234, currency: 'USD' },
    });
    const response = await h.alice.post(`/v1/accounts/${account.id}/archive`);
    expect(response.status).toBe(409);
    expect(code(response)).toBe('account_not_empty');
    expect((response.body as { detail: string }).detail).toContain('$12.34');
  });

  it('archives after transferring the balance', async () => {
    const from = await openAccount(h.alice, 'Closing account', {
      openingBalance: { amountMinor: 30000, currency: 'USD' },
    });
    const to = await openAccount(h.alice, 'Receiving account', {
      openingBalance: { amountMinor: 1000, currency: 'USD' },
    });
    const response = await h.alice.post(`/v1/accounts/${from.id}/archive`, {
      settle: { method: 'transfer', toAccountId: to.id },
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      archived: true,
      balance: { amountMinor: 0, currency: 'USD' },
    });
    const target = await h.alice.get(`/v1/accounts/${to.id}`);
    expect((target.body as Account).balance.amountMinor).toBe(31000);
  });

  it('archives after writing a debt off', async () => {
    const card = await openAccount(h.alice, 'Old credit card', {
      kind: 'liability',
      openingBalance: { amountMinor: -4500, currency: 'USD' },
    });
    const response = await h.alice.post(`/v1/accounts/${card.id}/archive`, {
      settle: { method: 'write_off' },
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      archived: true,
      balance: { amountMinor: 0 },
    });
  });

  it('archives an empty account and hides it from the default list', async () => {
    const account = await openAccount(h.alice, 'Never used');
    expect(
      (await h.alice.post(`/v1/accounts/${account.id}/archive`)).status,
    ).toBe(200);
    const open = await h.alice.get('/v1/accounts');
    const all = await h.alice.get('/v1/accounts?includeArchived=true');
    const ids = (r: TestResponse) =>
      (r.body as { accounts: Account[] }).accounts.map((a) => a.id);
    expect(ids(open)).not.toContain(account.id);
    expect(ids(all)).toContain(account.id);

    // Its name is free again.
    await openAccount(h.alice, 'Never used');
  });

  it('refuses a transfer to another currency or an archived account', async () => {
    const from = await openAccount(h.alice, 'Dollars to close', {
      openingBalance: { amountMinor: 100, currency: 'USD' },
    });
    const euros = await openAccount(h.alice, 'Euro target', {
      currency: 'EUR',
    });
    const other = await h.alice.post(`/v1/accounts/${from.id}/archive`, {
      settle: { method: 'transfer', toAccountId: euros.id },
    });
    expect(other.status).toBe(400);
    expect(code(other)).toBe('currency_mismatch');

    const closed = await openAccount(h.alice, 'Closed target');
    await h.alice.post(`/v1/accounts/${closed.id}/archive`);
    const archived = await h.alice.post(`/v1/accounts/${from.id}/archive`, {
      settle: { method: 'transfer', toAccountId: closed.id },
    });
    expect(archived.status).toBe(409);
    expect(code(archived)).toBe('account_archived');

    const still = await h.alice.get(`/v1/accounts/${from.id}`);
    expect(still.body).toMatchObject({
      archived: false,
      balance: { amountMinor: 100 },
    });
  });
});

describe('categories', () => {
  it('lists the starter set, parents in order with their subcategories', async () => {
    const names = (await categories(h.bob)).map((c) => c.name);
    expect(names).toEqual([
      'Food',
      'Groceries',
      'Eating out',
      'Transport',
      'Housing',
      'Rent',
      'Utilities',
      'Bills and subscriptions',
      'Health',
      'Shopping',
      'Fun',
      'Other',
      'Paycheck',
      'Other income',
    ]);
    const paycheck = (await categories(h.alice)).find(
      (c) => c.name === 'Paycheck',
    );
    expect(paycheck).toMatchObject({ kind: 'income', isPaycheck: true });
  });

  it('adds a subcategory of its parent’s kind, two levels deep', async () => {
    const food = (await categories(h.alice)).find((c) => c.name === 'Food');
    const created = await h.alice.post('/v1/categories', {
      name: 'Coffee',
      parentId: food?.id,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ kind: 'expense', parentId: food?.id });

    const third = await h.alice.post('/v1/categories', {
      name: 'Espresso',
      parentId: (created.body as Category).id,
    });
    expect(third.status).toBe(400);
    expect(code(third)).toBe('invalid_parent');

    const wrongKind = await h.alice.post('/v1/categories', {
      name: 'Tips',
      kind: 'income',
      parentId: food?.id,
    });
    expect(code(wrongKind)).toBe('invalid_parent');
  });

  it('refuses a paycheck category that is not income', async () => {
    const response = await h.alice.post('/v1/categories', {
      name: 'Odd',
      kind: 'expense',
      isPaycheck: true,
    });
    expect(response.status).toBe(400);
    expect(code(response)).toBe('invalid_paycheck');
  });

  it('renames and moves a category', async () => {
    const created = await h.alice.post('/v1/categories', {
      name: 'Pets',
      kind: 'expense',
    });
    const id = (created.body as Category).id;
    const health = (await categories(h.alice)).find((c) => c.name === 'Health');
    const moved = await h.alice.patch(`/v1/categories/${id}`, {
      name: 'Vet',
      parentId: health?.id,
    });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ name: 'Vet', parentId: health?.id });
  });

  it('gives the starter set a colour and an icon, children following the parent', async () => {
    const all = await categories(h.alice);
    const food = all.find((c) => c.name === 'Food');
    expect(food).toMatchObject({ colour: 'series-6', icon: 'utensils' });
    const groceries = all.find((c) => c.name === 'Groceries');
    expect(groceries).toMatchObject({ colour: null, icon: 'shopping-basket' });
    expect(all.find((c) => c.name === 'Rent')).toMatchObject({
      colour: null,
      icon: null,
    });
  });

  it('creates, restyles and clears a category colour and icon', async () => {
    const created = await h.alice.post('/v1/categories', {
      name: 'Pets',
      kind: 'expense',
      colour: 'series-4',
      icon: 'paw-print',
    });
    expect(created.status).toBe(201);
    const id = (created.body as Category).id;
    expect(created.body).toMatchObject({
      colour: 'series-4',
      icon: 'paw-print',
    });

    const changed = await h.alice.patch(`/v1/categories/${id}`, {
      colour: 'series-2',
    });
    expect(changed.body).toMatchObject({
      colour: 'series-2',
      icon: 'paw-print',
    });

    const cleared = await h.alice.patch(`/v1/categories/${id}`, {
      colour: null,
      icon: null,
    });
    expect(cleared.body).toMatchObject({ colour: null, icon: null });
  });

  it('refuses a colour or icon outside the fixed sets', async () => {
    const badColour = await h.alice.post('/v1/categories', {
      name: 'Bad colour',
      kind: 'expense',
      colour: '#ff0000',
    });
    expect(badColour.status).toBe(400);
    const badIcon = await h.alice.post('/v1/categories', {
      name: 'Bad icon',
      kind: 'expense',
      icon: 'rocket-launcher',
    });
    expect(badIcon.status).toBe(400);
  });

  it('deletes an unused category', async () => {
    const created = await h.alice.post('/v1/categories', {
      name: 'Temporary',
      kind: 'expense',
    });
    const id = (created.body as Category).id;
    expect((await h.alice.delete(`/v1/categories/${id}`)).status).toBe(204);
    expect((await h.alice.get(`/v1/categories/${id}`)).status).toBe(404);
  });

  it('refuses to delete a category in use and merges it instead', async () => {
    const userId = await userIdOf(h.alice);
    const created = await h.alice.post('/v1/categories', {
      name: 'Snacks',
      kind: 'expense',
    });
    const snacks = (created.body as Category).id;
    const other = (await categories(h.alice)).find((c) => c.name === 'Other');
    const card = await openAccount(h.alice, 'Snack card', {
      openingBalance: { amountMinor: 5000, currency: 'USD' },
    });

    // An entry in the category, written the way #38's endpoint will.
    const chart = await ensureSystemAccounts(
      h.db,
      userId,
      await loadChart(h.db, userId),
      [money(0, 'USD').currency],
      new Date(),
    );
    const entry = expense(
      chart,
      newEntry(new Date(), localDate('2026-03-10')),
      {
        accountId: accountId(card.id),
        amount: money(350, 'USD'),
        categoryId: categoryId(snacks),
      },
    );
    await appendTransaction(h.db, userId, entry, { source: 'api' });

    const refused = await h.alice.delete(`/v1/categories/${snacks}`);
    expect(refused.status).toBe(409);
    expect(code(refused)).toBe('category_in_use');

    const merged = await h.alice.delete(
      `/v1/categories/${snacks}?mergeInto=${other?.id ?? ''}`,
    );
    expect(merged.status).toBe(204);
    expect((await categories(h.alice)).map((c) => c.id)).not.toContain(snacks);
    const kept = (await categories(h.alice, '?includeMerged=true')).find(
      (c) => c.id === snacks,
    );
    expect(kept?.mergedIntoId).toBe(other?.id);

    // The target now resolves the merged category, so it is in use too.
    const target = await h.alice.delete(`/v1/categories/${other?.id ?? ''}`);
    expect(code(target)).toBe('category_in_use');
  });

  it('keeps a parent whose merged subcategory still names entries', async () => {
    const userId = await userIdOf(h.alice);
    const parent = (
      await h.alice.post('/v1/categories', { name: 'Hobbies', kind: 'expense' })
    ).body as Category;
    const child = (
      await h.alice.post('/v1/categories', {
        name: 'Paint',
        parentId: parent.id,
      })
    ).body as Category;
    const other = (await categories(h.alice)).find((c) => c.name === 'Other');
    const card = await openAccount(h.alice, 'Hobby card', {
      openingBalance: { amountMinor: 5000, currency: 'USD' },
    });
    const chart = await loadChart(h.db, userId);
    await appendTransaction(
      h.db,
      userId,
      expense(chart, newEntry(new Date(), localDate('2026-03-11')), {
        accountId: accountId(card.id),
        amount: money(900, 'USD'),
        categoryId: categoryId(child.id),
      }),
      { source: 'api' },
    );
    expect(
      (
        await h.alice.delete(
          `/v1/categories/${child.id}?mergeInto=${other?.id ?? ''}`,
        )
      ).status,
    ).toBe(204);

    // Its only subcategory is merged, so it no longer has children, but
    // deleting it would delete the merged one with it.
    const refused = await h.alice.delete(`/v1/categories/${parent.id}`);
    expect(refused.status).toBe(409);
    expect(code(refused)).toBe('category_in_use');
    const merged = await h.alice.delete(
      `/v1/categories/${parent.id}?mergeInto=${other?.id ?? ''}`,
    );
    expect(merged.status).toBe(204);
    const kept = await categories(h.alice, '?includeMerged=true');
    expect(kept.find((c) => c.id === child.id)?.mergedIntoId).toBe(other?.id);
  });

  it('refuses a merge into another kind or a category with subcategories', async () => {
    const all = await categories(h.alice);
    const food = all.find((c) => c.name === 'Food');
    const fun = all.find((c) => c.name === 'Fun');
    const paycheck = all.find((c) => c.name === 'Paycheck');
    const kind = await h.alice.delete(
      `/v1/categories/${fun?.id ?? ''}?mergeInto=${paycheck?.id ?? ''}`,
    );
    expect(code(kind)).toBe('invalid_merge_target');
    const parent = await h.alice.delete(
      `/v1/categories/${food?.id ?? ''}?mergeInto=${fun?.id ?? ''}`,
    );
    expect(code(parent)).toBe('category_has_children');
  });
});

describe('tags', () => {
  it('creates, lists and renames tags', async () => {
    const created = await h.alice.post('/v1/tags', { name: 'holiday' });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    const duplicate = await h.alice.post('/v1/tags', { name: 'Holiday' });
    expect(code(duplicate)).toBe('tag_name_taken');

    const renamed = await h.alice.patch(`/v1/tags/${id}`, { name: 'trip' });
    expect(renamed.body).toEqual({ id, name: 'trip' });
    const list = await h.alice.get('/v1/tags');
    expect(list.body).toEqual({ tags: [{ id, name: 'trip' }] });
  });
});

describe('isolation between users', () => {
  it('refuses cross-user reads and writes', async () => {
    const account = await openAccount(h.alice, 'Private card', {
      openingBalance: { amountMinor: 7700, currency: 'USD' },
    });
    const bobCard = await openAccount(h.bob, 'Bob card', {
      openingBalance: { amountMinor: 100, currency: 'USD' },
    });
    const aliceFood = (await categories(h.alice)).find(
      (c) => c.name === 'Food',
    );
    const tag = await h.alice.post('/v1/tags', { name: 'private' });
    const tagId = (tag.body as { id: string }).id;

    const attempts = [
      await h.bob.get(`/v1/accounts/${account.id}`),
      await h.bob.patch(`/v1/accounts/${account.id}`, { name: 'Mine now' }),
      await h.bob.patch(`/v1/accounts/${account.id}`, { budgetGroup: 'off' }),
      await h.bob.post(`/v1/accounts/${account.id}/archive`, {
        settle: { method: 'write_off' },
      }),
      await h.bob.post(`/v1/accounts/${bobCard.id}/archive`, {
        settle: { method: 'transfer', toAccountId: account.id },
      }),
      await h.bob.get(`/v1/categories/${aliceFood?.id ?? ''}`),
      await h.bob.patch(`/v1/categories/${aliceFood?.id ?? ''}`, {
        name: 'Mine',
      }),
      await h.bob.delete(`/v1/categories/${aliceFood?.id ?? ''}`),
      await h.bob.patch(`/v1/tags/${tagId}`, { name: 'mine' }),
    ];
    expect(attempts.map((r) => r.status)).toEqual(Array(9).fill(404));

    const parent = await h.bob.post('/v1/categories', {
      name: 'Borrowed',
      parentId: aliceFood?.id,
    });
    expect(code(parent)).toBe('invalid_parent');

    const bobAccounts = await h.bob.get('/v1/accounts?includeArchived=true');
    expect(
      (bobAccounts.body as { accounts: Account[] }).accounts.map((a) => a.id),
    ).toEqual([bobCard.id]);
    expect((await h.bob.get('/v1/tags')).body).toEqual({ tags: [] });

    // Nothing of Alice's changed.
    const after = await h.alice.get(`/v1/accounts/${account.id}`);
    expect(after.body).toEqual(account);
  });

  it('requires a signed-in user', async () => {
    const anonymous = createClient(h.server.url, 'http://allotr.example.test');
    for (const path of ['/v1/accounts', '/v1/categories', '/v1/tags']) {
      expect((await anonymous.get(path)).status).toBe(401);
    }
  });
});
