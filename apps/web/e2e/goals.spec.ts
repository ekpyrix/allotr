import { expect, test } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// Savings goals on the Budget tab (ADR 0021), one instance per size. A
// $400.00 savings account and a $1,000.00 goal on it.
test.describe.configure({ mode: 'serial' });

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
  const made = await api.post('/v1/accounts', {
    data: {
      name: 'Rainy day',
      currency: 'USD',
      budgetGroup: 'off',
      openingBalance: { amountMinor: 40_000, currency: 'USD' },
    },
  });
  expect(made.ok()).toBe(true);
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

test('adds a goal and shows its progress', async ({ page }) => {
  await page.goto('/budget');
  const goals = page.getByRole('region', { name: 'Savings goals' });
  await goals.getByLabel('Goal name').fill('Emergency fund');
  await goals.getByLabel('Saving in').selectOption({ label: 'Rainy day' });
  await goals.getByLabel('Target amount').fill('1000');
  await expectAccessible(page);
  await goals.getByRole('button', { name: 'Add goal' }).click();
  const row = goals.getByRole('listitem').filter({ hasText: 'Emergency fund' });
  await expect(row.getByTestId('goal-saved')).toContainText(
    '$400.00 of $1,000.00',
  );
  await expect(row).toContainText('$600.00 to go');
});

test('archives a goal', async ({ page }) => {
  await page.goto('/budget');
  const goals = page.getByRole('region', { name: 'Savings goals' });
  await goals.getByRole('button', { name: 'Archive Emergency fund' }).click();
  await expect(
    goals.getByRole('heading', { name: 'Emergency fund' }),
  ).toBeHidden();
  await expect(goals).toContainText('No goals yet.');
});
