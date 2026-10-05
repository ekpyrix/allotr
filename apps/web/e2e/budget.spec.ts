import type { BudgetStatusView } from '@allotr/shared';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The Budget tab and the cover preview (ADR 0021), one instance per size.
// A $100.00 account, one set-aside budget holding all of it, so free money
// is zero and any spending reaches into the set-aside budget.
test.describe.configure({ mode: 'serial' });

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
const ids = { fun: '', groceries: '', eatingOut: '' };

async function created(api: APIRequestContext, path: string, data: object) {
  const response = await api.post(path, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as { id: string };
}

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
  await created(api, '/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
    openingBalance: usd(10_000),
  });
  const { categories } = (await (await api.get('/v1/categories')).json()) as {
    categories: { id: string; name: string }[];
  };
  const category = (name: string) =>
    categories.find((c) => c.name === name)?.id ?? '';
  ids.groceries = category('Groceries');
  ids.eatingOut = category('Eating out');
  const status = (await (
    await api.post('/v1/budgets', {
      data: {
        name: 'Fun money',
        target: { kind: 'category', categoryId: category('Fun') },
        amount: usd(10_000),
        mode: 'set-aside',
      },
    })
  ).json()) as BudgetStatusView;
  ids.fun = status.budgets.find((b) => b.name === 'Fun money')?.id ?? '';
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

async function status(page: Page): Promise<BudgetStatusView> {
  return (await (
    await page.request.get('/v1/budgets')
  ).json()) as BudgetStatusView;
}

test('shows the budgets, the cover order and the pools', async ({ page }) => {
  await page.goto('/budget');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Budget' }),
  ).toBeVisible();
  const budgets = page.getByRole('region', { name: 'Budgets' });
  await expect(
    budgets.getByRole('heading', { name: 'Fun money' }),
  ).toBeVisible();
  await expect(
    budgets
      .getByRole('listitem')
      .filter({ hasText: 'Fun money' })
      .getByTestId('budget-left'),
  ).toContainText('$100.00 left');
  await expect(
    page.getByRole('region', { name: 'Pools' }).getByRole('heading', {
      name: 'Savings',
    }),
  ).toBeVisible();
  await expectAccessible(page);
});

test('adds a daily budget', async ({ page }) => {
  await page.goto('/budget');
  await page.getByRole('button', { name: 'Add a budget' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a budget' });
  await dialog
    .getByLabel('Category')
    .selectOption({ label: 'Food / Groceries' });
  await dialog.getByLabel('Planned per period').fill('50');
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByRole('region', { name: 'Budgets' })
      .getByRole('heading', { name: 'Groceries' }),
  ).toBeVisible();
  const added = (await status(page)).budgets.find(
    (b) => b.name === 'Groceries',
  );
  expect(added?.mode).toBe('daily');
  expect(added?.planned.amountMinor).toBe(5000);
});

test('adds budgets in a row, each on the category chosen, and deletes them', async ({
  page,
}) => {
  await page.goto('/budget');
  const budgets = page.getByRole('region', { name: 'Budgets' });
  const add = async (category: string, name?: string) => {
    await page.getByRole('button', { name: 'Add a budget' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a budget' });
    await expect(dialog.getByLabel('Category')).toHaveValue('');
    await dialog.getByLabel('Planned per period').fill('10');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(
      dialog.getByText('Choose the category this budget counts.'),
    ).toBeVisible();
    await dialog.getByLabel('Category').selectOption({ label: category });
    if (name !== undefined) await dialog.getByLabel('Name').fill(name);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
  };
  await add('Health');
  await add('Shopping', 'Treats');

  const health = budgets.getByRole('listitem').filter({ hasText: 'Health' });
  await expect(health).toContainText('Counts Health');
  const treats = budgets.getByRole('listitem').filter({ hasText: 'Treats' });
  await expect(treats).toContainText('Counts Shopping');
  const targets = (await status(page)).budgets.filter(
    (b) => b.name === 'Health' || b.name === 'Treats',
  );
  expect(targets).toHaveLength(2);

  for (const name of ['Health', 'Treats']) {
    await page.getByRole('button', { name: `Edit ${name}` }).click();
    const dialog = page.getByRole('dialog', { name: `Edit ${name}` });
    await expectAccessible(page);
    await dialog.getByRole('button', { name: 'Delete this budget' }).click();
    await expect(dialog).toBeHidden();
    await expect(
      budgets.getByRole('heading', { name, exact: true }),
    ).toBeHidden();
  }
  expect(
    (await status(page)).budgets.some(
      (b) => b.name === 'Health' || b.name === 'Treats',
    ),
  ).toBe(false);
});

test('moves a cover source with the keyboard', async ({ page }) => {
  await page.goto('/budget');
  const handle = page.getByRole('button', { name: /^Buffer, position 2 of/u });
  await handle.focus();
  await page.keyboard.press('ArrowUp');
  await expect(
    page.getByRole('button', { name: /^Buffer, position 1 of/u }),
  ).toBeFocused();
  const { coverOrder } = await status(page);
  expect(coverOrder.map((i) => i.kind).slice(0, 2)).toEqual(['buffer', 'free']);
  await expectAccessible(page);
});

test('asks for a second tap when the cover reaches set-aside money', async ({
  page,
}) => {
  const before = (await (
    await page.request.get('/v1/transactions')
  ).json()) as {
    transactions: unknown[];
  };
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: 'Add an entry' });
  await expect(dialog).toBeVisible();
  await page.keyboard.type('20');
  await dialog
    .getByLabel('Category')
    .selectOption({ label: 'Food / Eating out' });
  const cover = dialog.getByRole('region', { name: 'Cover for this entry' });
  await expect(cover).toContainText('Takes $20.00 from');
  await expect(cover).toContainText('Tap Save again to confirm.');
  await expect(
    dialog.getByRole('button', { name: 'Save anyway' }),
  ).toBeVisible();
  await expectAccessible(page);

  await dialog.getByRole('button', { name: 'Save anyway' }).click();
  await expect(dialog).toBeVisible();
  const mid = (await (await page.request.get('/v1/transactions')).json()) as {
    transactions: unknown[];
  };
  expect(mid.transactions).toHaveLength(before.transactions.length);

  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  const after = (await (await page.request.get('/v1/transactions')).json()) as {
    transactions: unknown[];
  };
  expect(after.transactions).toHaveLength(before.transactions.length + 1);
});

test('shows how the entry was covered and the budgets on Today', async ({
  page,
}) => {
  const { transactions } = (await (
    await page.request.get('/v1/transactions?limit=1')
  ).json()) as { transactions: { id: string }[] };
  await page.goto(`/transactions?entry=${transactions[0]?.id ?? ''}`);
  const cover = page.getByRole('region', { name: 'Cover' });
  await expect(cover).toContainText('$20.00');
  await expect(
    cover.getByRole('button', { name: 'Change the split' }),
  ).toBeVisible();
  await expectAccessible(page);

  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Budgets' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Covered this period' }),
  ).toBeVisible();
  await expectAccessible(page);
});
