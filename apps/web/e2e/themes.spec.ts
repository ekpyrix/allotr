import { darkTheme, findPaletteTheme, toThemeFile } from '@allotr/shared';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// Theme families, the palette editor and importers (FR-W5, ADR 0016–0017),
// one instance per size. The mode is set to Dark first, so both sizes
// paint the dark slot whatever the device.
test.describe.configure({ mode: 'serial' });

const fixtures = new URL(
  '../src/features/themes/importers/fixtures/',
  import.meta.url,
);

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

function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

function canvasOf(id: string): string {
  const theme = findPaletteTheme(id, []);
  if (theme === undefined) throw new Error(`no theme ${id}`);
  return theme.resolved.roles.canvas;
}

async function chooseMode(page: Page, name: 'Light' | 'Dark') {
  const group = page.getByRole('group', { name: 'Theme', exact: true });
  await group.getByText(name, { exact: true }).click();
  await expect(group.getByRole('radio', { name })).toBeChecked();
}

test('picks a theme family for both slots and keeps it', async ({ page }) => {
  await page.goto('/settings#appearance');
  await chooseMode(page, 'Dark');
  const families = page.getByRole('group', { name: 'Theme family' });
  await families.getByText('Nord', { exact: true }).click();
  await expect(families.getByRole('radio', { name: /Nord/ })).toBeChecked();
  const nord = canvasOf('nord');
  await expect(page.locator('body')).toHaveCSS('background-color', rgb(nord));
  await expectAccessible(page);

  // theme-init.js paints it before the app runs: with the app's scripts
  // blocked, the colours are already there.
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.reload();
  expect(await rootProperty(page, '--canvas')).toBe(nord);
  await page.unroute('**/assets/*.js');
  await page.reload();

  // Back on the default family, the stylesheet paints it: no overrides.
  await families.getByText('Catppuccin', { exact: true }).click();
  await expect.poll(() => rootProperty(page, '--canvas')).toBe('');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    rgb(canvasOf('catppuccin-mocha')),
  );
});

test('chooses a flavour per slot and credits it', async ({ page }) => {
  await page.goto('/settings#appearance');
  await page.getByText('Choose a flavour for each mode').click();
  await page.getByLabel('Dark theme').selectOption({ label: 'Rosé Pine Moon' });
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    rgb(canvasOf('rose-pine-moon')),
  );
  const credit = findPaletteTheme('rose-pine-moon', [])?.credit;
  await expect(page.getByTestId('theme-credits')).toContainText(
    `Rosé Pine Moon, by ${credit?.author ?? ''} (${credit?.licence ?? ''})`,
  );
  await expectAccessible(page);
  await page
    .getByLabel('Dark theme')
    .selectOption({ label: 'Catppuccin Mocha' });
  await expect.poll(() => rootProperty(page, '--canvas')).toBe('');
});

test('creates a palette theme, fits a role, applies it and keeps it after a reload', async ({
  page,
}) => {
  await page.goto('/settings#appearance');
  await page.getByRole('link', { name: 'Create theme' }).click();
  await expect(page).toHaveURL(/\/settings\/themes\/new$/);
  await expect(page.getByRole('heading', { name: 'New theme' })).toBeVisible();
  await page
    .getByLabel('Start from')
    .selectOption({ label: 'Catppuccin Mocha (Dark)' });
  await page.getByLabel('Name', { exact: true }).fill('Midnight');
  await page
    .getByRole('textbox', { name: 'base', exact: true })
    .fill('#000000');
  // The preview takes the draft; the page around it does not.
  await expect(page.getByTestId('theme-preview')).toHaveCSS(
    'background-color',
    'rgb(0, 0, 0)',
  );
  expect(await rootProperty(page, '--canvas')).toBe('');
  await expectAccessible(page);

  await page.getByRole('tab', { name: 'Roles' }).click();
  await page
    .getByLabel('Secondary text colour')
    .selectOption({ label: 'surface2' });
  // Fitted: the swatch shows the colour before and after.
  const row = page.locator('[data-role="text-muted"]');
  await expect(row.getByTestId('split-swatch')).toBeVisible();
  await expect(page.getByTestId('contrast-summary')).toContainText(
    'Every role meets WCAG 2.2 AA.',
  );

  // Without fitting it fails, and the problem says where it comes from.
  await page
    .getByRole('switch', { name: 'Adjust Secondary text for contrast' })
    .click();
  await expect(page.getByTestId('contrast-failures')).toContainText(
    '/roles/text-muted Secondary text on',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Fix the problems listed under Contrast before saving.',
  );
  await expect(page).toHaveURL(/\/settings\/themes\/new$/);

  // The preview paints the failing draft as it is, so axe runs once the
  // role is fitted again.
  await page
    .getByRole('switch', { name: 'Adjust Secondary text for contrast' })
    .click();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Save and use' }).click();
  await expect(page).toHaveURL(/\/settings#appearance$/);
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(0, 0, 0)',
  );

  // theme-init.js paints it before the app loads.
  await page.reload();
  expect(await rootProperty(page, '--canvas')).toBe('#000000');

  await page.getByRole('link', { name: 'Edit Midnight' }).click();
  await expect(page.getByRole('heading', { name: 'Edit theme' })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'Midnight',
  );
  await expect(
    page.getByRole('textbox', { name: 'base', exact: true }),
  ).toHaveValue('#000000');
});

