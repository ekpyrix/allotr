import { expect, test, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The Reports screen's plan and cycles tabs with made-up data. One instance
// per size: the first test creates the account and seeds it, later ones sign
// in through the API.
test.describe.configure({ mode: 'serial' });

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as { id: string };
}

async function tooSmall(page: Page) {
  return page
    .locator('main a, main button, main [role=button]')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
}

const region = (page: Page, name: string) => page.getByRole('region', { name });

test('the plan tab shows budgets, savings rate and net worth', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await post(page, origin, '/v1/onboarding', account);
  const skip = await page.request.put('/v1/settings/setup', {
    data: setupSkipped,
    headers: { origin },
  });
  expect(skip.ok()).toBe(true);

  const today = await page.request.get('/v1/today');
  const { available } = (await today.json()) as {
    available: { currency: string };
  };
  const money = (amountMinor: number) => ({
    amountMinor,
    currency: available.currency,
  });
  const groceries = await post(page, origin, '/v1/categories', {
    name: 'Groceries',
    kind: 'expense',
    icon: 'beer',
  });
  const everyday = await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency: available.currency,
    openingBalance: money(250_000),
  });
  await post(page, origin, '/v1/transactions', {
    kind: 'expense',
    accountId: everyday.id,
    amount: money(4_200),
    categoryId: groceries.id,
    note: 'Corner market',
  });
  await post(page, origin, '/v1/budgets', {
    name: 'Groceries',
    target: { kind: 'category', categoryId: groceries.id },
    amount: money(40_000),
  });

  await page.goto('/reports/plan');
  const budget = region(page, t('reportsPlan.budget.title'));
  await expect(budget.getByText('Groceries')).toBeVisible();
  await expect(
    budget.getByRole('progressbar', {
      name: t('reportsPlan.budget.barLabel', { name: 'Groceries' }),
    }),
  ).toBeVisible();
  await expect(region(page, t('reportsPlan.rate.title'))).toBeVisible();
  const worth = region(page, t('reportsPlan.netWorth.title'));
  await expect(worth.getByRole('img').first()).toBeVisible();
  await expectAccessible(page);
  expect(await tooSmall(page)).toEqual([]);
});

test('the period menu changes the net worth span by keyboard', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
  await page.goto('/reports/plan');
  await expect(region(page, t('reportsPlan.netWorth.title'))).toBeVisible();
  const menu = page.getByRole('button', {
    name: new RegExp(t('reportsShell.period.label')),
  });
  await menu.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('menuitemradio', { name: t('reportsShell.period.month') })
    .click();
  await expect(page).toHaveURL(/period=month/);
  await expect(region(page, t('reportsPlan.netWorth.title'))).toBeVisible();
  await expectAccessible(page);
});

test('the cycles tab shows the charts and the table', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
  await page.goto('/reports/cycles');
  await expect(region(page, t('reportsPlan.cycles.spent.title'))).toBeVisible();
  await expect(region(page, t('reportsPlan.cycles.saved.title'))).toBeVisible();
  const table = region(page, t('reportsPlan.cycles.table.title'));
  await expect(
    table.getByText(t('reportsPlan.cycles.thisCycle')),
  ).toBeVisible();
  await expectAccessible(page);
  expect(await tooSmall(page)).toEqual([]);
});
