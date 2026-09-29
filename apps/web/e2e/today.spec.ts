import { formatMoney, money, type TodayView } from '@allotr/shared';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';

// One instance per size: the first hook onboards and seeds synthetic
// accounts; every test signs in through the API. The server runs on the
// real clock, so figures are compared with `/v1/today`, never hardcoded.
test.describe.configure({ mode: 'serial' });

const ids = { everyday: '', groceries: '', paycheck: '' };

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
    openingBalance: { amountMinor: 250_000, currency: 'USD' },
  });
  await created(api, '/v1/accounts', {
    name: 'Savings',
    currency: 'USD',
    budgetGroup: 'off',
    openingBalance: { amountMinor: 900_000, currency: 'USD' },
  });
  const { categories } = (await (await api.get('/v1/categories')).json()) as {
    categories: { id: string; name: string }[];
  };
  const category = (name: string) =>
    categories.find((c) => c.name === name)?.id ?? '';
  ids.groceries = category('Groceries');
  ids.paycheck = category('Paycheck');
  const spend = await api.post('/v1/transactions', {
    data: {
      kind: 'expense',
      accountId: ids.everyday,
      amount: { amountMinor: 1_875, currency: 'USD' },
      categoryId: ids.groceries,
      note: 'Market',
    },
  });
  expect(spend.ok()).toBe(true);
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

/** A write through the API as the signed-in user. */
function post(
  page: Page,
  baseURL: string | undefined,
  path: string,
  data: object,
) {
  return page.request.post(path, { data, headers: { origin: baseURL ?? '' } });
}

async function today(page: Page): Promise<TodayView> {
  return (await (await page.request.get('/v1/today')).json()) as TodayView;
}

const hero = (page: Page) => page.getByTestId('left-today');
const entries = (page: Page) =>
  page.getByRole('region', { name: 'Today’s entries' });

test('the hero number and figures match /v1/today', async ({ page }) => {
  await page.goto('/today');
  const figures = await today(page);
  await expect(hero(page)).toHaveText(formatMoney(figures.leftToday, 'en-US'));
  await expect(
    page.getByText(
      `${formatMoney(figures.liveDaily, 'en-US')}/day for ${String(figures.daysLeft)} day`,
    ),
  ).toBeVisible();
  const list = page.getByRole('definition');
  await expect(list.nth(0)).toHaveText(
    formatMoney(figures.todayAllowance, 'en-US'),
  );
  await expect(list.nth(1)).toHaveText(
    formatMoney(figures.spentToday, 'en-US'),
  );
  await expect(list.nth(2)).toHaveText(String(figures.daysLeft));

  const meter = page.getByRole('meter', { name: 'This cycle' });
  await expect(meter).toBeVisible();
  await expect(page.getByText('Spent $18.75 of')).toBeVisible();

  // The opening balances are dated today too.
  const groceries = entries(page)
    .getByRole('listitem')
    .filter({ hasText: 'Groceries' });
  await expect(groceries).toContainText('Everyday · Market');
  await expect(groceries).toContainText('-$18.75');
  await expect(
    entries(page).getByRole('listitem').filter({ hasText: 'Opening balance' }),
  ).toHaveCount(2);
  await expect(
    page.getByRole('region', { name: 'Needs attention' }),
  ).toHaveCount(0);
  await expectAccessible(page);
});

