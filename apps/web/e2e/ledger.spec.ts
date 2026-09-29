import {
  formatMoney,
  money,
  type AccountView,
  type TodayView,
  type TransactionView,
} from '@allotr/shared';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';

// One instance per size: the first hook onboards and seeds synthetic
// entries; every test signs in through the API. The server runs on the
// real clock, so dates and figures come from `/v1/today`.
test.describe.configure({ mode: 'serial' });

const ids = { everyday: '', transport: '', groceries: '', eatingOut: '' };
let today = '';

/** A calendar day `days` before `day`. */
function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

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
  today = ((await (await api.get('/v1/today')).json()) as TodayView).today;
  ids.everyday = await created(api, '/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
    openingBalance: { amountMinor: 250_000, currency: 'USD' },
    openedOn: daysBefore(today, 10),
  });
  const { categories } = (await (await api.get('/v1/categories')).json()) as {
    categories: { id: string; name: string }[];
  };
  const category = (name: string) =>
    categories.find((c) => c.name === name)?.id ?? '';
  ids.transport = category('Transport');
  ids.groceries = category('Groceries');
  ids.eatingOut = category('Eating out');
  const spend = (amountMinor: number, categoryId: string, note: string) =>
    created(api, '/v1/transactions', {
      kind: 'expense',
      accountId: ids.everyday,
      amount: { amountMinor, currency: 'USD' },
      categoryId,
      note,
    });
  await spend(1_200, ids.groceries, 'Market');
  await spend(2_000, ids.eatingOut, 'Noodle bar');
  await spend(750, ids.transport, 'Bus pass');
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

async function everyday(page: Page): Promise<AccountView> {
  const response = await page.request.get(`/v1/accounts/${ids.everyday}`);
  return (await response.json()) as AccountView;
}

async function figures(page: Page): Promise<TodayView> {
  return (await (await page.request.get('/v1/today')).json()) as TodayView;
}

const entries = (page: Page) =>
  page.locator('main').getByRole('listitem').getByRole('link');
const entry = (page: Page, text: string) =>
  entries(page).filter({ hasText: text });

test('filtering by a parent category includes its subcategories', async ({
  page,
}) => {
  await page.goto('/ledger');
  await expect(entry(page, 'Transport')).toHaveCount(1);

  await page.getByLabel('Category').selectOption({ label: 'Food' });
  await expect(page).toHaveURL(/category=/);
  await expect(entry(page, 'Groceries')).toHaveCount(1);
  await expect(entry(page, 'Eating out')).toHaveCount(1);
  await expect(entry(page, 'Transport')).toHaveCount(0);
  await expect(entries(page)).toHaveCount(2);
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(entry(page, 'Transport')).toHaveCount(1);
});

test('searching notes finds the matching entry', async ({ page }) => {
  await page.goto('/ledger');
  await page.getByRole('searchbox', { name: 'Search notes' }).fill('noodle');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/q=noodle/);
  await expect(entries(page)).toHaveCount(1);
  await expect(entry(page, 'Eating out')).toHaveCount(1);
});

test('editing an entry shows its undo and the new entry, and the balance matches', async ({
  page,
}) => {
  const before = await everyday(page);
  await page.goto(`/ledger?account=${ids.everyday}`);
  const balance = page.getByTestId('account-balance');
  await expect(balance).toHaveText(
    `Balance of Everyday: ${formatMoney(before.balance, 'en-US')}`,
  );

  await entry(page, 'Transport').click();
  const dialog = page.getByRole('dialog', { name: 'Transport' });
  await expect(dialog).toContainText('Bus pass');
  await expect(
    dialog.getByRole('table', { name: 'Postings' }).getByRole('row'),
  ).toHaveCount(3);
  await expectAccessible(page);

  await dialog.getByRole('button', { name: 'Edit' }).click();
  const form = page.getByRole('dialog', { name: 'Edit entry' });
  await expect(form.getByLabel('Amount in USD')).toHaveValue('7.50');
  await form.getByLabel('Amount in USD').fill('9.25');
  await form.getByRole('button', { name: 'Save changes' }).click();

  // The dialog now shows the replacement.
  const replacement = page.getByRole('dialog', { name: 'Transport' });
  await expect(replacement).toContainText('-$9.25');
  await expect(replacement.locator('[aria-live="polite"]')).toHaveText(
    'Entry changed. The old one is undone.',
  );
  await replacement.getByRole('button', { name: 'Close' }).click();
  await expect(page).not.toHaveURL(/entry=/);

  await expect(entry(page, 'Undo: Transport')).toContainText('$7.50');
  const transport = entry(page, 'Transport').filter({
    hasNotText: 'Undo:',
  });
  await expect(transport).toHaveCount(2);
  await expect(transport.filter({ hasText: 'Undone' })).toContainText('-$7.50');
  await expect(transport.filter({ hasNotText: 'Undone' })).toContainText(
    '-$9.25',
  );

  const after = await everyday(page);
  expect(after.balance).toEqual(
    money(before.balance.amountMinor - 925 + 750, 'USD'),
  );
  await expect(balance).toHaveText(
    `Balance of Everyday: ${formatMoney(after.balance, 'en-US')}`,
  );
  await expectAccessible(page);
});

test('a back-dated edit updates Today’s figures', async ({ page, baseURL }) => {
  const day = daysBefore(today, 3);
  const seeded = await page.request.post('/v1/transactions', {
    data: {
      kind: 'expense',
      accountId: ids.everyday,
      amount: { amountMinor: 1_000, currency: 'USD' },
      categoryId: ids.groceries,
      note: 'Farm stand',
      occurredOn: day,
    },
    headers: { origin: baseURL ?? '' },
  });
  expect(seeded.ok()).toBe(true);
  const original = (await seeded.json()) as TransactionView;
  const before = await figures(page);

  await page.goto(`/ledger?entry=${original.id}`);
  const dialog = page.getByRole('dialog', { name: 'Groceries' });
  await dialog.getByRole('button', { name: 'Edit' }).click();
  const form = page.getByRole('dialog', { name: 'Edit entry' });
  await expect(form.getByLabel('Date')).toHaveValue(day);
  await form.getByLabel('Amount in USD').fill('25.00');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog', { name: 'Groceries' })).toContainText(
    '-$25.00',
  );

  // The replacement keeps the original's date.
  const list = (await (
    await page.request.get(`/v1/transactions?from=${day}&to=${day}`)
  ).json()) as { transactions: TransactionView[] };
  expect(list.transactions.map((t) => t.kind).sort()).toEqual([
    'expense',
    'expense',
    'reversal',
  ]);

  const after = await figures(page);
  expect(after.available).toEqual(
    money(before.available.amountMinor - 1_500, 'USD'),
  );
  expect(after.leftToday).not.toEqual(before.leftToday);
  await page.goto('/today');
  await expect(page.getByTestId('left-today')).toHaveText(
    formatMoney(after.leftToday, 'en-US'),
  );
});
