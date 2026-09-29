import type { TodayView, TransactionView } from '@allotr/shared';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';

// One instance per size: the first hook onboards and seeds synthetic
// accounts; every test signs in through the API.
test.describe.configure({ mode: 'serial' });

const ids = { everyday: '', card: '', savings: '', work: '' };

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
  const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
  ids.everyday = await created(api, '/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
    openingBalance: usd(100_000),
  });
  ids.card = await created(api, '/v1/accounts', {
    name: 'Card',
    currency: 'USD',
  });
  ids.savings = await created(api, '/v1/accounts', {
    name: 'Savings',
    currency: 'USD',
    budgetGroup: 'off',
  });
  ids.work = await created(api, '/v1/tags', { name: 'Work' });
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

async function today(page: Page): Promise<TodayView> {
  return (await (await page.request.get('/v1/today')).json()) as TodayView;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const dialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Add an entry' });

/** The chosen option of a native select, by its exact label. */
const selected = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).locator('option:checked');

test('logs an expense, an income and a transfer from the keyboard only', async ({
  page,
}) => {
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const start = await today(page);

  // Expense: n, amount, then Enter from the category select.
  await page.keyboard.press('n');
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByLabel('Amount in USD')).toBeFocused();
  await expectAccessible(page);
  await page.keyboard.type('12.50');
  await page.keyboard.press('Tab'); // account
  await page.keyboard.type('Ev');
  await expect(selected(page, 'Account')).toHaveText('Everyday');
  await page.keyboard.press('Tab'); // category
  await expect(page.getByLabel('Category')).toBeFocused();
  await page.keyboard.type('Fun');
  await expect(selected(page, 'Category')).toHaveText('Fun');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Expense of $12.50 saved.');
  await expect(dialog(page)).toBeHidden();
  const expense = await latest(page);
  expect(expense.kind).toBe('expense');
  expect(expense.postings).toContainEqual(
    expect.objectContaining({
      accountId: ids.everyday,
      amount: { amountMinor: -1250, currency: 'USD' },
    }),
  );
  const afterExpense = await today(page);
  expect(
    afterExpense.spentToday.amountMinor - start.spentToday.amountMinor,
  ).toBe(1250);

  // Income: back to the type radios, arrow to Income.
  await page.keyboard.press('n');
  await expect(page.getByLabel('Amount in USD')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Income' })).toBeChecked();
  await page.keyboard.press('Tab');
  await page.keyboard.type('200');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Other i');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Income of $200.00 saved.');
  expect((await latest(page)).kind).toBe('income');
  const afterIncome = await today(page);
  expect(
    afterIncome.available.amountMinor - afterExpense.available.amountMinor,
  ).toBe(20_000);

  // Transfer to the off-budget account with a tag, Enter from the tag.
  await page.keyboard.press('n');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Transfer' })).toBeChecked();
  await page.keyboard.press('Tab');
  await page.keyboard.type('300');
  await page.keyboard.press('Tab'); // from
  await page.keyboard.type('Ev');
  await expect(selected(page, 'From')).toHaveText('Everyday');
  await page.keyboard.press('Tab'); // to
  await page.keyboard.type('Sav');
  await expect(selected(page, 'To')).toHaveText('Savings');
  const tag = page.getByRole('checkbox', { name: 'Work' });
  // Category, the date's segments and the note sit in between.
  for (let presses = 0; presses < 15; presses += 1) {
    if (await tag.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(tag).toBeFocused();
  await page.keyboard.press('Space');
  await expect(tag).toBeChecked();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText(
    'Transfer of $300.00 saved.',
  );
  const transfer = await latest(page);
  expect(transfer.kind).toBe('transfer');
  expect(transfer.tagIds).toEqual([ids.work]);
  const afterTransfer = await today(page);
  expect(
    afterIncome.available.amountMinor - afterTransfer.available.amountMinor,
  ).toBe(30_000);
});

test('a double click on Save records one entry', async ({ page }) => {
  await page.goto('/ledger');
  const posts: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().endsWith('/v1/transactions')
    )
      posts.push(request.headers()['idempotency-key'] ?? '');
  });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Amount in USD').fill('7.77');
  await page.getByLabel('Category').selectOption({ label: 'Transport' });
  await page.getByRole('button', { name: 'Save' }).dblclick();
  await expect(page.getByRole('status')).toHaveText('Expense of $7.77 saved.');

  const response = await page.request.get('/v1/transactions?limit=200');
  const { transactions } = (await response.json()) as {
    transactions: TransactionView[];
  };
  const matching = transactions.filter((entry) =>
    entry.postings.some((p) => p.amount.amountMinor === -777),
  );
  expect(matching).toHaveLength(1);
  // A header-less request would pass the single-key check on its own.
  expect(posts.length).toBeGreaterThan(0);
  for (const key of posts) expect(key).toMatch(UUID);
  expect(new Set(posts).size).toBe(1);
});

