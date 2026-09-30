import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The command palette (spec §8.2): ⌘K, Ctrl+K or `/` opens it while
// single-key shortcuts are on; it jumps to views, starts an entry or
// searches entries. One instance per size.
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
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

const palette = (page: Page) =>
  page.getByRole('dialog', { name: 'Command palette' });

test('Ctrl+K opens it and a destination is one Enter away', async ({
  page,
}) => {
  await page.keyboard.press('Control+k');
  await expect(palette(page)).toBeVisible();
  await expect(palette(page).getByRole('combobox')).toBeFocused();
  await expectAccessible(page);
  await page.keyboard.type('accou');
  await expect(
    palette(page).getByRole('option', { name: 'Accounts' }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(palette(page)).toBeHidden();
});

test('/ opens it to search entries in the ledger', async ({ page }) => {
  await page.keyboard.press('/');
  await expect(palette(page)).toBeVisible();
  await page.keyboard.type('coffee');
  const search = palette(page).getByRole('option', {
    name: 'Search entries for “coffee”',
  });
  await expect(search).toBeVisible();
  await search.click();
  await expect(page).toHaveURL(/\/ledger\?q=coffee$/);
});

test('New entry hands off to quick entry', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.type('new');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('dialog', { name: 'Add an entry' }),
  ).toBeVisible();
});

test('Escape closes it and focus goes back', async ({ page }) => {
  const settings = page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' });
  await settings.focus();
  await page.keyboard.press('Control+k');
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeHidden();
  await expect(settings).toBeFocused();
});

test('it stays shut while single-key shortcuts are off', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('allotr.shortcuts', 'off');
  });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.keyboard.press('/');
  await expect(palette(page)).toHaveCount(0);
});
