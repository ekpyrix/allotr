import type { CalendarView, TodayView } from '@allotr/shared';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The Reports calendar and the Dashboard's next 7 days, one instance per
// size. A $30 meal today, a $200 rent payment linked to a bill (left out of
// the heat) and the bill itself due today.
test.describe.configure({ mode: 'serial' });

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });
let todayDate = '';

async function created(api: APIRequestContext, path: string, data: object) {
  const response = await api.post(path, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { id: string }).id;
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
  const everyday = await created(api, '/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
    openingBalance: usd(500_000),
  });
  const { categories } = (await (await api.get('/v1/categories')).json()) as {
    categories: { id: string; name: string }[];
  };
  const category = (name: string) =>
    categories.find((c) => c.name === name)?.id ?? '';
  todayDate = ((await (await api.get('/v1/today')).json()) as TodayView).today;
  await created(api, '/v1/transactions', {
    kind: 'expense',
    accountId: everyday,
    amount: usd(3_000),
    categoryId: category('Eating out'),
  });
  const rentEntry = await created(api, '/v1/transactions', {
    kind: 'expense',
    accountId: everyday,
    amount: usd(20_000),
    categoryId: category('Housing'),
  });
  const bill = await created(api, '/v1/bills', {
    name: 'Rent',
    amount: usd(20_000),
    dueDay: Number(todayDate.slice(8)),
    accountId: everyday,
    categoryId: category('Housing'),
  });
  expect(
    (
      await api.post(`/v1/bills/${bill}/payments`, {
        data: { dueOn: todayDate, paidOn: todayDate, transactionId: rentEntry },
      })
    ).ok(),
  ).toBe(true);
  await created(api, '/v1/bills', {
    name: 'Phone',
    amount: usd(3_000),
    dueDay: Number(todayDate.slice(8)),
    accountId: everyday,
    categoryId: category('Housing'),
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

const cell = (page: Page) =>
  page.locator(`[data-testid="calendar-day"][data-date="${todayDate}"]`);

test('both layers are on, and today has its heat and its dues in words', async ({
  page,
}) => {
  await page.goto('/reports?tab=calendar');
  const calendar = page.getByTestId('calendar');
  await expect(
    calendar.getByRole('switch', { name: 'Spending heat' }),
  ).toBeChecked();
  await expect(
    calendar.getByRole('switch', { name: 'Bills and dues' }),
  ).toBeChecked();
  await expect(cell(page)).toBeVisible();
  // The linked rent payment is not in the heat: only the $30 meal.
  await expect(cell(page)).toHaveAttribute('aria-label', /Spent \$30\.00/u);
  await expect(cell(page)).toHaveAttribute('data-heat', '4');
  await expect(cell(page)).toHaveAttribute(
    'aria-label',
    /Phone due, \$30\.00/u,
  );
  await expect(cell(page)).toHaveAttribute(
    'aria-label',
    /Rent paid, \$200\.00/u,
  );
  const api = (await (
    await page.request.get(
      `/v1/reports/calendar?from=${todayDate}&to=${todayDate}`,
    )
  ).json()) as CalendarView;
  expect(api.days[0]?.spent).toEqual(usd(3_000));
  await expectAccessible(page);
});

test('each layer switches off on its own', async ({ page }) => {
  await page.goto('/reports?tab=calendar');
  const calendar = page.getByTestId('calendar');
  await calendar.getByRole('switch', { name: 'Spending heat' }).click();
  await expect(cell(page)).not.toHaveAttribute('aria-label', /Spent/u);
  await expect(cell(page)).toHaveAttribute('aria-label', /Phone due/u);
  await calendar.getByRole('switch', { name: 'Bills and dues' }).click();
  await expect(cell(page)).not.toHaveAttribute('aria-label', /Phone due/u);
  await calendar.getByRole('switch', { name: 'Spending heat' }).click();
  await expect(cell(page)).toHaveAttribute('aria-label', /Spent \$30\.00/u);
});

test('tapping a day lists its entries', async ({ page }) => {
  await page.goto('/reports?tab=calendar');
  await cell(page).click();
  const detail = page.getByTestId('calendar-detail');
  await expect(detail).toContainText('Spent $30.00');
  await expect(detail).toContainText('Phone due');
  await expect(detail.getByRole('link').first()).toBeVisible();
  await expectAccessible(page);
});

test('the same days are available as a table', async ({ page }) => {
  await page.goto('/reports?tab=calendar');
  await page.getByRole('button', { name: 'Show as table' }).click();
  const table = page.getByRole('table');
  const { days } = (await (
    await page.request.get('/v1/reports/calendar')
  ).json()) as CalendarView;
  await expect(table.getByRole('row')).toHaveCount(days.length + 1);
  await expect(table).toContainText('$30.00');
  await expectAccessible(page);
});

test('the Dashboard lists what is due in the next 7 days', async ({ page }) => {
  await page.goto('/');
  const strip = page.getByRole('region', { name: 'Next 7 days' });
  await expect(strip).toContainText('Phone due, $30.00');
  await expectAccessible(page);
  await strip.getByRole('link', { name: 'Open the calendar' }).click();
  await expect(page).toHaveURL(/tab=calendar/u);
});
