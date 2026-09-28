import { expect, test, type Page } from '@playwright/test';
import { shellPaths } from '../src/lib/redirect.ts';
import { t } from '../src/messages/t.ts';
import { navItems } from '../src/nav-items.ts';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';

// Tests share one instance: the first creates the account, later ones sign
// in through the API.
test.describe.configure({ mode: 'serial' });

async function apiSignIn(page: Page, baseURL: string | undefined) {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
}

test('a deep link while signed out returns there after sign-in', async ({
  page,
  baseURL,
}) => {
  const origin = { origin: baseURL ?? '' };
  const onboard = await page.request.post('/v1/onboarding', {
    data: account,
    headers: origin,
  });
  expect(onboard.ok()).toBe(true);
  const signOut = await page.request.post('/v1/auth/sign-out', {
    data: {},
    headers: origin,
  });
  expect(signOut.ok()).toBe(true);

  await page.goto('/accounts');
  await expect(page).toHaveURL(/\/sign-in\?redirect=%2Faccounts$/);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/accounts$/);
});

test('a crafted redirect falls back to Today', async ({ page }) => {
  await page.goto('/sign-in?redirect=%2F%2Fevil.example');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test('every route is reachable from the nav and accessible', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL);
  // Start on the last item so every click, including the first, changes
  // the route and moves focus to <main>.
  await page.goto(navItems[navItems.length - 1]?.to ?? '/today');
  const nav = page.getByRole('navigation', { name: t('nav.label') });

  for (const item of navItems) {
    const link = nav.getByRole('link', { name: t(item.label) });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${item.to}$`));
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('#content')).toBeFocused();
    await expectAccessible(page);
  }
});

test('a failed session check offers a retry instead of a dead end', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL);
  await page.route('**/v1/session', (route) => route.abort());
  await page.goto('/ledger');
  // Reads retry twice with backoff before the error shows.
  await expect(
    page.getByRole('heading', { name: t('errors.pageTitle') }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(t('errors.network'))).toBeVisible();
  await expectAccessible(page);

  await page.unroute('**/v1/session');
  await page.getByRole('button', { name: t('errors.retry') }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: t('ledger.title') }),
  ).toBeVisible();
});

test('signed-in routes outside the nav are accessible', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL);
  const navPaths: readonly string[] = navItems.map((item) => item.to);
  for (const path of shellPaths.filter((p) => !navPaths.includes(p))) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectAccessible(page);
  }
});

test('the keyboard reaches every nav item with a visible focus ring', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL);
  await page.goto('/today');
  // The app renders after the session check; Tab before that hits nothing.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: t('nav.skip') })).toBeFocused();

  // The Add button is in the rail first from md, and in the bottom bar after
  // the second item below it.
  const nav = page.getByRole('navigation', { name: t('nav.label') });
  const links = navItems.map((item) => ({
    stop: nav.getByRole('link', { name: t(item.label) }),
    to: item.to,
  }));
  const add = {
    stop: nav.getByRole('button', { name: t('quickEntry.add'), exact: true }),
    to: 'add',
  };
  const wide = (page.viewportSize()?.width ?? 0) >= 768;
  const stops = wide
    ? [add, ...links]
    : [...links.slice(0, 2), add, ...links.slice(2)];
  for (const { stop: control, to } of stops) {
    await page.keyboard.press('Tab');
    await expect(control).toBeFocused();
    // Our own ring: a solid outline of at least 2px (or a ring shadow),
    // not the browser's default `auto` outline.
    const ringVisible = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      const outline =
        style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) >= 2;
      return outline || style.boxShadow !== 'none';
    });
    expect(ringVisible, `${to} focus ring`).toBe(true);
  }

  await page.keyboard.press('Enter');
  const last = navItems[navItems.length - 1];
  await expect(page).toHaveURL(new RegExp(`${last?.to ?? ''}$`));
});
