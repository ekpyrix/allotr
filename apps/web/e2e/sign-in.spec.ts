import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';
import { totpFromUri } from './totp.ts';

// Two-factor sign-in with a backup code, one instance per size. The first
// user turns 2FA on through the API and keeps the backup codes; each code
// signs in once.
test.describe.configure({ mode: 'serial' });

let backupCodes: string[] = [];

test.beforeAll(async ({ playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL ?? '';
  const api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
  expect((await api.post('/v1/onboarding', { data: account })).ok()).toBe(true);
  await api.put('/v1/settings/setup', { data: setupSkipped });
  const enable = await api.post('/v1/auth/two-factor/enable', {
    data: { password: account.password },
  });
  let totpURI: string;
  ({ totpURI, backupCodes } = (await enable.json()) as {
    totpURI: string;
    backupCodes: string[];
  });
  expect(
    (
      await api.post('/v1/auth/two-factor/verify-totp', {
        data: { code: totpFromUri(totpURI) },
      })
    ).ok(),
  ).toBe(true);
  await api.dispose();
});

async function toCodeStep(page: Page) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('heading', { name: 'Enter your code' }),
  ).toBeVisible();
}

test('the sign-in card is centred and at most 440 px wide', async ({
  page,
}) => {
  await page.goto('/sign-in');
  const heading = page.getByRole('heading', { level: 1, name: 'Sign in' });
  const card = page.locator('main > div').filter({ has: heading });
  const box = await card.boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null) throw new Error('no layout');
  expect(box.width).toBeLessThanOrEqual(440);
  // Centred: equal space either side, within a pixel.
  expect(
    Math.abs(box.x - (viewport.width - box.x - box.width)),
  ).toBeLessThanOrEqual(1);
  await expectAccessible(page);
});

test('signs in with a backup code', async ({ page }) => {
  const [code] = backupCodes;
  if (code === undefined) throw new Error('no backup codes');
  await toCodeStep(page);
  await expect(page.getByLabel('Code')).toHaveAccessibleDescription(
    'A 6-digit code or a backup code. Each backup code works once.',
  );
  await expectAccessible(page);

  await page.getByLabel('Code').fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('refuses a backup code that has been used', async ({ page }) => {
  const [used, unused] = backupCodes;
  if (used === undefined || unused === undefined)
    throw new Error('no backup codes');
  await toCodeStep(page);

  await page.getByLabel('Code').fill(used);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'The code is wrong or has already been used.',
  );
  await expectAccessible(page);

  await page.getByLabel('Code').fill(unused);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/$/);
});
