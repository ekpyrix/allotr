import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { totpFromUri } from './totp.ts';

const account = {
  name: 'Sam Example',
  email: 'sam@example.test',
  password: 'correct horse battery staple',
};

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
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

  // 401 answers for the signed-out session probe are expected; anything
  // else (CSP violations, script errors) is not.
  expect(consoleErrors.filter((text) => !text.includes('401'))).toEqual([]);
});
