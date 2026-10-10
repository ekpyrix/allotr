import { expect, test, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// Reports · calendar with a little made-up data: an entry today and a bill
// due today (or on the 28th late in the month). One instance per size.
test.describe.configure({ mode: 'serial' });

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as { id: string };
}

const longDay = new Intl.DateTimeFormat('en', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

function dayCell(page: Page, date: string) {
  const label = longDay.format(new Date(`${date}T00:00:00Z`));
  return page.getByRole('button', { name: new RegExp(`^${label}`) });
}

async function smallTargets(page: Page) {
  return page
    .locator('main a, main button, main [role=button]')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
}

test('the calendar shows the month, a picked day and opens its entry', async ({
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

  const todayResponse = await page.request.get('/v1/today');
  const { available, today } = (await todayResponse.json()) as {
    available: { currency: string };
    today: string;
  };
  const usd = (amountMinor: number) => ({
    amountMinor,
    currency: available.currency,
  });
  const groceries = await post(page, origin, '/v1/categories', {
    name: 'Groceries',
    kind: 'expense',
    icon: 'beer',
  });
  const everyday = await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency: available.currency,
    openingBalance: usd(250_000),
  });
  await post(page, origin, '/v1/transactions', {
    kind: 'expense',
    accountId: everyday.id,
    amount: usd(4_200),
    categoryId: groceries.id,
    note: 'Corner market',
  });
  const dueDay = Math.min(28, Number(today.slice(8)));
  const dueDate = `${today.slice(0, 8)}${String(dueDay).padStart(2, '0')}`;
  await post(page, origin, '/v1/bills', {
    name: 'Rent',
    amount: usd(90_000),
    accountId: everyday.id,
    dueDay,
  });

  await page.goto('/reports/calendar');
  const month = page.getByRole('region', { name: t('reportsCalendar.title') });
  await expect(month).toBeVisible();
  // Today is picked: its entry is listed.
  const day = page.getByRole('region', {
    name: t('reportsCalendar.day.title'),
  });
  await expect(day.getByText('Corner market')).toBeVisible();

  // The bill's day lists it.
  await dayCell(page, dueDate).click();
  await expect(day.getByText('Rent')).toBeVisible();

  // Layers toggle by keyboard.
  const heat = month.getByRole('button', {
    name: t('reportsCalendar.layers.heat'),
  });
  await expect(heat).toHaveAttribute('aria-pressed', 'true');
  await heat.focus();
  await page.keyboard.press('Space');
  await expect(heat).toHaveAttribute('aria-pressed', 'false');

  // The table view lists every day.
  await month.getByRole('button', { name: t('reportsCalendar.table') }).click();
  await expect(month.getByRole('table')).toBeVisible();
  await month.getByRole('button', { name: t('reportsCalendar.grid') }).click();

  // Stepping back a month: its first day has nothing on it.
  await month
    .getByRole('button', { name: t('reportsCalendar.month.previous') })
    .click();
  await expect(day.getByText(t('reportsCalendar.day.nothing'))).toBeVisible();
  await month
    .getByRole('button', { name: t('reportsCalendar.month.next') })
    .click();

  expect(await smallTargets(page)).toEqual([]);
  await expectAccessible(page);

  // An entry row opens it in Transactions.
  await dayCell(page, today).click();
  await day.getByRole('button', { name: /Corner market/ }).click();
  await expect(page).toHaveURL(/\/transactions\?.*entry=/);
});
