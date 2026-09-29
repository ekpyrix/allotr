import { expect, test, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';

// One instance per size: the first hook onboards; every test signs in
// through the API. Both sizes run Chromium, which has the CDP
// installability check.
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL ?? '';
  const api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
  expect((await api.post('/v1/onboarding', { data: account })).ok()).toBe(true);
  const created = await api.post('/v1/accounts', {
    data: { name: 'Everyday', currency: 'USD' },
  });
  expect(created.ok()).toBe(true);
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

/** Opens Today and waits until the service worker controls the page. */
async function openControlled(page: Page) {
  await page.goto('/today');
  await expect(
    page.getByRole('heading', { name: t('today.title') }),
  ).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

interface Manifest {
  id: string;
  name: string;
  start_url: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
}

test('the manifest is valid and the app is installable', async ({ page }) => {
  await page.goto('/sign-in');
  const response = await page.request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as Manifest;
  expect(manifest).toMatchObject({
    id: '/',
    name: 'Allotr',
    start_url: '/',
    display: 'standalone',
  });
  const icons = [
    ...manifest.icons,
    { src: '/apple-touch-icon.png', type: 'image/png' },
  ];
  expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual(
    expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']),
  );
  for (const icon of icons) {
    const file = await page.request.get(icon.src);
    expect(file.ok(), icon.src).toBe(true);
    expect(file.headers()['content-type']).toContain(icon.type);
  }

  const cdp = await page.context().newCDPSession(page);
  const { errors } = await cdp.send('Page.getAppManifest');
  expect(errors).toEqual([]);
  const { installabilityErrors } = await cdp.send(
    'Page.getInstallabilityErrors',
  );
  expect(installabilityErrors).toEqual([]);
});

test('the worker serves the app, never the API', async ({ page }) => {
  await openControlled(page);
  const [shell, api] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/theme-init.js'),
    page.waitForResponse((r) => new URL(r.url()).pathname.startsWith('/v1/')),
    page.reload(),
  ]);
  expect(shell.fromServiceWorker()).toBe(true);
  expect(api.fromServiceWorker()).toBe(false);
});

test('offline, the app loads and shows a notice instead of figures', async ({
  page,
  context,
}) => {
  await openControlled(page);
  await context.setOffline(true);
  await page.reload();

  await expect(
    page.getByRole('heading', { name: t('offline.title') }),
  ).toBeVisible();
  await expect(page.getByText(t('offline.intro'))).toBeVisible();
  await expect(page.getByLabel(t('today.noFigure'))).toHaveCount(0);
  await expectAccessible(page);

  // Back online, the page loads by itself.
  await context.setOffline(false);
  await expect(
    page.getByRole('heading', { name: t('today.title') }),
  ).toBeVisible();
});

test('losing the connection hides the view until it returns', async ({
  page,
  context,
}) => {
  await openControlled(page);
  await context.setOffline(true);

  const main = page.getByRole('main');
  await expect(
    main.getByRole('heading', { name: t('offline.title') }),
  ).toBeVisible();
  await expect(main.locator('[aria-live="polite"]')).toHaveText(
    t('offline.title'),
  );
  await expect(page.getByLabel(t('today.noFigure'))).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: t('nav.label') }),
  ).toBeVisible();
  await expectAccessible(page);

  await context.setOffline(false);
  await expect(
    main.getByRole('heading', { name: t('today.title') }),
  ).toBeVisible();
});

test('quick entry needs a connection', async ({ page, context }) => {
  await openControlled(page);
  await context.setOffline(true);
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: t('quickEntry.title') });
  await expect(dialog.getByRole('status')).toHaveText(t('quickEntry.offline'));
  await expectAccessible(page);

  await context.setOffline(false);
  await expect(dialog.getByLabel('Amount in USD')).toBeVisible();
});

test('a save made offline fails at once and is never sent later', async ({
  page,
  context,
}) => {
  await openControlled(page);
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: t('quickEntry.title') });
  await dialog.getByLabel('Amount in USD').fill('9.99');
  await dialog.getByLabel('Category').selectOption({ index: 1 });
  await context.setOffline(true);
  await dialog.getByLabel('Category').press('Enter');
  await expect(dialog.getByRole('alert')).toHaveText(t('errors.network'));

  await context.setOffline(false);
  await expect(
    page.getByRole('main').getByRole('heading', { name: t('today.title') }),
  ).toBeVisible();
  // A paused write would go out as soon as the connection is back.
  await page.waitForTimeout(1000);
  const response = await page.request.get('/v1/transactions');
  const { transactions } = (await response.json()) as {
    transactions: unknown[];
  };
  expect(transactions).toEqual([]);
});
