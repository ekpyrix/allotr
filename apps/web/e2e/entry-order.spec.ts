import type { TodayView, TransactionListView } from '@allotr/shared';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// Rearranging a day in the ledger and the optional time of day
// (docs/domain.md "Order within a day"), one instance per size. All
// figures are made up.
test.describe.configure({ mode: 'serial' });

const ids = { everyday: '', fun: '', transport: '', groceries: '' };
let today = '';
let day = '';

function daysBefore(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function created(api: APIRequestContext, path: string, data: object) {
  const response = await api.post(path, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { id: string }).id;
}

test.beforeAll(async ({ playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL ?? '';
  const api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
  expect((await api.post('/v1/onboarding', { data: account })).ok()).toBe(true);
  expect(
    (await api.put('/v1/settings/setup', { data: setupSkipped })).ok(),
  ).toBe(true);
  today = ((await (await api.get('/v1/today')).json()) as TodayView).today;
  day = daysBefore(today, 2);
  ids.everyday = await created(api, '/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
    openingBalance: { amountMinor: 100_000, currency: 'USD' },
    openedOn: daysBefore(today, 10),
  });
  const { categories } = (await (await api.get('/v1/categories')).json()) as {
    categories: { id: string; name: string }[];
  };
  const category = (name: string) =>
    categories.find((c) => c.name === name)?.id ?? '';
  ids.fun = category('Fun');
  ids.transport = category('Transport');
  ids.groceries = category('Groceries');
  for (const categoryId of [ids.fun, ids.transport, ids.groceries]) {
    await created(api, '/v1/transactions', {
      kind: 'expense',
      accountId: ids.everyday,
      amount: { amountMinor: 1_000, currency: 'USD' },
      categoryId,
      occurredOn: day,
    });
  }
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

/** The day's categories as the ledger lists them, newest first. */
async function listed(page: Page, on: string): Promise<string[]> {
  const response = await page.request.get(
    `/v1/transactions?from=${on}&to=${on}&limit=50`,
  );
  const { transactions } = (await response.json()) as TransactionListView;
  const names = new Map([
    [ids.fun, 'Fun'],
    [ids.transport, 'Transport'],
    [ids.groceries, 'Groceries'],
  ]);
  return transactions.map((t) => names.get(t.categoryId ?? '') ?? '?');
}

const reorderList = (page: Page) =>
  page.getByRole('list', { name: /^Entries on .*, newest first$/ });

test('rearranges a day with the buttons', async ({ page }) => {
  expect(await listed(page, day)).toEqual(['Groceries', 'Transport', 'Fun']);
  await page.goto(`/transactions?from=${day}&to=${day}`);
  await page.getByRole('button', { name: /^Rearrange / }).click();
  await expect(reorderList(page)).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Move Fun up' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Fun moved' }),
  ).toHaveText('Fun moved to position 2 of 3.');
  await expect
    .poll(() => listed(page, day))
    .toEqual(['Groceries', 'Fun', 'Transport']);
  // Focus stays on the moved row's handle, so the keyboard carries on.
  await expect(
    page.getByRole('button', { name: /^Fun, position 2 of 3/ }),
  ).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect
    .poll(() => listed(page, day))
    .toEqual(['Fun', 'Groceries', 'Transport']);

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(reorderList(page)).toBeHidden();
  await expect(
    page.locator('main').getByRole('listitem').getByRole('link').first(),
  ).toContainText('Fun');
});

test('rearranges a day by dragging', async ({ page, isMobile }) => {
  // Native drag and drop needs a mouse; touch uses the buttons.
  test.skip(isMobile, 'Touch rearranges with the buttons');
  await page.goto(`/transactions?from=${day}&to=${day}`);
  await page.getByRole('button', { name: /^Rearrange / }).click();
  const rows = reorderList(page).getByRole('listitem');
  await rows.filter({ hasText: 'Transport' }).dragTo(rows.first());
  await expect
    .poll(() => listed(page, day))
    .toEqual(['Transport', 'Fun', 'Groceries']);
});

test('records a time of day once entry times are on', async ({ page }) => {
  await page.goto('/settings');
  const select = page.getByLabel('Time of day on entries');
  await select.selectOption('optional');
  await select
    .locator('xpath=ancestor::form')
    .getByRole('button', { name: 'Save' })
    .click();
  await expect
    .poll(async () => {
      const response = await page.request.get('/v1/settings/ledger');
      return ((await response.json()) as { entryTimes: string }).entryTimes;
    })
    .toBe('optional');

  await page.goto('/transactions');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: 'Add an entry' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Amount in USD').fill('4');
  await dialog.getByLabel('Category').selectOption({ label: 'Fun' });
  await dialog.getByLabel('Date', { exact: true }).fill(day);
  await dialog.getByLabel('Time (optional)').fill('07:30');
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  const response = await page.request.get(
    `/v1/transactions?from=${day}&to=${day}&limit=50`,
  );
  const { transactions } = (await response.json()) as TransactionListView;
  expect(transactions.find((t) => t.occurredTime === '07:30')).toBeDefined();
  await page.goto(`/transactions?from=${day}&to=${day}`);
  await expect(
    page.locator('main').getByRole('listitem').filter({ hasText: '07:30' }),
  ).toHaveCount(1);
});
