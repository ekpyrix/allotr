import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';

// Export from settings (FR-U3, FR-U4), one instance per size. The first
// hook onboards and imports a synthetic fixture; each format downloads as
// a file of that format.
test.describe.configure({ mode: 'serial' });

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
  const imported = await api.post('/v1/import', { data: bundle });
  expect(imported.status(), await imported.text()).toBe(201);
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

const formats = [
  {
    name: 'Download backup (JSON)',
    extension: 'json',
    check: (text: string) => {
      expect(JSON.parse(text)).toMatchObject({
        format: 'allotr.bundle',
        version: 1,
      });
    },
  },
  {
    name: 'Download spreadsheet (CSV)',
    extension: 'csv',
    check: (text: string) => {
      expect(text.startsWith('date,entry_id,kind,account,amount,')).toBe(true);
    },
  },
  {
    name: 'Download Beancount',
    extension: 'beancount',
    check: (text: string) => {
      expect(text).toContain('option "operating_currency" "EUR"');
      expect(text).toMatch(/^\d{4}-\d{2}-\d{2} open Assets:Wallet EUR$/m);
    },
  },
];

test('the export section passes the accessibility checks', async ({ page }) => {
  await page.goto('/settings#export');
  await expect(
    page.getByRole('heading', { level: 3, name: 'Export' }),
  ).toBeFocused();
  await expectAccessible(page);
});

for (const format of formats) {
  test(`downloads ${format.extension}`, async ({ page }) => {
    await page.goto('/settings#export');
    const link = page.getByRole('link', { name: format.name });
    await expect(link).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      link.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^allotr-export-\\d{4}-\\d{2}-\\d{2}\\.${format.extension}$`),
    );
    const path = await download.path();
    format.check(await readFile(path, 'utf8'));
  });
}
