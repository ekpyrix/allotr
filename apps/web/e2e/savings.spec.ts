import { readFileSync } from 'node:fs';
import {
  formatMoney,
  money,
  type CycleListView,
  type Money,
} from '@allotr/shared';
import { expect, test } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';

// The savings view (FR-W2, G3), one instance per size. It starts with no
// off-budget accounts (the empty state), then imports the
// single-currency-month fixture, whose savings account holds €3,100.00.
test.describe.configure({ mode: 'serial' });

const bundle: unknown = JSON.parse(
  readFileSync(
    new URL(
      '../../../testdata/synthetic/single-currency-month/bundle.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const eur = (amountMinor: number) => money(amountMinor, 'EUR');
let locale = 'en-US';

test.beforeAll(async ({ playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL ?? '';
  const api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
  expect((await api.post('/v1/onboarding', { data: account })).ok()).toBe(true);
  const settings = (await (await api.get('/v1/settings/ledger')).json()) as {
    locale: string;
  };
  locale = settings.locale;
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

test('without off-budget accounts it says how to add one', async ({ page }) => {
  const { totals } = (await (
    await page.request.get('/v1/accounts')
  ).json()) as {
    totals: { off: { amount: Money } };
  };
  expect(totals.off.amount.amountMinor).toBe(0);
  await page.goto('/accounts/savings');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Savings' }),
  ).toBeVisible();
  await expect(page.getByTestId('savings-total')).toHaveText(
    formatMoney(totals.off.amount, locale),
  );
  await expect(page.locator('main')).toContainText(
    'No off-budget accounts yet.',
  );
  await expect(page.getByRole('application')).toHaveCount(0);
  await expectAccessible(page);
  await page.getByRole('link', { name: 'Manage accounts' }).click();
  await expect(page).toHaveURL(/\/accounts$/u);
});

test('shows the total, its growth and each cycle’s change', async ({
  page,
  baseURL,
}) => {
  const imported = await page.request.post('/v1/import', {
    data: bundle,
    headers: { origin: baseURL ?? '' },
  });
  expect(imported.status(), await imported.text()).toBe(201);

  await page.goto('/accounts');
  await page.getByRole('link', { name: 'See savings over time' }).click();
  await expect(page).toHaveURL(/\/accounts\/savings$/u);
  const total = formatMoney(eur(310000), locale);
  await expect(page.getByTestId('savings-total')).toHaveText(total);
  await expect(
    page
      .getByRole('region', { name: 'Accounts' })
      .getByRole('listitem')
      .filter({ hasText: 'Savings' }),
  ).toContainText(total);
  const growth = page.getByRole('region', { name: 'Savings over time' });
  await expect(growth.getByRole('application')).toBeVisible();
  await expect(growth).toContainText(`and are ${total} now.`);
  await expectAccessible(page);
});

test('both charts have a table of the server’s figures', async ({ page }) => {
  const { cycles } = (await (
    await page.request.get('/v1/cycles')
  ).json()) as CycleListView;
  // Oldest first on the charts; the list is newest first.
  const shown = cycles.slice(0, 12).reverse();
  await page.goto('/accounts/savings');
  for (const name of ['Savings over time', 'Change per cycle']) {
    const chart = page.getByRole('region', { name });
    await chart.getByRole('button', { name: 'Show as table' }).click();
    const rows = chart.getByRole('row');
    await expect(rows).toHaveCount(shown.length + 1);
    for (const [at, cycle] of shown.entries()) {
      const row = rows.nth(at + 1);
      await expect(row).toHaveAttribute('data-key', cycle.openedOn);
      const cells = row.getByRole('cell');
      await expect(cells.nth(0)).toHaveText(
        formatMoney(cycle.offBudgetClosing, locale),
      );
      await expect(cells.nth(1)).toHaveText(
        formatMoney(cycle.savingsNetChange, locale, {
          signDisplay: 'exceptZero',
        }),
      );
    }
  }
  await expectAccessible(page);
});
