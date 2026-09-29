import type {
  CategoryView,
  LedgerSettingsView,
  TodayView,
} from '@allotr/shared';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';

// The settings view (FR-W2). One instance per size; the tests build on each
// other. The server runs on the real clock, so figures are compared with
// the API, never hardcoded.
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL ?? '';
  const api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
  expect((await api.post('/v1/onboarding', { data: account })).ok()).toBe(true);
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

async function today(page: Page): Promise<TodayView> {
  return (await (await page.request.get('/v1/today')).json()) as TodayView;
}

async function ledgerSettings(page: Page): Promise<LedgerSettingsView> {
  return (await (
    await page.request.get('/v1/settings/ledger')
  ).json()) as LedgerSettingsView;
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const section = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true });

test('changing the payday override updates Today’s days left', async ({
  page,
}) => {
  await page.goto('/settings#payday');
  await expect(page.getByRole('heading', { name: 'Payday' })).toBeFocused();
  await expectAccessible(page);

  const before = await today(page);
  const offset = before.daysLeft === 9 ? 12 : 9;
  const payday = addDays(before.today, offset);
  const region = section(page, 'Payday');
  await region.getByLabel('This cycle’s payday').fill(payday);
  await region.getByRole('button', { name: 'Save' }).click();
  await expect(region.getByText('Saved.')).toBeVisible();

  expect((await ledgerSettings(page)).paydayOverride).toBe(payday);
  const after = await today(page);
  expect(after.cycle.payday).toBe(payday);
  expect(after.daysLeft).not.toBe(before.daysLeft);
  await expect(
    region.getByText(`${String(after.daysLeft)} days left in this cycle`, {
      exact: false,
    }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Today' }).first().click();
  await expect(page.getByRole('definition').nth(2)).toHaveText(
    String(after.daysLeft),
  );

  await page.goto('/settings#payday');
  await region
    .getByRole('button', { name: 'Clear this cycle’s payday' })
    .click();
  await expect(
    region.getByText('Payday follows the monthly day again.'),
  ).toBeVisible();
  await expect(region.getByLabel('This cycle’s payday')).toHaveValue('');
  expect((await ledgerSettings(page)).paydayOverride).toBeNull();
});

test('the locale shows a sample and is saved in canonical form', async ({
  page,
}) => {
  await page.goto('/settings');
  const ledger = section(page, 'Ledger');
  const locale = ledger.getByLabel('Language and region');
  await locale.fill('de-de');
  await expect(
    ledger.getByText('Amounts look like', { exact: false }),
  ).toContainText('123.456,78');
  await ledger.getByRole('button', { name: 'Save' }).first().click();
  await expect(ledger.getByText('Saved.')).toBeVisible();
  await expect(locale).toHaveValue('de-DE');
  expect((await ledgerSettings(page)).locale).toBe('de-DE');

  await locale.fill('en-US');
  await ledger.getByRole('button', { name: 'Save' }).first().click();
  await expect(ledger.getByText('Saved.')).toBeVisible();
  await expectAccessible(page);
});

function post(
  page: Page,
  baseURL: string | undefined,
  path: string,
  data: object,
) {
  return page.request.post(path, { data, headers: { origin: baseURL ?? '' } });
}

async function categories(page: Page): Promise<CategoryView[]> {
  const response = await page.request.get('/v1/categories?includeMerged=true');
  return ((await response.json()) as { categories: CategoryView[] }).categories;
}

test('deleting a category in use requires a merge target', async ({
  page,
  baseURL,
}) => {
  const created = await post(page, baseURL, '/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
  });
  expect(created.ok()).toBe(true);
  const { id: accountId } = (await created.json()) as { id: string };
  const target = await post(page, baseURL, '/v1/categories', {
    name: 'Treats',
    kind: 'expense',
  });
  expect(target.ok()).toBe(true);
  const { id: treatsId } = (await target.json()) as { id: string };

  await page.goto('/settings#categories');
  const region = section(page, 'Categories');
  await expect(
    page.getByRole('heading', { name: 'Categories', exact: true }),
  ).toBeFocused();
  await region.getByRole('button', { name: 'New category' }).click();
  const add = page.getByRole('dialog', { name: 'New category' });
  await add.getByLabel('Name').fill('Snacks');
  await expect(add.getByLabel('Expense')).toBeChecked();
  await expectAccessible(page);
  await add.getByRole('button', { name: 'Add category' }).click();
  await expect(add).toBeHidden();
  await expect(region.getByRole('listitem', { name: 'Snacks' })).toBeVisible();

  const snacks = (await categories(page)).find((c) => c.name === 'Snacks');
  expect(snacks).toBeDefined();
  const spent = await post(page, baseURL, '/v1/transactions', {
    kind: 'expense',
    accountId,
    amount: { amountMinor: 450, currency: 'USD' },
    categoryId: snacks?.id,
  });
  expect(spent.ok()).toBe(true);

  await region.getByRole('button', { name: 'Delete Snacks' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete Snacks?' });
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(
    dialog.getByText('Entries use Snacks. Choose where they go.'),
  ).toBeVisible();
  const mergeInto = dialog.getByLabel('Merge into');
  await expect(mergeInto).toBeFocused();
  await dialog.getByRole('button', { name: 'Merge and delete' }).click();
  await expect(
    dialog.getByText('Choose a category to merge into.'),
  ).toBeVisible();
  await expectAccessible(page);
  await mergeInto.selectOption({ label: 'Treats' });
  await dialog.getByRole('button', { name: 'Merge and delete' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Snacks merged into Treats.')).toBeAttached();
  await expect(region.getByRole('listitem', { name: 'Snacks' })).toHaveCount(0);
  expect(
    (await categories(page)).find((c) => c.id === snacks?.id)?.mergedIntoId,
  ).toBe(treatsId);
});

test('a category nobody uses is deleted at once, and tags can be renamed', async ({
  page,
  baseURL,
}) => {
  const unused = await post(page, baseURL, '/v1/categories', {
    name: 'Unused',
    kind: 'expense',
  });
  expect(unused.ok()).toBe(true);
  await page.goto('/settings#tags');
  const tags = section(page, 'Tags');
  await tags.getByLabel('New tag').fill('trip');
  await tags.getByRole('button', { name: 'Add tag' }).click();
  await expect(tags.getByRole('listitem', { name: 'trip' })).toBeVisible();
  await tags.getByRole('button', { name: 'Rename trip' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename trip' });
  await rename.getByLabel('Name').fill('holiday');
  await rename.getByRole('button', { name: 'Save' }).click();
  await expect(rename).toBeHidden();
  await expect(tags.getByRole('listitem', { name: 'holiday' })).toBeVisible();
  await expect(
    tags.getByRole('button', { name: 'Rename holiday' }),
  ).toBeFocused();

  const region = section(page, 'Categories');
  await region.getByRole('button', { name: 'Delete Unused' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete Unused?' });
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Unused deleted.')).toBeAttached();
  await expect(
    page.getByRole('heading', { name: 'Categories', exact: true }),
  ).toBeFocused();
  await expectAccessible(page);
});

test('a bill due this cycle is set aside until it is marked paid', async ({
  page,
}) => {
  const before = await today(page);
  const dueDay = Number(before.today.slice(8));
  await page.goto('/settings#bills');
  await expect(
    page.getByRole('heading', { name: 'Bills', exact: true }),
  ).toBeFocused();
  const region = section(page, 'Bills');
  await region.getByRole('button', { name: 'New bill' }).click();
  const dialog = page.getByRole('dialog', { name: 'New bill' });
  await dialog.getByLabel('Name').fill('Phone');
  await expect(dialog.getByLabel('Paid from')).toHaveValue(/.+/);
  await dialog.getByLabel('Amount in USD').fill('0');
  await dialog.getByRole('button', { name: 'Add bill' }).click();
  await expect(
    dialog.getByText('Enter an amount greater than zero.'),
  ).toBeVisible();
  await expect(dialog.getByLabel('Amount in USD')).toBeFocused();
  await dialog.getByLabel('Amount in USD').fill('35');
  await dialog.getByLabel('Due each month on day').selectOption(String(dueDay));
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Add bill' }).click();
  await expect(dialog).toBeHidden();

  const bill = region.getByRole('listitem', { name: 'Phone' });
  await expect(bill).toContainText('$35.00');
  await expect(bill).toContainText('set aside');
  const reserved = await today(page);
  expect(reserved.cycleBills).toHaveLength(1);
  expect(reserved.cycleBills[0]?.paidOn).toBeNull();

  await bill.getByRole('button', { name: /^Mark paid/ }).click();
  await expect(bill).toContainText('paid');
  await expect(bill.getByRole('button', { name: /^Undo paid/ })).toBeVisible();
  const paid = await today(page);
  expect(paid.cycleBills[0]?.paidOn).toBe(paid.today);
  expect(paid.available.amountMinor - reserved.available.amountMinor).toBe(
    3_500,
  );
  await expectAccessible(page);

  await bill.getByRole('button', { name: /^Undo paid/ }).click();
  await expect(bill.getByRole('button', { name: /^Mark paid/ })).toBeVisible();
  expect((await today(page)).cycleBills[0]?.paidOn).toBeNull();

  await bill.getByRole('button', { name: 'Edit Phone' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Phone' });
  await edit.getByLabel('Active').uncheck();
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect(bill).toContainText('Inactive');
  expect((await today(page)).cycleBills).toEqual([]);

  await bill.getByRole('button', { name: 'Delete Phone' }).click();
  await page
    .getByRole('dialog', { name: 'Delete Phone?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(region.getByRole('listitem', { name: 'Phone' })).toHaveCount(0);
});

test('a manual rate brings a foreign account into the figures', async ({
  page,
  baseURL,
}) => {
  const created = await post(page, baseURL, '/v1/accounts', {
    name: 'Travel',
    currency: 'EUR',
    openingBalance: { amountMinor: 10_000, currency: 'EUR' },
  });
  expect(created.ok()).toBe(true);
  expect((await today(page)).missingRates).toEqual(['EUR']);

  await page.goto('/settings#rates');
  const region = section(page, 'Exchange rates');
  await expect(
    page.getByRole('heading', { name: 'Exchange rates' }),
  ).toBeFocused();
  await expect(region).toContainText('No rate yet for EUR');
  await expect(region.getByLabel('From currency')).toHaveValue('EUR');
  await expect(region.getByLabel('To currency')).toHaveValue('USD');
  await region.getByLabel('USD for 1 EUR').fill('abc');
  await region.getByRole('button', { name: 'Save rate' }).click();
  await expect(
    region.getByText('Enter a rate greater than zero', { exact: false }),
  ).toBeVisible();
  await region.getByLabel('USD for 1 EUR').fill('1.1');
  await region.getByRole('button', { name: 'Save rate' }).click();
  const list = region.getByRole('list', { name: 'Rates, newest first' });
  await expect(list.getByRole('listitem')).toHaveText([/1 EUR = 1.1 USD/]);
  await expect(region).not.toContainText('No rate yet for EUR');
  expect((await today(page)).missingRates).toEqual([]);
  await expectAccessible(page);

  await list.getByRole('button', { name: /^Delete 1 EUR = 1.1 USD/ }).click();
  await expect(list).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Exchange rates' }),
  ).toBeFocused();
  expect((await today(page)).missingRates).toEqual(['EUR']);
});
