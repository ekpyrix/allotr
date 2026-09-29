import type { TransactionView } from '@allotr/shared';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';

// Split entries (FR-L5), one instance per size: the first hook onboards
// and opens a synthetic account; every test signs in through the API.
test.describe.configure({ mode: 'serial' });

const ids = {
  everyday: '',
  groceries: '',
  eatingOut: '',
  transport: '',
  fun: '',
};

async function created(api: APIRequestContext, path: string, data: object) {
  const response = await api.post(path, { data });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { id: string }).id;
}

test.beforeAll(async ({ playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL ?? '';
  const api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
  expect((await api.post('/v1/onboarding', { data: account })).ok()).toBe(true);
  ids.everyday = await created(api, '/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
    openingBalance: { amountMinor: 100_000, currency: 'USD' },
  });
  const { categories } = (await (await api.get('/v1/categories')).json()) as {
    categories: { id: string; name: string }[];
  };
  const category = (name: string) =>
    categories.find((c) => c.name === name)?.id ?? '';
  ids.groceries = category('Groceries');
  ids.eatingOut = category('Eating out');
  ids.transport = category('Transport');
  ids.fun = category('Fun');
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

async function latest(page: Page): Promise<TransactionView> {
  const response = await page.request.get('/v1/transactions?limit=1');
  const { transactions } = (await response.json()) as {
    transactions: TransactionView[];
  };
  const [entry] = transactions;
  if (entry === undefined) throw new Error('no entries');
  return entry;
}

/** Category and amount of each line, from the balancing postings. */
const lines = (entry: TransactionView) =>
  entry.postings
    .filter((p) => p.systemRole === 'expenses')
    .map((p) => [p.categoryId, p.amount.amountMinor]);

const title = 'Split: Groceries, Eating out';

test('splits one expense across two categories', async ({ page }) => {
  await page.goto('/ledger');
  await page.getByRole('button', { name: 'Add' }).click();
  const form = page.getByRole('dialog', { name: 'Add an entry' });
  await form.getByLabel('Amount in USD').fill('80');
  await form.getByRole('button', { name: 'Split across categories' }).click();

  await form
    .getByLabel('Category 1')
    .selectOption({ label: 'Food / Groceries' });
  await form.getByLabel('Amount 1 in USD').fill('60');
  await form
    .getByLabel('Category 2')
    .selectOption({ label: 'Food / Eating out' });
  await form.getByLabel('Amount 2 in USD').fill('19');
  await expect(form).toContainText('$1.00 left to assign');
  await expectAccessible(page);

  // A sum that misses the amount is refused on the spot.
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toContainText('Make the lines add up to the amount.');
  await expect(form.locator('[data-split-status]')).toBeFocused();
  await expectAccessible(page);

  await form.getByLabel('Amount 2 in USD').fill('20');
  await expect(form).toContainText('All of the amount is assigned');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toBeHidden();

  const entry = await latest(page);
  expect(entry.categoryId).toBeNull();
  expect(lines(entry)).toEqual([
    [ids.groceries, 6000],
    [ids.eatingOut, 2000],
  ]);
  const row = page
    .locator('main')
    .getByRole('link', { name: new RegExp(title) });
  await expect(row).toContainText('-$80.00');

  // Filtering by either line's category finds it.
  await page
    .getByLabel('Category', { exact: true })
    .selectOption({ label: 'Food / Eating out' });
  await expect(page).toHaveURL(/category=/);
  await expect(row).toHaveCount(1);
});

test('edits one line of a split', async ({ page }) => {
  await page.goto('/ledger');
  await page
    .locator('main')
    .getByRole('link', { name: new RegExp(title) })
    .click();
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toContainText('Food / Groceries, Food / Eating out');
  await expectAccessible(page);

  await dialog.getByRole('button', { name: 'Edit' }).click();
  const form = page.getByRole('dialog', { name: 'Edit entry' });
  await expect(form.getByLabel('Amount 1 in USD')).toHaveValue('60.00');
  await expect(form.getByLabel('Amount 2 in USD')).toHaveValue('20.00');
  await form.getByLabel('Amount 1 in USD').fill('55');
  await form.getByLabel('Amount in USD').fill('75');
  await expect(form).toContainText('All of the amount is assigned');
  await expectAccessible(page);
  await form.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('dialog', { name: title })).toContainText(
    '-$75.00',
  );
  // The undo and the replacement share a timestamp; take the live one.
  const response = await page.request.get('/v1/transactions');
  const { transactions } = (await response.json()) as {
    transactions: TransactionView[];
  };
  const replacement = transactions.find(
    (t) => t.kind === 'expense' && t.reversedById === null,
  );
  if (replacement === undefined) throw new Error('no replacement');
  expect(lines(replacement)).toEqual([
    [ids.groceries, 5500],
    [ids.eatingOut, 2000],
  ]);
});

test('splits from the keyboard only, keeping focus as lines come and go', async ({
  page,
}) => {
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('n');
  const form = page.getByRole('dialog', { name: 'Add an entry' });
  await expect(form.getByLabel('Amount in USD')).toBeFocused();
  await page.keyboard.type('30');
  await page.keyboard.press('Tab'); // account
  await page.keyboard.press('Tab'); // category
  await page.keyboard.type('Transport');
  await page.keyboard.press('Tab');
  await expect(
    form.getByRole('button', { name: 'Split across categories' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');

  // The chosen category is the first line's, so its amount is next.
  await expect(form.getByLabel('Amount 1 in USD')).toBeFocused();
  await page.keyboard.type('10');
  await page.keyboard.press('Tab');
  await expect(form.getByLabel('Category 2')).toBeFocused();
  await page.keyboard.type('Fun');
  await page.keyboard.press('Tab');
  await page.keyboard.type('20');
  await page.keyboard.press('Tab');
  await expect(form.getByRole('button', { name: 'Add a line' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(form.getByLabel('Category 3')).toBeFocused();
  await page.keyboard.press('Tab'); // amount 3
  await page.keyboard.press('Tab');
  await expect(
    form.getByRole('button', { name: 'Remove line 3' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(form.getByLabel('Category 2')).toBeFocused();
  await expectAccessible(page);

  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Expense of $30.00 saved.');
  expect(lines(await latest(page))).toEqual([
    [ids.transport, 1000],
    [ids.fun, 2000],
  ]);
});

test('going back to one category keeps the first line’s', async ({ page }) => {
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('n');
  const form = page.getByRole('dialog', { name: 'Add an entry' });
  await form.getByLabel('Category', { exact: true }).selectOption({
    label: 'Fun',
  });
  await form.getByRole('button', { name: 'Split across categories' }).click();
  await form.getByRole('button', { name: 'Use one category' }).focus();
  await page.keyboard.press('Enter');
  const category = form.getByLabel('Category', { exact: true });
  await expect(category).toBeFocused();
  await expect(category.locator('option:checked')).toHaveText('Fun');
});
