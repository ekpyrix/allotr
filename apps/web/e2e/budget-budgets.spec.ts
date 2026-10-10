import { expect, test, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The Budget screen's budgets and cover order sub-tabs with made-up data.
// One instance per size: the first test creates the account and seeds it,
// later ones sign in through the API.
test.describe.configure({ mode: 'serial' });

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as { id: string };
}

async function apiSignIn(page: Page, origin: string) {
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
}

async function tooSmall(page: Page) {
  return page
    .locator('main a, main button, main [role=button]')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('button', { name: new RegExp(label) }).click();
  await page.getByRole('menuitemradio', { name: option }).click();
}

test('the budgets tab shows the tree, totals and cover', async ({
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
  const { available } = (await today.json()) as {
    available: { currency: string };
  };
  const money = (amountMinor: number) => ({
    amountMinor,
    currency: available.currency,
  });
  const food = await post(page, origin, '/v1/categories', {
    name: 'Household',
    kind: 'expense',
  });
  const groceries = await post(page, origin, '/v1/categories', {
    name: 'Pantry',
    kind: 'expense',
    parentId: food.id,
  });
  const dining = await post(page, origin, '/v1/categories', {
    name: 'Takeaway',
    kind: 'expense',
    parentId: food.id,
  });
  await post(page, origin, '/v1/categories', {
    name: 'Commute',
    kind: 'expense',
  });
  const everyday = await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency: available.currency,
    openingBalance: money(250_000),
  });
  await post(page, origin, '/v1/transactions', {
    kind: 'expense',
    accountId: everyday.id,
    amount: money(4_200),
    categoryId: groceries.id,
    note: 'Corner market',
  });
  for (const [name, id, amount] of [
    ['Pantry', groceries.id, 40_000],
    ['Takeaway', dining.id, 15_000],
  ] as const) {
    await post(page, origin, '/v1/budgets', {
      name,
      target: { kind: 'category', categoryId: id },
      amount: money(amount),
    });
  }

  await page.goto('/budget/budgets');
  const tree = page.getByRole('region', {
    name: t('budgetBudgets.tree.title'),
  });
  await expect(tree).toBeVisible();
  await expect(tree.getByText('Pantry', { exact: true })).toBeVisible();
  await expect(tree.getByText('Takeaway', { exact: true })).toBeVisible();
  await expect(
    tree.getByText(t('budgetBudgets.tree.totalDaily')),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: t('budgetBudgets.cover.title') }),
  ).toBeVisible();
  await expectAccessible(page);
  expect(await tooSmall(page)).toEqual([]);

  // Folding the parent hides its children.
  await page
    .getByRole('button', {
      name: t('budgetBudgets.tree.fold', { name: 'Household' }),
    })
    .click();
  await expect(tree.getByText('Pantry', { exact: true })).toHaveCount(0);
  await page
    .getByRole('button', {
      name: t('budgetBudgets.tree.fold', { name: 'Household' }),
    })
    .click();
  await expect(tree.getByText('Pantry', { exact: true })).toBeVisible();
});

test('a budget is added from the sheet', async ({ page, baseURL }) => {
  await apiSignIn(page, baseURL ?? '');
  await page.goto('/budget/budgets');
  await page.getByRole('button', { name: t('budgetBudgets.tree.add') }).click();
  const sheet = page.getByRole('dialog', {
    name: t('budgetBudgets.sheet.newTitle'),
  });
  await choose(page, t('budgetBudgets.sheet.category'), 'Commute');
  await sheet.getByLabel(/Amount per period/).fill('90.00');
  await sheet
    .getByRole('button', { name: t('budgetBudgets.sheet.create') })
    .click();
  await expect(sheet).toBeHidden();
  await expect(
    page
      .getByRole('region', { name: t('budgetBudgets.tree.title') })
      .getByText('Commute', { exact: true }),
  ).toBeVisible();
});

test('the cover order moves a source and previews an overspend', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL ?? '');
  await page.goto('/budget/cover-order');
  const list = page.getByRole('grid', {
    name: t('budgetBudgets.order.listLabel'),
  });
  const rows = list.getByRole('row');
  await expect(rows.first()).toBeVisible();
  const first = (await rows.first().innerText()).split('\n')[1] ?? '';
  await rows
    .first()
    .getByRole('button', {
      name: t('budgetBudgets.order.down', { name: first.trim() }),
    })
    .click();
  await expect(rows.nth(1)).toContainText(first.trim());
  await page.reload();
  await expect(rows.nth(1)).toContainText(first.trim());

  await choose(page, t('budgetBudgets.next.budget'), 'Pantry');
  await choose(page, t('budgetBudgets.next.account'), 'Everyday');
  await page.getByLabel(/^Amount \(/).fill('900.00');
  await expect(page.getByText(t('budgetBudgets.next.leftToday'))).toBeVisible();
  await expectAccessible(page);
  expect(await tooSmall(page)).toEqual([]);
});
