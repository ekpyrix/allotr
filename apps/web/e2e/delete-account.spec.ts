import { readFileSync } from 'node:fs';
import { findPaletteTheme } from '@allotr/shared';
import {
  expect,
  test,
  type APIRequest,
  type APIRequestContext,
} from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';
import { totpFromUri } from './totp.ts';

// Account deletion from settings (FR-U3), one instance per size. The admin
// onboards and invites a second user with 2FA and a ledger; the admin is
// refused while that user exists, and the user deletes their account and
// lands signed out on the sign-in page. Names are made up.
test.describe.configure({ mode: 'serial' });

const member = {
  name: 'Riley Example',
  email: 'riley@example.test',
  password: 'another horse battery staple',
};

const bundle: unknown = JSON.parse(
  readFileSync(
    new URL(
      '../../../testdata/synthetic/single-currency-month/bundle.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

let totpURI = '';

function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

function context(
  playwright: { request: { newContext: APIRequest['newContext'] } },
  baseURL: string,
): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
}

test.beforeAll(async ({ playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL ?? '';
  const admin = await context(playwright, baseURL);
  expect((await admin.post('/v1/onboarding', { data: account })).ok()).toBe(
    true,
  );
  await admin.put('/v1/settings/setup', { data: setupSkipped });
  const invite = await admin.post('/v1/invites', { data: {} });
  const { url } = (await invite.json()) as { url: string };
  await admin.dispose();

  const riley = await context(playwright, baseURL);
  const token = new URL(url).pathname.split('/').pop() ?? '';
  expect(
    (await riley.post(`/v1/invites/${token}/accept`, { data: member })).ok(),
  ).toBe(true);
  const imported = await riley.post('/v1/import', { data: bundle });
  expect(imported.status(), await imported.text()).toBe(201);
  const enable = await riley.post('/v1/auth/two-factor/enable', {
    data: { password: member.password },
  });
  ({ totpURI } = (await enable.json()) as { totpURI: string });
  expect(
    (
      await riley.post('/v1/auth/two-factor/verify-totp', {
        data: { code: totpFromUri(totpURI) },
      })
    ).ok(),
  ).toBe(true);
  await riley.dispose();
});

test('the only admin is refused while others use the instance', async ({
  page,
  baseURL,
}) => {
  const signIn = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(signIn.ok()).toBe(true);

  await page.goto('/settings#delete-account');
  await expect(
    page.getByRole('heading', { level: 3, name: 'Delete account' }),
  ).toBeFocused();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Delete account…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
  await expect(dialog).toBeVisible();
  // Without 2FA only the password is asked for.
  await expect(dialog.getByLabel('Code from the app')).toHaveCount(0);
  await expectAccessible(page);

  await dialog.getByLabel('Your password').fill(account.password);
  await dialog
    .getByRole('button', { name: 'Delete my account and data' })
    .click();
  await expect(dialog.getByRole('alert')).toHaveText(
    /only administrator and other people use this instance/,
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Delete account…' }),
  ).toBeFocused();
});

// Destructive text sits on the outline button's hover fill; axe reads the
// hovered state. A spread of dark themes is checked: the default, the
// palettes whose reds fit the most, and the converted Allotr themes.
const darkThemes = [
  'catppuccin-mocha',
  'catppuccin-frappe',
  'solarized-dark',
  'nord',
  'allotr-classic-dark',
  'high-contrast-dark',
  'harbour',
];

test('destructive buttons keep contrast on hover in dark themes', async ({
  page,
  baseURL,
}) => {
  // Two axe runs per dark theme on the settings page, which also holds
  // a live preview of every theme family.
  test.setTimeout(240_000);
  const origin = { origin: baseURL ?? '' };
  const signIn = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: origin,
  });
  expect(signIn.ok()).toBe(true);

  for (const id of darkThemes) {
    const theme = findPaletteTheme(id, []);
    if (theme === undefined) throw new Error(`No theme ${id}`);
    const saved = await page.request.put('/v1/settings/appearance', {
      data: { mode: 'dark', dark: theme.id },
      headers: origin,
    });
    expect(saved.ok(), theme.id).toBe(true);
    // A fresh load: the same URL again would only move to the hash.
    await page.goto('about:blank');
    await page.goto('/settings#delete-account');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      rgb(theme.resolved.roles.canvas),
    );
    const open = page.getByRole('button', { name: 'Delete account…' });
    await open.hover();
    await expectAccessible(page);

    await open.click();
    const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
    await dialog
      .getByRole('button', { name: 'Delete my account and data' })
      .hover();
    await expectAccessible(page);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  }
});

test('a user deletes their account and lands on sign-in', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(member.email);
  await page.getByLabel('Password').fill(member.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Code').fill(totpFromUri(totpURI));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/settings#delete-account');
  await page.getByRole('button', { name: 'Delete account…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
  await expect(
    dialog.getByRole('link', { name: 'Download backup (JSON)' }),
  ).toBeVisible();

  await dialog.getByLabel('Your password').fill(member.password);
  const code = dialog.getByLabel('Code from the app');
  const right = totpFromUri(totpURI);
  await code.fill(right === '000000' ? '111111' : '000000');
  const confirm = dialog.getByRole('button', {
    name: 'Delete my account and data',
  });
  await confirm.click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'The code is wrong or has already been used.',
  );

  await code.fill(totpFromUri(totpURI));
  await confirm.click();
  await expect(page).toHaveURL(/\/sign-in\?deleted=true$/);
  await expect(
    page.getByText('Your account and all its data have been deleted.'),
  ).toBeVisible();
  await expectAccessible(page);

  // Signed out, and the account no longer exists.
  expect((await page.request.get('/v1/session')).status()).toBe(401);
  await page.getByLabel('Email').fill(member.email);
  await page.getByLabel('Password').fill(member.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).not.toBeEmpty();
  await expect(page).toHaveURL(/\/sign-in/);
});