test('imports each file shape', async ({ page }) => {
  // Eight files through the editor and back: slow under a full run.
  test.setTimeout(90_000);
  await page.goto('/settings#appearance');
  const input = page.getByLabel('Import theme file');
  const problems = page.getByTestId('import-problems');

  // One theme in any shape opens in the editor, named from the file.
  for (const [file, name] of [
    ['meadow-base16.yaml', 'Meadow Night'],
    ['meadow-base24.yaml', 'Meadow Night 24'],
    ['meadow-terminal.json', 'Meadow Night'],
    ['meadow.toml', 'meadow'],
    ['meadow.conf', 'meadow'],
    ['meadow.plist', 'meadow'],
    ['meadow-palette.json', 'meadow-palette'],
  ] as const) {
    await input.setInputFiles(new URL(file, fixtures).pathname);
    await expect(page, file).toHaveURL(/\/settings\/themes\/new$/);
    await expect(page.getByLabel('Name', { exact: true }), file).toHaveValue(
      name,
    );
    await expect(page.getByTestId('contrast-summary'), file).toContainText(
      'Every role meets WCAG 2.2 AA.',
    );
    await page.getByRole('link', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/settings#appearance$/);
  }

  // An Allotr theme file opens as it is.
  await input.setInputFiles({
    name: 'ember.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify(
        toThemeFile({ name: 'Ember', scheme: 'dark', tokens: darkTheme }),
      ),
    ),
  });
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ember');
  await expectAccessible(page);
  await page.getByRole('link', { name: 'Cancel' }).click();

  // A family of flavours is added at once.
  await input.setInputFiles(new URL('meadow-flavours.json', fixtures).pathname);
  await expect(problems).toBeEmpty();
  for (const name of [
    'Meadow Dawn',
    'Meadow Day',
    'Meadow Dusk',
    'Meadow Night',
  ])
    await expect(page.getByRole('listitem', { name })).toBeVisible();

  // Anything else is refused with a reason.
  await input.setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('just some words'),
  });
  await expect(problems).toContainText('“notes.txt” was not imported:');
  await expect(problems).toContainText(
    'not a theme file, palette file or terminal colour config',
  );
  await expectAccessible(page);
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
  await expect.poll(() => rootProperty(page, '--canvas')).toBe('');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    rgb(canvasOf('catppuccin-mocha')),
  );
});

test('device settings: motion, density and celebrations', async ({ page }) => {
  await page.goto('/settings#appearance');
  const motion = page.getByRole('radiogroup', { name: 'Motion' });
  await motion.getByRole('radio', { name: 'Off' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await expect(
    page.getByRole('switch', { name: 'Celebrations' }),
  ).toBeDisabled();
  await expect(page.locator('main')).toContainText(
    'Off while motion is reduced or off.',
  );
  await page
    .getByRole('radiogroup', { name: 'Density' })
    .getByRole('radio', { name: 'Compact' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expectAccessible(page);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await motion.getByRole('radio', { name: 'System' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-motion');
});
