import { contrastRatio } from '@allotr/shared';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';
import { totpFromUri } from './totp.ts';

// The default themes' canvas: Catppuccin Latte and Mocha.
const backgrounds = { light: 'rgb(239, 241, 245)', dark: 'rgb(30, 30, 46)' };

// The radios are visually hidden inside their labels; click what people see.
async function chooseTheme(page: Page, name: 'Light' | 'Dark' | 'System') {
  const group = page.getByRole('group', { name: 'Theme', exact: true });
  await group.getByText(name, { exact: true }).click();
  await expect(group.getByRole('radio', { name })).toBeChecked();
}

function hex(rgb: string): string {
  const channels = rgb.match(/\d+/g)?.slice(0, 3) ?? [];
  return `#${channels.map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`;
}

// axe does not check state indicators: the selected mode must stand out
// from the page at 3:1 (WCAG 2.2 SC 1.4.11).
async function expectVisibleSelection(page: Page) {
  const selected = page
    .getByRole('group', { name: 'Theme', exact: true })
    .locator('label:has(input:checked)');
  const [fill, page_] = await Promise.all([
    selected.evaluate((el) => getComputedStyle(el).backgroundColor),
    page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor),
  ]);
  expect(contrastRatio(hex(fill), hex(page_))).toBeGreaterThanOrEqual(3);
}

async function expectScheme(page: Page, scheme: 'light' | 'dark') {
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    backgrounds[scheme],
  );
}

function savedAppearance(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/settings/appearance') &&
      response.request().method() === 'PUT',
  );
}

test('onboarding, sign-in with two-factor and Today', async ({
  page,
  baseURL,
}) => {
  // Onboarding, several axe runs and a 2FA sign-in in one test.
  test.setTimeout(60_000);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole('heading', { name: 'Set up Allotr' }),
  ).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel('Name').fill(account.name);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Setup has its own spec; skipping it lands on Today.
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByRole('button', { name: 'Skip the rest of setup' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Left today' })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);

  // An explicit mode overrides the device (light on phone, dark on
  // desktop), survives a reload and passes axe either way.
  await chooseTheme(page, 'Light');
  await expectScheme(page, 'light');
  await expectAccessible(page);
  await expectVisibleSelection(page);
  await chooseTheme(page, 'Dark');
  await expectScheme(page, 'dark');
  await expectAccessible(page);
  await expectVisibleSelection(page);
  await page.reload();
  await expectScheme(page, 'dark');
  await expect(
    page
      .getByRole('group', { name: 'Theme', exact: true })
      .getByRole('radio', { name: 'Dark' }),
  ).toBeChecked();

  // System follows the device while the page is open.
  await chooseTheme(page, 'System');
  await page.emulateMedia({ colorScheme: 'light' });
  await expectScheme(page, 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectScheme(page, 'dark');

  const saved = savedAppearance(page);
  await chooseTheme(page, 'Dark');
  expect((await saved).ok()).toBe(true);

  // Enrol in 2FA through the API with the browser's session; the web
  // enrolment screen comes later.
  const origin = { origin: baseURL ?? '' };
  const enable = await page.request.post('/v1/auth/two-factor/enable', {
    data: { password: account.password },
    headers: origin,
  });
  expect(enable.ok()).toBe(true);
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const verify = await page.request.post('/v1/auth/two-factor/verify-totp', {
    data: { code: totpFromUri(totpURI) },
    headers: origin,
  });
  expect(verify.ok()).toBe(true);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expectAccessible(page);

  // Signed out, without a reload: a choice stays on this device and does
  // not try the account. Signing in again must bring the account's Dark.
  await chooseTheme(page, 'Light');
  await expectScheme(page, 'light');
  await expect(page.getByRole('status')).toHaveCount(0);

  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(
    page.getByRole('heading', { name: 'Enter your code' }),
  ).toBeVisible();
  await expectAccessible(page);
  await page
    .getByLabel('Code')
    .fill('000000' === totpFromUri(totpURI) ? '111111' : '000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert')).not.toBeEmpty();

  await page.getByLabel('Code').fill(totpFromUri(totpURI));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByText(`Hello ${account.name}.`, { exact: false }),
  ).toBeVisible();
  await expectScheme(page, 'dark');

  // 401 answers for the signed-out session probe are expected; anything
  // else (CSP violations, script errors) is not.
  expect(consoleErrors.filter((text) => !text.includes('401'))).toEqual([]);
});
