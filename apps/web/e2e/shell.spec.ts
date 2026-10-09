import { expect, test, type Page } from '@playwright/test';
import { shellPaths } from '../src/lib/redirect.ts';
import { t } from '../src/messages/t.ts';
import { navItems, subTabs } from '../src/nav-items.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// Tests share one instance: the first creates the account, later ones sign in
// through the API. The auth pages are placeholders until the settings step,
// so nothing here signs in through the UI. Each project runs at one of the
// three design sizes (390, 820, 1440 px), where frame width = viewport width.
test.describe.configure({ mode: 'serial' });

async function apiSignIn(page: Page, baseURL: string | undefined) {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
}

async function box(page: Page, selector: string) {
  const found = await page.locator(selector).first().boundingBox();
  if (found === null) throw new Error(`${selector} has no box`);
  return found;
}

test('a signed-out visitor is sent to sign-in and back', async ({
  page,
  baseURL,
}) => {
  const origin = { origin: baseURL ?? '' };
  const onboard = await page.request.post('/v1/onboarding', {
    data: account,
    headers: origin,
  });
  expect(onboard.ok()).toBe(true);
  const skip = await page.request.put('/v1/settings/setup', {
    data: setupSkipped,
    headers: origin,
  });
  expect(skip.ok()).toBe(true);
  const signOut = await page.request.post('/v1/auth/sign-out', {
    data: {},
    headers: origin,
  });
  expect(signOut.ok()).toBe(true);

  await page.goto('/budget/pools');
  await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fbudget%2Fpools$/);
  // A crafted target falls back to the Dashboard.
  await page.goto('/sign-in?redirect=%2F%2Fevil.example');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('old addresses redirect in the browser', async ({ page, baseURL }) => {
  await apiSignIn(page, baseURL);
  await page.goto('/ledger');
  await expect(page).toHaveURL(/\/transactions$/);
  await page.goto('/cycle');
  await expect(page).toHaveURL(/\/reports\/summary$/);
  await page.goto('/budget');
  await expect(page).toHaveURL(/\/budget\/budgets$/);
  await page.goto('/accounts/all');
  await expect(page).toHaveURL(/\/accounts$/);
});

test('every destination is reachable from the nav and accessible', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL);
  await page.goto('/reports');
  const nav = page.getByRole('navigation', { name: t('nav.label') });

  for (const item of navItems) {
    const link = nav.getByRole('link', { name: t(item.label) });
    await link.click();
    // Screens with sub-tabs land on their first one.
    await expect(page).toHaveURL(
      new RegExp(`${item.to === '/' ? '' : item.to}(/[a-z-]+)?$`),
    );
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectAccessible(page);
  }
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

test('sub-tabs change the address and the selected one is filled', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL);
  await page.goto('/budget');
  const tabs = page.getByRole('navigation', { name: t('shell.tabs.label') });
  for (const sub of subTabs.budget) {
    const link = tabs.getByRole('link', { name: t(`shell.tabs.${sub}`) });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/budget/${sub}$`));
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(link).toHaveClass(/bg-primary/);
  }
  // Only the selected sub-tab is filled.
  await expect(tabs.locator('[aria-current=page]')).toHaveCount(1);

  await page.goto('/accounts');
  const accounts = page.getByRole('navigation', {
    name: t('shell.tabs.label'),
  });
  await accounts.getByRole('link', { name: t('shell.tabs.credit') }).click();
  await expect(page).toHaveURL(/\/accounts\/credit$/);
  await accounts.getByRole('link', { name: t('shell.tabs.all') }).click();
  await expect(page).toHaveURL(/\/accounts$/);
});

test('the shell lines up (docs/ui.md §10)', async ({ page, baseURL }, info) => {
  await apiSignIn(page, baseURL);
  await page.goto('/budget/budgets');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');

  if (viewport.width < 600) {
    const nav = await box(page, '[data-slot=nav]');
    expect(Math.round(nav.y + nav.height)).toBe(viewport.height);
    const widths = await page
      .locator('[data-slot=nav] a')
      .evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().width)),
      );
    expect(widths).toHaveLength(5);
    for (const width of widths)
      expect(Math.abs(width - (widths[0] ?? 0))).toBeLessThanOrEqual(1);
    return;
  }

  const logo = await box(page, '[data-slot=logo]');
  const summary = await box(page, '[data-slot=summary]');
  expect(Math.round(logo.y + logo.height)).toBe(
    Math.round(summary.y + summary.height),
  );

  const strip = await box(page, '[data-slot=strip]');
  const rows = await page
    .locator('[data-slot=nav] a')
    .evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height)),
    );
  for (const height of rows) expect(height).toBe(Math.round(strip.height));

  const settings = await box(page, '[data-slot=settings]');
  const command = await box(page, '[data-slot=command]');
  expect(Math.round(settings.y)).toBe(Math.round(command.y));
  expect(Math.round(settings.height)).toBe(Math.round(command.height));

  // The nav column is a rail below 1000 px and a sidebar from there.
  const nav = await box(page, '[data-slot=nav]');
  const rem = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  expect(Math.round(nav.width)).toBe(
    Math.round((viewport.width >= 1000 ? 13.25 : 4.5) * rem),
  );
  info.annotations.push({ type: 'rem', description: String(rem) });
});

test('nothing overflows sideways and targets are at least 24 px', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL);
  const width = page.viewportSize()?.width ?? 0;
  for (const path of ['/', '/accounts', '/budget/pools', '/settings/money']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);

    const small = await page
      .locator('a, button, [role=button], input')
      .evaluateAll((els) =>
        els
          .filter((el) => !el.classList.contains('sr-only'))
          .map((el) => ({
            label:
              el.textContent || el.getAttribute('aria-label') || el.tagName,
            rect: el.getBoundingClientRect(),
          }))
          .filter(
            ({ rect }) =>
              rect.width > 0 && (rect.width < 24 || rect.height < 24),
          )
          .map(
            ({ label, rect }) =>
              `${label}: ${String(rect.width)}x${String(rect.height)}`,
          ),
      );
    expect(small, `${path} has small targets at ${String(width)} px`).toEqual(
      [],
    );
  }
});
