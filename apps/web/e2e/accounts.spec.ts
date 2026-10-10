import { expect, test, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The Accounts screen with made-up data: stats, the pool tree, sub-tabs,
// selection in the URL, and the rename and move actions.
test.describe.configure({ mode: 'serial' });

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as { id: string };
}

async function signIn(page: Page, origin: string) {
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
}

function actionsOf(page: Page, name: string) {
  return page.getByRole('button', {
    name: t('accountsScreen.list.actionsOf', { name }),
  });
}

function rowOf(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

test('the tree groups accounts by pool and credit, with stats', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await post(page, origin, '/v1/onboarding', account);
  const skip = await page.request.put('/v1/settings/setup', {
    data: setupSkipped,
    headers: { origin },
  });
  expect(skip.ok()).toBe(true);
  const today = await page.request.get('/v1/today');
  const currency = ((await today.json()) as { available: { currency: string } })
    .available.currency;
  const usd = (amountMinor: number) => ({ amountMinor, currency });

  await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency,
    openingBalance: usd(250_000),
  });
  await post(page, origin, '/v1/accounts', {
    name: 'Nest egg',
    currency,
    budgetGroup: 'off',
    openingBalance: usd(900_000),
  });
  await post(page, origin, '/v1/accounts', {
    name: 'Visa',
    kind: 'liability',
    currency,
    openingBalance: usd(-45_000),
  });
  await post(page, origin, '/v1/pools', { name: 'Trip', kind: 'spending' });

  await page.goto('/accounts');
  await expect(rowOf(page, 'Everyday')).toBeVisible();
  await expect(rowOf(page, 'Nest egg')).toBeVisible();
  await expect(rowOf(page, 'Visa')).toBeVisible();
  // Credit is its own group, not part of a pool.
  await expect(
    page.getByRole('button', {
      name: t('accountsScreen.list.fold', {
        name: t('accountsScreen.list.credit'),
      }),
    }),
  ).toBeVisible();
  await expect(
    page.getByText(t('accountsScreen.stats.netWorth')),
  ).toBeVisible();
  await expect(
    page.getByText(t('accountsScreen.stats.reconcileFigure', { count: 3 })),
  ).toBeVisible();
  await expectAccessible(page);

  const small = await page
    .locator('main a, main button, main [role=button]')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
  expect(small).toEqual([]);
});

test('a sub-tab narrows the tree', async ({ page, baseURL }) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/accounts/credit');
  await expect(rowOf(page, 'Visa')).toBeVisible();
  await expect(rowOf(page, 'Everyday')).toHaveCount(0);

  await page.goto('/accounts/off-budget');
  await expect(rowOf(page, 'Nest egg')).toBeVisible();
  await expect(rowOf(page, 'Visa')).toHaveCount(0);
});

test('choosing an account puts it in the address', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/accounts');
  await rowOf(page, 'Everyday').click();
  await expect(page).toHaveURL(/\/accounts\?account=/);
});

test('rename changes the name in the tree', async ({ page, baseURL }) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/accounts');
  await actionsOf(page, 'Everyday').click();
  await page
    .getByRole('menuitem', { name: t('accountsScreen.menu.rename') })
    .click();
  const field = page.getByRole('textbox', {
    name: t('accountsScreen.rename.name'),
  });
  await field.fill('Daily spending');
  await page
    .getByRole('button', { name: t('accountsScreen.rename.save') })
    .click();
  await expect(rowOf(page, 'Daily spending')).toBeVisible();
  await expect(rowOf(page, 'Everyday')).toHaveCount(0);
});

test('an empty name is refused', async ({ page, baseURL }) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/accounts');
  await actionsOf(page, 'Daily spending').click();
  await page
    .getByRole('menuitem', { name: t('accountsScreen.menu.rename') })
    .click();
  await page
    .getByRole('textbox', { name: t('accountsScreen.rename.name') })
    .fill('  ');
  await page
    .getByRole('button', { name: t('accountsScreen.rename.save') })
    .click();
  await expect(
    page.getByText(t('accountsScreen.rename.nameRequired')),
  ).toBeVisible();
});

test('moving an account to another pool regroups it, by keyboard', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/accounts');
  const trigger = actionsOf(page, 'Daily spending');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('menuitem', { name: t('accountsScreen.menu.move') })
    .focus();
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: /Pool/ }).click();
  await page.getByRole('menuitemradio', { name: 'Trip' }).click();
  await page
    .getByRole('button', { name: t('accountsScreen.move.save') })
    .click();
  await expect(
    page.getByRole('button', {
      name: t('accountsScreen.list.fold', { name: 'Trip' }),
    }),
  ).toBeVisible();
});