test('logging an expense lowers left today and undo restores it', async ({
  page,
}) => {
  await page.goto('/today');
  const before = await today(page);
  await expect(hero(page)).toHaveText(formatMoney(before.leftToday, 'en-US'));

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Amount in USD').fill('42.10');
  await page.getByLabel('Category').selectOption({ label: 'Transport' });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Expense of $42.10 saved.');

  const lowered = money(before.leftToday.amountMinor - 4_210, 'USD');
  await expect(hero(page)).toHaveText(formatMoney(lowered, 'en-US'));
  expect((await today(page)).leftToday).toEqual(lowered);

  const undo = entries(page).getByRole('button', {
    name: 'Undo Transport, -$42.10',
  });
  await undo.click();
  await expect(hero(page)).toHaveText(formatMoney(before.leftToday, 'en-US'));
  expect((await today(page)).leftToday).toEqual(before.leftToday);
  const row = entries(page).getByRole('listitem').filter({
    hasText: 'Transport',
  });
  await expect(row).toContainText('Undone');
  await expect(row.getByRole('button')).toHaveCount(0);
  await expect(
    entries(page).getByRole('heading', { name: 'Today’s entries' }),
  ).toBeFocused();
  await expect(entries(page).locator('[aria-live="polite"]')).toHaveText(
    'Undone: Transport, -$42.10.',
  );
  await expectAccessible(page);
});

test('a missing rate shows a needs-attention item that links to rates', async ({
  page,
  baseURL,
}) => {
  const response = await post(page, baseURL, '/v1/accounts', {
    name: 'Travel',
    currency: 'EUR',
    openingBalance: { amountMinor: 30_000, currency: 'EUR' },
  });
  expect(response.ok()).toBe(true);
  expect((await today(page)).missingRates).toEqual(['EUR']);

  await page.goto('/today');
  const attention = page.getByRole('region', { name: 'Needs attention' });
  await expect(attention).toContainText(
    'There is no exchange rate for EUR, so EUR accounts are left out of these figures.',
  );
  await expectAccessible(page);
  await attention.getByRole('link', { name: 'Add a EUR rate' }).click();
  await expect(page).toHaveURL(/\/settings#rates$/);
  const heading = page.getByRole('heading', { name: 'Exchange rates' });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
});

test('a bill due today and not paid needs attention', async ({
  page,
  baseURL,
}) => {
  const { today: day } = await today(page);
  const response = await post(page, baseURL, '/v1/bills', {
    name: 'Phone',
    amount: { amountMinor: 3_500, currency: 'USD' },
    accountId: ids.everyday,
    dueDay: Number(day.slice(8)),
  });
  expect(response.ok()).toBe(true);

  await page.goto('/today');
  const attention = page.getByRole('region', { name: 'Needs attention' });
  await expect(attention).toContainText(
    'Phone, $35.00, is due today and is not marked paid.',
  );
  await expect(
    attention.getByRole('link', { name: 'Review Phone' }),
  ).toHaveAttribute('href', '/settings#bills');
  await expectAccessible(page);
});

test('undoing the paycheck that opened the cycle asks first', async ({
  page,
  baseURL,
}) => {
  const response = await post(page, baseURL, '/v1/transactions', {
    kind: 'income',
    accountId: ids.everyday,
    amount: { amountMinor: 320_000, currency: 'USD' },
    categoryId: ids.paycheck,
  });
  expect(response.ok()).toBe(true);
  const { id } = (await response.json()) as { id: string };
  expect((await today(page)).cycle.openedBy).toBe(id);

  await page.goto('/today');
  const undo = entries(page).getByRole('button', {
    name: 'Undo Paycheck, +$3,200.00',
  });
  await undo.click();
  await expect(
    entries(page).getByText('This paycheck opened the current cycle.', {
      exact: false,
    }),
  ).toBeVisible();
  const confirm = entries(page).getByRole('button', {
    name: 'Undo paycheck',
    exact: true,
  });
  await expect(confirm).toBeFocused();
  await expectAccessible(page);

  await entries(page).getByRole('button', { name: 'Keep it' }).click();
  await expect(undo).toBeFocused();
  await expect(confirm).toHaveCount(0);

  await undo.click();
  await confirm.click();
  await expect(
    entries(page).getByRole('listitem').filter({ hasText: 'Paycheck' }),
  ).toContainText('Undone');
  expect((await today(page)).cycle.openedBy).toBeNull();
});
