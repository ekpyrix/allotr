import type { IouListView } from '@allotr/shared';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// IOUs in Budget, splitting with people in the entry sheet and the
// Dashboard's needs-attention items, one instance per size.
test.describe.configure({ mode: 'serial' });

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

async function created(api: APIRequestContext, path: string, data: object) {
  const response = await api.post(path, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { id: string }).id;
}

/** A calendar day some days back, in the browser's own calendar. */
function daysAgo(days: number): string {
  const day = new Date(Date.now() - days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(day.getFullYear())}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
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
    openingBalance: usd(100_000),
  });
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

async function ious(page: Page): Promise<IouListView> {
  return (await (await page.request.get('/v1/ious')).json()) as IouListView;
}

const section = (page: Page) => page.getByRole('region', { name: 'IOUs' });

test('lends money with a due date that has passed', async ({ page }) => {
  await page.goto('/budget');
  await section(page).getByRole('button', { name: 'Lend or borrow' }).click();
  const sheet = page.getByRole('dialog', { name: 'Lend or borrow' });
  await sheet.getByLabel('Person').fill('Alex Example');
  await sheet.getByLabel('Amount', { exact: true }).fill('40');
  await sheet.getByLabel('Due on').fill(daysAgo(10));
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Record it' }).click();
  await expect(sheet).toBeHidden();

  const row = section(page)
    .getByTestId('iou-row')
    .filter({ hasText: 'Alex Example' });
  await expect(row).toContainText('Owes you');
  await expect(row).toContainText('10 days overdue');
  await expect(section(page).getByTestId('iou-totals')).toContainText(
    'Owed to you $40.00',
  );
  const list = await ious(page);
  expect(list.totals.owedToMe.amountMinor).toBe(4000);
  await expectAccessible(page);

  await page.goto('/');
  await expect(
    page.getByText('Alex Example owes you $40.00, 10 days overdue.'),
  ).toBeVisible();
  await expectAccessible(page);
});

test('records a part repayment', async ({ page }) => {
  await page.goto('/budget');
  await page
    .getByRole('button', { name: 'Record repayment Alex Example' })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Repayment: Alex Example' });
  await sheet.getByLabel('Amount repaid').fill('15');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Record repayment' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    section(page).getByTestId('iou-row').filter({ hasText: 'Alex Example' }),
  ).toContainText('$25.00');
  expect((await ious(page)).totals.owedToMe.amountMinor).toBe(2500);
});

test('writes off what is left, any time', async ({ page }) => {
  await page.goto('/budget');
  await page.getByRole('button', { name: 'Write off Alex Example' }).click();
  const sheet = page.getByRole('dialog', { name: 'Write off: Alex Example' });
  await expect(sheet).toContainText('you can do it any time');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Write off', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(section(page).getByTestId('iou-row')).toHaveCount(0);
  expect((await ious(page)).totals.owedToMe.amountMinor).toBe(0);
});

test('splits an expense with people from the entry sheet', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: 'Add an entry' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Amount in USD').fill('30');
  await dialog
    .getByLabel('Category')
    .selectOption({ label: 'Food / Eating out' });
  await dialog.getByLabel('Split this with people').check();
  await dialog.getByLabel('Person 1', { exact: true }).fill('Sam Example');
  await dialog.getByLabel('Person 1 owes').fill('30');
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  const list = await ious(page);
  expect(list.ious.map((i) => i.person)).toEqual(['Sam Example']);
  expect(list.totals.owedToMe.amountMinor).toBe(3000);
});

test('a split line without a name is refused next to the field', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: 'Add an entry' });
  await dialog.getByLabel('Amount in USD').fill('10');
  await dialog
    .getByLabel('Category')
    .selectOption({ label: 'Food / Eating out' });
  await dialog.getByLabel('Split this with people').check();
  await dialog.getByLabel('Person 1 owes').fill('10');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByText('Enter a name.')).toBeVisible();
  expect((await ious(page)).ious).toHaveLength(1);
});
