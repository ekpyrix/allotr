import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';
import { totpFromUri } from './totp.ts';

const backgrounds = { light: 'rgb(243, 245, 242)', dark: 'rgb(15, 26, 23)' };

// The radios are visually hidden inside their labels; click what people see.
async function chooseTheme(page: Page, name: 'Light' | 'Dark' | 'System') {
  const group = page.getByRole('group', { name: 'Theme' });
  await group.getByText(name, { exact: true }).click();
  await expect(group.getByRole('radio', { name })).toBeChecked();
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

  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { name: 'Left today' })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);

  // An explicit mode overrides the device (light on phone, dark on
  // desktop), survives a reload and passes axe either way.
  await chooseTheme(page, 'Light');
  await expectScheme(page, 'light');
  await expectAccessible(page);
  await chooseTheme(page, 'Dark');
  await expectScheme(page, 'dark');
  await expectAccessible(page);
  await page.reload();
  await expectScheme(page, 'dark');
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();

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

  // Forget this device's copy: after signing in, the account's copy
  // must bring Dark back.
  await page.evaluate(() => {
    localStorage.removeItem('allotr.theme-mode');
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await expectScheme(page, 'light');

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
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByText(`Hello ${account.name}.`, { exact: false }),
  ).toBeVisible();
  await expectScheme(page, 'dark');

  // 401 answers for the signed-out session probe are expected; anything
  // else (CSP violations, script errors) is not.
  expect(consoleErrors.filter((text) => !text.includes('401'))).toEqual([]);
});
