import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { navItems } from '../src/nav-items.ts';
import { extraShellPaths } from '../src/lib/redirect.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The redesign audit (plan PR 17), one instance per size, on the
// single-currency-month fixture. Reduced motion is checked on every run.
// Axe across palette families and INP under a slowed CPU are slower and
// timing-sensitive, so they run only with ALLOTR_AUDIT=1; their results
// are recorded as test annotations.
test.describe.configure({ mode: 'serial' });

const audit = process.env.ALLOTR_AUDIT === '1';
const bundle: unknown = JSON.parse(
  readFileSync(
    new URL(
      '../../../testdata/synthetic/single-currency-month/bundle.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

test.beforeAll(async ({ playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL ?? '';
  const api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
  expect((await api.post('/v1/onboarding', { data: account })).ok()).toBe(true);
  expect((await api.post('/v1/import', { data: bundle })).status()).toBe(201);
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
});

/** The longest transition or animation duration on the page, in seconds. */
function longestMotion(page: Page): Promise<number> {
  return page.evaluate(() => {
    // `auto` (scroll-driven animations) has no length: it counts as 0.
    const seconds = (value: string) =>
      Math.max(
        0,
        ...value.split(',').map((part) => {
          const text = part.trim();
          const number = Number.parseFloat(text);
          if (!Number.isFinite(number)) return 0;
          return text.endsWith('ms') ? number / 1000 : number;
        }),
      );
    let longest = 0;
    for (const element of document.querySelectorAll('*')) {
      const style = getComputedStyle(element);
      longest = Math.max(
        longest,
        seconds(style.transitionDuration),
        style.animationName === 'none' ? 0 : seconds(style.animationDuration),
      );
    }
    return longest;
  });
}

test('reduced motion, from the device or the app, stops every animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByTestId('left-today')).toBeAttached();
  expect(await longestMotion(page)).toBeLessThanOrEqual(0.0001);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const motion of ['reduced', 'off'] as const) {
    await page.evaluate((value) => {
      localStorage.setItem('allotr.motion', value);
    }, motion);
    await page.reload();
    await expect(page.getByTestId('left-today')).toBeAttached();
    expect(await longestMotion(page), motion).toBeLessThanOrEqual(0.0001);
  }
  // With full motion there is motion to stop.
  await page.evaluate(() => {
    localStorage.setItem('allotr.motion', 'full');
  });
  await page.reload();
  await expect(page.getByTestId('left-today')).toBeAttached();
  expect(await longestMotion(page)).toBeGreaterThan(0.05);
  await page.evaluate(() => {
    localStorage.removeItem('allotr.motion');
  });
});

const families = [
  ['catppuccin-latte', 'catppuccin-mocha'],
  ['gruvbox-light', 'gruvbox-dark'],
  ['solarized-light', 'solarized-dark'],
  ['rose-pine-dawn', 'rose-pine'],
] as const;

test('every route passes axe in four palette families', async ({
  page,
  baseURL,
}) => {
  test.skip(!audit, 'Set ALLOTR_AUDIT=1 to run the audit.');
  test.setTimeout(600_000);
  const routes = [...navItems.map((item) => item.to), ...extraShellPaths];
  for (const [light, dark] of families) {
    const saved = await page.request.put('/v1/settings/appearance', {
      data: { mode: 'system', light, dark },
      headers: { origin: baseURL ?? '' },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await test.step(`${light}/${dark} ${route}`, () =>
        expectAccessible(page));
    }
  }
  test.info().annotations.push({
    type: 'axe',
    description: `${String(routes.length)} routes × ${String(families.length)} families passed`,
  });
  await page.request.put('/v1/settings/appearance', {
    data: { mode: 'system', light: families[0][0], dark: families[0][1] },
    headers: { origin: baseURL ?? '' },
  });
});

test('saving an entry and opening a sheet respond within 200 ms on a slow CPU', async ({
  page,
}) => {
  test.skip(!audit, 'Set ALLOTR_AUDIT=1 to run the audit.');
  test.setTimeout(120_000);
  // Event Timing: the longest event per interaction, as INP counts it.
  await page.addInitScript(() => {
    const longest = new Map<number, number>();
    Object.assign(window, { __interactions: longest });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) {
        if (entry.interactionId === 0) continue;
        longest.set(
          entry.interactionId,
          Math.max(longest.get(entry.interactionId) ?? 0, entry.duration),
        );
      }
    }).observe({
      type: 'event',
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit);
  });
  await page.goto('/');
  await expect(page.getByTestId('left-today')).toBeAttached();
  // A person looks at the figure before tapping: idle prefetches finish.
  await page.waitForLoadState('networkidle');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const worst = () =>
    page.evaluate(() => {
      const map = (window as unknown as { __interactions: Map<number, number> })
        .__interactions;
      const value = Math.max(0, ...map.values());
      map.clear();
      return value;
    });

  await page
    .getByRole('button', { name: 'How today’s allowance is worked out' })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Where today’s number comes from' }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  const sheet = await worst();
  await page.keyboard.press('Escape');

  await page.keyboard.press('n');
  await expect(page.getByLabel('Amount in EUR')).toBeFocused();
  await page.keyboard.type('4.20');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Fun');
  await worst();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('saved');
  await page.waitForTimeout(500);
  const save = await worst();

  test.info().annotations.push({
    type: 'INP (CPU ×4)',
    description: `open sheet ${String(Math.round(sheet))} ms, save ${String(Math.round(save))} ms`,
  });
  expect(sheet).toBeLessThan(200);
  expect(save).toBeLessThan(200);
});
