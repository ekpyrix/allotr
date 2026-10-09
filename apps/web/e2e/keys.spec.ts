import { expect, test, type Page } from '@playwright/test';
import { account, setupSkipped } from './account.ts';

// The keyboard map (docs/ui.md §5). Tests share one instance, so the first
// creates the account and every test signs in through the API.
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page, baseURL }, info) => {
  const headers = { origin: baseURL ?? '' };
  if (info.title === 'the number keys jump to the destinations') {
    const onboard = await page.request.post('/v1/onboarding', {
      data: account,
      headers,
    });
    expect(onboard.ok()).toBe(true);
    const skip = await page.request.put('/v1/settings/setup', {
      data: setupSkipped,
      headers,
    });
    expect(skip.ok()).toBe(true);
  }
  const signIn = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers,
  });
  expect(signIn.ok()).toBe(true);
});

// Keys pressed before React mounts the shell go nowhere.
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('[data-shell]')).toBeVisible();
  await expect(page.locator('#content')).toBeVisible();
}

test('the number keys jump to the destinations', async ({ page }) => {
  await open(page, '/');
  await page.keyboard.press('2');
  await expect(page).toHaveURL(/\/accounts$/);
  await page.keyboard.press('3');
  await expect(page).toHaveURL(/\/transactions$/);
  await page.keyboard.press('4');
  await expect(page).toHaveURL(/\/budget\/budgets$/);
  await page.keyboard.press('5');
  await expect(page).toHaveURL(/\/reports\/summary$/);
  await page.keyboard.press('1');
  await expect(page).toHaveURL(/\/$/);
});

test('[ and ] move between sub-tabs and stop at the ends', async ({ page }) => {
  await open(page, '/budget/budgets');
  await page.keyboard.press(']');
  await expect(page).toHaveURL(/\/budget\/pools$/);
  await page.keyboard.press(']');
  await expect(page).toHaveURL(/\/budget\/bills$/);
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  await expect(page).toHaveURL(/\/budget\/budgets$/);
  await page.keyboard.press('[');
  await expect(page).toHaveURL(/\/budget\/budgets$/);
});

test('comma opens Settings', async ({ page }) => {
  await open(page, '/');
  await page.keyboard.press(',');
  await expect(page).toHaveURL(/\/settings\/money$/);
});

test('typing in a field is not hijacked', async ({ page }) => {
  await open(page, '/accounts');
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'scratch');
    document.body.append(input);
    input.focus();
  });
  await page.keyboard.type('3,]/');
  await expect(page.getByLabel('scratch')).toHaveValue('3,]/');
  await expect(page).toHaveURL(/\/accounts$/);
});