test('failed validation is announced, focused and described', async ({
  page,
}) => {
  await page.goto('/ledger');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('n');
  const amount = page.getByLabel('Amount in USD');
  await expect(amount).toBeFocused();

  // Enter on an empty amount: the field already has focus, so the alert
  // and the error text linked to the field are all that announce it.
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('alert')).toHaveText(
    '2 fields need attention.',
  );
  await expect(amount).toBeFocused();
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await amount.getAttribute('aria-describedby');
  expect(describedBy).not.toBeNull();
  await expect(page.locator(`[id="${describedBy ?? ''}"]`)).toHaveText(
    'Enter an amount.',
  );

  // An unreadable amount names an example in the account's currency.
  await amount.fill('abc');
  await page.keyboard.press('Enter');
  await expect(page.locator(`[id="${describedBy ?? ''}"]`)).toHaveText(
    'Enter an amount, for example $12.50.',
  );

  // Focus moves to the first invalid field once its error is rendered.
  await amount.fill('5');
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('alert')).toHaveText(
    '1 field needs attention.',
  );
  const category = page.getByLabel('Category');
  await expect(category).toBeFocused();
  await expect(category).toHaveAttribute('aria-invalid', 'true');
  await expectAccessible(page);
});

test('the date follows a corrected today until the user edits it', async ({
  page,
}) => {
  const real = (await today(page)).today;
  let reads = 0;
  await page.route('**/v1/today', async (route) => {
    reads += 1;
    const response = await route.fetch();
    const body = (await response.json()) as TodayView;
    if (reads === 1)
      return route.fulfill({
        response,
        json: { ...body, today: '2026-01-01' },
      });
    // The correction arrives after the form has shown the cached day.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return route.fulfill({ response, json: body });
  });
  await page.clock.install();
  await page.goto('/ledger');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('n');
  const date = page.getByLabel('Date');
  await expect(date).toHaveValue('2026-01-01');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();

  // Past the 30 s freshness window, so opening refetches behind the form.
  await page.clock.fastForward(60_000);
  await page.keyboard.press('n');
  await expect(date).toHaveValue('2026-01-01');
  await expect(date).toHaveValue(real);
  await date.fill('2026-02-03');
  await expect(date).toHaveValue('2026-02-03');
});

test('a server error clears when the user edits the form', async ({ page }) => {
  await page.route('**/v1/transactions', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 409,
          contentType: 'application/problem+json',
          json: { type: 'about:blank', title: 'Conflict', status: 409 },
        })
      : route.fallback(),
  );
  await page.goto('/ledger');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Amount in USD').fill('3.21');
  await page.getByLabel('Category').selectOption({ label: 'Transport' });
  await page.getByRole('button', { name: 'Save' }).click();
  const alert = dialog(page).getByRole('alert');
  await expect(alert).toHaveText(
    'This changed in the meantime. Refresh and try again.',
  );
  await page.getByLabel('Amount in USD').fill('3.22');
  await expect(alert).toBeEmpty();
});

test('Go to Accounts leaves focus on the new view', async ({ page }) => {
  await page.route('**/v1/accounts', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { accounts: [] } })
      : route.fallback(),
  );
  await page.goto('/ledger');
  const add = page.getByRole('button', { name: 'Add', exact: true });
  await add.click();
  await page.getByRole('link', { name: 'Go to Accounts' }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator('main')).toBeFocused();
  await expect(add).not.toBeFocused();
});

test('a save in flight cannot be dismissed and still announces', async ({
  page,
}) => {
  await page.route('**/v1/transactions', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await new Promise((resolve) => setTimeout(resolve, 800));
    return route.continue();
  });
  await page.goto('/ledger');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Amount in USD').fill('8.88');
  await page.getByLabel('Category').selectOption({ label: 'Transport' });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Expense of $8.88 saved.');
  await expect(dialog(page)).toBeHidden();
});

test('Escape closes, focus returns, and the shortcut can be switched off', async ({
  page,
}) => {
  await page.goto('/settings');
  const add = page.getByRole('button', { name: 'Add', exact: true });
  await expect(add).toHaveAttribute('aria-keyshortcuts', 'n');
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(add).toBeFocused();

  await page.getByLabel('Single-key shortcuts').uncheck();
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('n');
  await expect(dialog(page)).toBeHidden();
  await expect(add).not.toHaveAttribute('aria-keyshortcuts', 'n');
  await page.reload();
  await expect(page.getByLabel('Single-key shortcuts')).not.toBeChecked();
  await page.getByLabel('Single-key shortcuts').check();
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('n');
  await expect(dialog(page)).toBeVisible();
  await expectAccessible(page);
});
