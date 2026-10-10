import { expect, test, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The Reports summary and trends tabs with made-up data. One instance per
// size: the first test creates the account and seeds it, later ones sign in
// through the API.
test.describe.configure({ mode: 'serial' });

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as { id: string };
}

async function apiSignIn(page: Page, origin: string) {
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
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

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('the summary tab shows figures, categories, payees and days', async ({
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
  const household = await post(page, origin, '/v1/categories', {
    name: 'Household',
    kind: 'expense',
  });
  const pantry = await post(page, origin, '/v1/categories', {
    name: 'Pantry',
    kind: 'expense',
    parentId: household.id,
  });
  const fun = await post(page, origin, '/v1/categories', {
    name: 'Leisure',
    kind: 'expense',
  });
  const everyday = await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency: available.currency,
    openingBalance: money(250_000),
  });
  const spend = (amountMinor: number, categoryId: string, note: string) =>
    post(page, origin, '/v1/transactions', {
      kind: 'expense',
      accountId: everyday.id,
      amount: money(amountMinor),
      categoryId,
      note,
    });
  await spend(4_200, pantry.id, 'Corner market');
  await spend(1_800, pantry.id, 'Corner market');
  await spend(2_500, fun.id, 'Cinema');
  await post(page, origin, '/v1/budgets', {
    name: 'Leisure',
    target: { kind: 'category', categoryId: fun.id },
    amount: money(10_000),
  });

  await page.goto('/reports');
  for (const key of ['categories', 'payees', 'days'] as const) {
    await expect(
      page.getByRole('region', { name: t(`reportsSummary.${key}.title`) }),
    ).toBeVisible();
  }
  const categories = page.getByRole('region', {
    name: t('reportsSummary.categories.title'),
  });
  await expect(categories.getByText('Household')).toBeVisible();
  await expect(categories.getByText('Pantry')).toBeVisible();
  await expect(categories.getByText('Leisure')).toBeVisible();
  const payees = page.getByRole('region', {
    name: t('reportsSummary.payees.title'),
  });
  await expect(payees.getByText('Corner market')).toBeVisible();
  await expect(
    page.getByRole('img', {
      name: new RegExp(`^${t('reportsSummary.days.summary', { over: 0 })}`),
    }),
  ).toBeVisible();
  await expect(
    page.getByText(t('reportsSummary.stats.spent'), { exact: true }).first(),
  ).toBeVisible();

  await noSidewaysScroll(page);
  expect(await tooSmall(page)).toEqual([]);
  await expectAccessible(page);
});

test('a category folds away its children by keyboard', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL ?? '');
  await page.goto('/reports');
  const categories = page.getByRole('region', {
    name: t('reportsSummary.categories.title'),
  });
  const fold = categories.getByRole('button', {
    name: t('reportsSummary.categories.fold', { name: 'Household' }),
  });
  await expect(categories.getByText('Pantry')).toBeVisible();
  await fold.focus();
  await page.keyboard.press('Enter');
  await expect(categories.getByText('Pantry')).toBeHidden();
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(categories.getByText('Pantry')).toBeVisible();
});

test('the period menu is kept in the address', async ({ page, baseURL }) => {
  await apiSignIn(page, baseURL ?? '');
  await page.goto('/reports');
  await page
    .getByRole('button', { name: new RegExp(t('reportsShell.period.label')) })
    .click();
  await page
    .getByRole('menuitemradio', { name: t('reportsShell.period.last-cycle') })
    .click();
  await expect(page).toHaveURL(/period=last-cycle/);
  await expect(page.getByText(t('reportsShell.noCycle'))).toBeVisible();
  await expectAccessible(page);

  await page.goto('/reports?period=month');
  await expect(
    page.getByRole('region', { name: t('reportsSummary.categories.title') }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: t('reportsSummary.days.title') }),
  ).toBeVisible();
  await expectAccessible(page);
});

test('the trends tab shows lines, comparison and totals', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL ?? '');
  await page.goto('/reports/trends');
  for (const key of ['linesTitle', 'vsTitle', 'totalsTitle'] as const) {
    await expect(
      page.getByRole('region', { name: t(`reportsSummary.trends.${key}`) }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole('img', {
      name: new RegExp(
        `^${t('reportsSummary.trends.totalsSummary', { count: 0 }).replace('0', '\\d+')}`,
      ),
    }),
  ).toBeVisible();
  const versus = page.getByRole('region', {
    name: t('reportsSummary.trends.vsTitle'),
  });
  await expect(versus.getByText('Household')).toBeVisible();

  await noSidewaysScroll(page);
  expect(await tooSmall(page)).toEqual([]);
  await expectAccessible(page);
});
