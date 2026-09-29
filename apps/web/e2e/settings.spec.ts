import type { LedgerSettingsView, TodayView } from '@allotr/shared';
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
