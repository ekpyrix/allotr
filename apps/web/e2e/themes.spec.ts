import { darkTheme } from '@allotr/shared';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// Community and custom themes (FR-W5), one instance per size. The mode is
// set to Dark first, so both sizes paint the dark slot whatever the device.
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL ?? '';
  const api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
  expect((await api.post('/v1/onboarding', { data: account })).ok()).toBe(true);
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

function rootProperty(page: Page, name: string) {
  return page
    .locator('html')
    .evaluate((el, n) => el.style.getPropertyValue(n), name);
}

async function chooseMode(page: Page, name: 'Light' | 'Dark') {
  const group = page.getByRole('group', { name: 'Theme', exact: true });
  await group.getByText(name, { exact: true }).click();
  await expect(group.getByRole('radio', { name })).toBeChecked();
}

test('picks a community theme for the dark slot', async ({ page }) => {
  await page.goto('/settings#appearance');
  await chooseMode(page, 'Dark');
  const dark = page.getByRole('group', { name: 'Dark theme' });
  await dark.getByText('Harbour').click();
  await expect(dark.getByRole('radio', { name: /Harbour/ })).toBeChecked();
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(17, 24, 35)',
  );
  await expectAccessible(page);

  // theme-init.js paints it before the app runs: with the app's scripts
  // blocked, the colours are already there.
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.reload();
  expect(await rootProperty(page, '--canvas')).toBe('#111823');
  await page.unroute('**/assets/*.js');
  await page.reload();

  // Back on the default theme, the stylesheet paints it: no overrides.
  await dark.getByText('Catppuccin Mocha').click();
  await expect.poll(() => rootProperty(page, '--canvas')).toBe('');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(30, 30, 46)',
  );
});

test('creates a custom theme in the editor, applies it and keeps it after a reload', async ({
  page,
}) => {
  await page.goto('/settings#appearance');
  await page.getByRole('link', { name: 'Create theme' }).click();
  await expect(page).toHaveURL(/\/settings\/themes\/new$/);
  await expect(page.getByRole('heading', { name: 'New theme' })).toBeVisible();
  await expectAccessible(page);

  await page
    .getByLabel('Start from')
    .selectOption({ label: 'Allotr dark (Dark)' });
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await page.getByLabel('Name', { exact: true }).fill('Midnight');

  // A failing pair is listed and blocks saving.
  const secondary = page.getByRole('textbox', {
    name: 'Secondary text',
    exact: true,
  });
  await secondary.fill('#333333');
  await expect(page.getByTestId('contrast-summary')).toHaveText(
    '3 colour pairs fail WCAG 2.2 AA:',
  );
  await expect(page.getByTestId('contrast-failures')).toContainText(
    'Secondary text on Page background',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Fix the colours listed under Contrast before saving.',
  );
  await expect(page).toHaveURL(/\/settings\/themes\/new$/);

  await secondary.fill(darkTheme['muted-foreground']);
  await page
    .getByRole('textbox', { name: 'Page background', exact: true })
    .fill('#000000');
  await expect(page.getByTestId('contrast-summary')).toContainText(
    'colour pairs meet WCAG 2.2 AA',
  );
  // The preview takes the draft; the page around it does not.
  await expect(page.getByTestId('theme-preview')).toHaveCSS(
    'background-color',
    'rgb(0, 0, 0)',
  );
  expect(await rootProperty(page, '--canvas')).toBe('');

  await page.getByRole('button', { name: 'Save and use' }).click();
  await expect(page).toHaveURL(/\/settings#appearance$/);
  await expect(
    page
      .getByRole('group', { name: 'Dark theme' })
      .getByRole('radio', { name: /Midnight/ }),
  ).toBeChecked();
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(0, 0, 0)',
  );
  await expectAccessible(page);

  // theme-init.js paints it before the app loads.
  await page.reload();
  expect(await rootProperty(page, '--canvas')).toBe('#000000');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(0, 0, 0)',
  );

  await page.getByRole('link', { name: 'Edit Midnight' }).click();
  await expect(page).toHaveURL(/\/settings\/themes\/[\w-]+$/);
  await expect(page.getByRole('heading', { name: 'Edit theme' })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'Midnight',
  );
  await expectAccessible(page);
});

test('imports a theme file, refusing one with failing pairs', async ({
  page,
}) => {
  await page.goto('/settings#appearance');
  const file = (name: string, tokens: object) => ({
    name: `${name}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'allotr-theme',
        version: 1,
        name,
        scheme: 'dark',
        tokens,
      }),
    ),
  });
  const input = page.getByLabel('Import theme file');

  await input.setInputFiles(file('Faint', { ...darkTheme, ring: '#1b2a25' }));
  const problems = page.getByTestId('import-problems');
  await expect(problems).toContainText('“Faint.json” was not imported:');
  await expect(problems).toContainText(
    'Focus ring on Panel: 1.00:1, needs 3:1',
  );
  await expectAccessible(page);

  await input.setInputFiles(file('Ember', darkTheme));
  await expect(problems).toBeEmpty();
  await expect(page.getByRole('listitem', { name: 'Ember' })).toBeVisible();
});

test('deleting the theme in use goes back to the default', async ({ page }) => {
  await page.goto('/settings#appearance');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(0, 0, 0)',
  );
  await page.getByRole('button', { name: 'Delete Midnight' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete “Midnight”?' });
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('listitem', { name: 'Midnight' })).toHaveCount(0);
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(30, 30, 46)',
  );
  await expect.poll(() => rootProperty(page, '--canvas')).toBe('');
});
