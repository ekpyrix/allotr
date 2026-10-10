import { expect, test, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The account detail on /accounts?account=ID, with made-up data. The
// accounts screen owns the selection, so these specs open an account by its
// address; they need that screen to mount the detail.
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

let currency = 'USD';
let everydayId = '';
let spareId = '';

function detail(page: Page, name: string) {
  return page.getByRole('region', { name, exact: true });
}

async function noSmallTargets(scope: ReturnType<Page['locator']>) {
  const small = await scope
    .locator('a, button, [role=button], input')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
  expect(small).toEqual([]);
}

test('an account shows its balance, history, pool and recent entries', async ({
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
  currency = ((await today.json()) as { available: { currency: string } })
    .available.currency;
  const usd = (amountMinor: number) => ({ amountMinor, currency });

  const category = await post(page, origin, '/v1/categories', {
    name: 'Treats',
    kind: 'expense',
  });
  const everyday = await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency,
    openingBalance: usd(250_000),
  });
  everydayId = everyday.id;
  const spare = await post(page, origin, '/v1/accounts', {
    name: 'Spare change',
    currency,
    budgetGroup: 'off',
    openingBalance: usd(10_000),
  });
  spareId = spare.id;
  for (const amountMinor of [380, 450]) {
    await post(page, origin, '/v1/transactions', {
      kind: 'expense',
      accountId: everydayId,
      amount: usd(amountMinor),
      categoryId: category.id,
      note: 'Corner cafe',
    });
  }

  await page.goto(`/accounts?account=${everydayId}`);
  const pane = detail(page, 'Everyday');
  await expect(pane).toBeVisible();
  await expect(pane).toContainText('2,491.70');
  await expect(
    pane.getByRole('img', { name: /Balance of Everyday/ }),
  ).toBeVisible();
  await expect(pane.getByText(t('accountDetail.groups.on'))).toBeVisible();
  await expect(pane.getByText(t('accounts.neverReconciled'))).toBeVisible();
  const recent = pane.getByRole('region', {
    name: t('accountDetail.recent.title'),
  });
  await expect(recent.getByRole('button')).toHaveCount(3);
  await expectAccessible(page);
  await noSmallTargets(pane);
});

test('reconciling a different balance shows the difference and adjusts', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto(`/accounts?account=${everydayId}`);
  const pane = detail(page, 'Everyday');
  await pane
    .getByRole('button', { name: t('accountDetail.actions.reconcile') })
    .click();
  const sheet = page.getByRole('dialog', {
    name: t('accounts.reconcileFlow.title', { name: 'Everyday' }),
  });
  await expect(sheet).toBeVisible();
  await expectAccessible(page);

  // Keyboard only: the balance field has focus, Enter compares.
  await page.keyboard.type('2400.00');
  await page.keyboard.press('Enter');
  await expect(sheet).toContainText('91.70');
  await expect(sheet).toContainText('Unrecorded');
  await expectAccessible(page);
  await sheet
    .getByRole('button', { name: t('accounts.reconcileFlow.adjust') })
    .click();
  await expect(
    sheet.getByText(t('accounts.announce.adjusted', { name: 'Everyday' })),
  ).toBeVisible();
  await sheet
    .getByRole('button', { name: t('accounts.close') })
    .first()
    .click();
  await expect(sheet).toBeHidden();
  await expect(pane).toContainText('2,400.00');
  await expect(pane).not.toContainText(t('accounts.neverReconciled'));
});

test('the reconcile sheet rejects an empty balance', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto(`/accounts?account=${everydayId}`);
  await detail(page, 'Everyday')
    .getByRole('button', { name: t('accountDetail.actions.reconcile') })
    .click();
  const sheet = page.getByRole('dialog');
  await sheet
    .getByRole('button', { name: t('accounts.reconcileFlow.check') })
    .click();
  await expect(
    sheet.getByText(t('accounts.reconcileFlow.errors.balanceRequired')),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('archiving moves the balance to another account first', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto(`/accounts?account=${everydayId}`);
  const pane = detail(page, 'Everyday');
  await pane
    .getByRole('button', { name: t('accountDetail.actions.archive') })
    .click();
  const sheet = page.getByRole('dialog', {
    name: t('accounts.archiveFlow.title', { name: 'Everyday' }),
  });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('2,400.00');
  // Savings are never counted, so the server warns that today's figure drops.
  await sheet
    .getByRole('button', { name: t('accounts.archiveFlow.transferTo') })
    .click();
  await page.getByRole('menuitemradio', { name: 'Spare change' }).click();
  await expect(
    sheet
      .getByText(/Today’s figure drops by/)
      .or(sheet.getByText(/counts as savings/)),
  ).toBeVisible();
  await expectAccessible(page);
  await noSmallTargets(sheet);
  await sheet
    .getByRole('button', { name: t('accounts.archiveFlow.confirmTransfer') })
    .click();
  await expect(sheet).toBeHidden();
  await expect(pane.getByText(t('accountDetail.tags.archived'))).toBeVisible();
  await expect(
    pane.getByRole('button', { name: t('accountDetail.actions.archive') }),
  ).toHaveCount(0);

  const spare = await page.request.get('/v1/accounts');
  const list = (await spare.json()) as {
    accounts: { id: string; balance: { amountMinor: number } }[];
  };
  expect(list.accounts.find((a) => a.id === spareId)?.balance.amountMinor).toBe(
    250_000,
  );
});
