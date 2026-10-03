import type { PaydayPlanView } from '@allotr/shared';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The payday sheet, weekly review, fund and net worth cards, the plan tab
// of Reports and the plan settings, one instance per size.
test.describe.configure({ mode: 'serial' });

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
const ids = { everyday: '', savings: '', groceries: '' };

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
  ids.everyday = await created(api, '/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
    openingBalance: usd(100_000),
  });
  ids.savings = await created(api, '/v1/accounts', {
    name: 'Rainy day',
    currency: 'USD',
    budgetGroup: 'off',
  });
  const { categories } = (await (await api.get('/v1/categories')).json()) as {
    categories: { id: string; name: string }[];
  };
  const category = (name: string) =>
    categories.find((c) => c.name === name)?.id ?? '';
  ids.groceries = category('Groceries');
  await created(api, '/v1/transactions', {
    kind: 'income',
    accountId: ids.everyday,
    amount: usd(300_000),
    categoryId: category('Paycheck'),
  });
  await created(api, '/v1/transactions', {
    kind: 'expense',
    accountId: ids.everyday,
    amount: usd(4_000),
    categoryId: ids.groceries,
  });
  await created(api, '/v1/budgets', {
    name: 'Groceries',
    target: { kind: 'category', categoryId: ids.groceries },
    amount: usd(20_000),
  });
  const set = await api.patch('/v1/settings/ledger', {
    data: { payYourselfFirst: { kind: 'percent', basisPoints: 1000 } },
  });
  expect(set.ok(), await set.text()).toBe(true);
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

async function plan(page: Page): Promise<PaydayPlanView> {
  return (await (
    await page.request.get('/v1/payday-plan')
  ).json()) as PaydayPlanView;
}

test('the payday sheet puts savings first and confirms in one tap', async ({
  page,
}) => {
  await page.goto('/budget');
  await page.getByRole('button', { name: 'Plan this payday' }).click();
  const sheet = page.getByRole('dialog', { name: 'Plan this payday' });
  await expect(sheet.getByTestId('payday-savings')).toHaveText(
    'Move $300.00 to savings.',
  );
  await expect(sheet.getByLabel('Groceries')).toHaveValue('200.00');
  await expectAccessible(page);
  await sheet.getByLabel('Groceries').fill('250');
  await sheet.getByRole('button', { name: 'Confirm the plan' }).click();
  await expect(sheet).toBeHidden();

  const { budgets } = (await (
    await page.request.get('/v1/budgets')
  ).json()) as {
    budgets: { name: string; planned: { amountMinor: number } }[];
  };
  expect(budgets.find((b) => b.name === 'Groceries')?.planned.amountMinor).toBe(
    25_000,
  );
  const { transactions } = (await (
    await page.request.get('/v1/transactions?limit=1')
  ).json()) as { transactions: { kind: string }[] };
  expect(transactions[0]?.kind).toBe('transfer');
  expect((await plan(page)).savings.amountMinor).toBe(30_000);
});

test('the Dashboard shows the weekly review, the fund and net worth', async ({
  page,
}) => {
  await page.goto('/');
  const review = page.getByRole('region', { name: /^Your week/u });
  await expect(review).toBeVisible();
  await expect(review).toContainText('You spent $40.00');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Emergency fund' }),
  ).toBeVisible();
  await expect(page.getByTestId('net-worth')).toBeVisible();
  await expectAccessible(page);

  await review
    .getByRole('button', { name: 'Dismiss the weekly review' })
    .click();
  await expect(review).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Emergency fund' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: /^Your week/u })).toHaveCount(
    0,
  );
});

test('Reports has the plan tab with budgets, savings rate and net worth', async ({
  page,
}) => {
  await page.goto('/reports?tab=plan');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Budget against actual' }),
  ).toBeVisible();
  await expect(
    page.getByRole('table', {
      name: 'Each budget this period: planned, spent and left',
    }),
  ).toContainText('$250.00');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Savings rate' }),
  ).toBeVisible();
  const chart = page.getByTestId('net-worth-chart');
  await expect(chart).toBeVisible();
  await chart.getByRole('button', { name: 'Show as table' }).click();
  await expect(chart.getByRole('table')).toBeVisible();
  await expectAccessible(page);
});

test('the plan settings save the savings line', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByLabel('Percent of the paycheck')).toHaveValue('10');
  await page.getByLabel('Percent of the paycheck').fill('15');
  await expectAccessible(page);
  await page
    .getByRole('region', { name: 'Budget rules' })
    .getByRole('button', { name: 'Save' })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved.' }),
  ).toBeVisible();
  const settings = (await (
    await page.request.get('/v1/settings/ledger')
  ).json()) as { payYourselfFirst: { basisPoints: number } };
  expect(settings.payYourselfFirst.basisPoints).toBe(1500);
});
