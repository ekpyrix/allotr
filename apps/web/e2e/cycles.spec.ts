import { readFileSync } from 'node:fs';
import {
  formatMoney,
  money,
  type CycleDayListView,
  type CycleDetailView,
  type Money,
} from '@allotr/shared';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';

// Cycle and history views (FR-W2, FR-C6), one instance per size.
// The first hook onboards and imports the single-currency-month fixture,
// so the 1–24 March cycle is closed whatever today's date is, and its
// figures must match the replay's hand-worked checkpoint.
test.describe.configure({ mode: 'serial' });

const fixture = new URL(
  '../../../testdata/synthetic/single-currency-month/',
  import.meta.url,
);
const bundle: unknown = JSON.parse(
  readFileSync(new URL('bundle.json', fixture), 'utf8'),
);
type ExpectedCycle = {
  openedOn: string;
  closedOn: string | null;
  income: Money;
  spending: Money;
  leftover: Money;
  savingsNetChange: Money;
  amended: boolean;
};
const replay = JSON.parse(
  readFileSync(new URL('replay.json', fixture), 'utf8'),
) as { checkpoints: { cycles?: ExpectedCycle[] }[] };
const march = replay.checkpoints
  .flatMap((checkpoint) => checkpoint.cycles ?? [])
  .find((cycle) => cycle.openedOn === '2026-03-01');
if (march === undefined) throw new Error('the fixture has no March cycle');

const eur = (amountMinor: number) => money(amountMinor, 'EUR');
let locale = 'en-US';

test.beforeAll(async ({ playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL ?? '';
  const api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
  expect((await api.post('/v1/onboarding', { data: account })).ok()).toBe(true);
  const imported = await api.post('/v1/import', { data: bundle });
  expect(imported.status(), await imported.text()).toBe(201);
  const settings = (await (await api.get('/v1/settings/ledger')).json()) as {
    locale: string;
  };
  locale = settings.locale;
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

const marchRow = (page: Page) => page.locator('[data-cycle="2026-03-01"]');

test('history shows the past cycle as the replay worked it out', async ({
  page,
}) => {
  await page.goto('/reports/history');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Past cycles' }),
  ).toBeVisible();
  const row = marchRow(page);
  await expect(row.getByRole('link')).toHaveText(/Mar 1\s–\s24, 2026/u);
  for (const [key, amount] of [
    ['income', march.income],
    ['spending', march.spending],
    ['leftover', march.leftover],
    ['savings', march.savingsNetChange],
  ] as const) {
    await expect(row.getByTestId(`history-${key}`)).toHaveText(
      formatMoney(amount, locale),
    );
  }
  await expect(row.getByTestId('amended')).toHaveCount(0);
  await expectAccessible(page);
});

test('a past cycle shows its categories and balances', async ({ page }) => {
  await page.goto('/reports/history');
  await marchRow(page).getByRole('link').click();
  await expect(page).toHaveURL(/\/reports\?start=2026-03-01$/u);
  await expect(
    page.getByRole('heading', { level: 1, name: /^Cycle Mar 1/u }),
  ).toBeVisible();
  await expect(page.getByTestId('cycle-spending')).toHaveText(
    formatMoney(march.spending, locale),
  );
  await expectAccessible(page);

  await page.getByRole('tab', { name: 'Categories' }).click();
  await expect(page).toHaveURL(/tab=categories/u);
  const spending = page.getByRole('region', { name: 'Spending by category' });
  await expect(spending.getByRole('application')).toBeVisible();
  await expectAccessible(page);
  await spending.getByRole('button', { name: 'Show as table' }).click();
  await expect(
    spending.getByRole('row').filter({ hasText: 'Housing › Rent' }),
  ).toContainText(formatMoney(eur(50000), locale));
  const detail = (await (
    await page.request.get('/v1/cycles/2026-03-01')
  ).json()) as CycleDetailView;
  // One row per bar, each with the server's amount.
  await expect(spending.getByRole('row')).toHaveCount(
    detail.spendingTop.top.length + (detail.spendingTop.other ? 1 : 0) + 1,
  );
  for (const { amount } of detail.spendingTop.top)
    await expect(spending.getByRole('table')).toContainText(
      formatMoney(amount, locale),
    );
  await expect(
    page.getByRole('region', { name: 'Income by category' }),
  ).toBeVisible();
  await expectAccessible(page);
});

test('every cycle chart has a table of the server’s figures', async ({
  page,
}) => {
  const series = (await (
    await page.request.get('/v1/cycles/2026-03-01/days')
  ).json()) as CycleDayListView;
  await page.goto('/reports?start=2026-03-01');

  const chart = page.getByRole('region', { name: 'Spending against pace' });
  await chart.getByRole('button', { name: 'Show as table' }).click();
  const rows = chart.getByRole('row');
  await expect(rows).toHaveCount(series.days.length + 1);
  for (const [at, day] of series.days.entries()) {
    const cells = rows.nth(at + 1).getByRole('cell');
    await expect(cells.nth(0)).toHaveText(
      day.cumulativeSpent === null
        ? '—'
        : formatMoney(day.cumulativeSpent, locale),
    );
    await expect(cells.nth(1)).toHaveText(formatMoney(day.pace, locale));
  }
  await expectAccessible(page);
  await chart.getByRole('button', { name: 'Show as chart' }).click();
  await expect(chart.getByRole('application')).toBeVisible();

  await page.getByRole('tab', { name: 'Days' }).click();
  const daily = page.getByRole('region', { name: 'Spending each day' });
  await daily.getByRole('button', { name: 'Show as table' }).click();
  const past = series.days.filter((day) => day.spent !== null);
  await expect(daily.getByRole('row')).toHaveCount(past.length + 1);
  for (const [at, day] of past.entries()) {
    const cells = daily
      .getByRole('row')
      .nth(at + 1)
      .getByRole('cell');
    await expect(cells.nth(0)).toHaveText(
      formatMoney(day.spent ?? eur(0), locale),
    );
    await expect(cells.nth(1)).toHaveText(
      formatMoney(day.allowance ?? eur(0), locale),
    );
  }
  await expectAccessible(page);
});

test('arrow keys move between a chart’s points', async ({ page }) => {
  const series = (await (
    await page.request.get('/v1/cycles/2026-03-01/days')
  ).json()) as CycleDayListView;
  const [first, second] = series.days;
  if (first === undefined || second === undefined)
    throw new Error('the March cycle has fewer than two days');
  await page.goto('/reports?start=2026-03-01');
  const chart = page.getByRole('region', { name: 'Spending against pace' });
  const surface = chart.getByRole('application');
  await surface.focus();
  await expect(surface).toBeFocused();
  const tooltip = chart.locator('.recharts-tooltip-wrapper');
  // Focus pins the tooltip on the first day; the arrows move it.
  await expect(tooltip).toContainText('Sunday, March 1');
  await expect(tooltip).toContainText(
    formatMoney(first.cumulativeSpent ?? eur(0), locale),
  );
  await page.keyboard.press('ArrowRight');
  await expect(tooltip).toContainText('Monday, March 2');
  await expect(tooltip).toContainText(formatMoney(second.pace, locale));
  await page.keyboard.press('ArrowLeft');
  await expect(tooltip).toContainText('Sunday, March 1');
  await expectAccessible(page);
});

test('a back-dated entry marks the past cycle as amended', async ({
  page,
  baseURL,
}) => {
  const accounts = (await (await page.request.get('/v1/accounts')).json()) as {
    accounts: { id: string; name: string }[];
  };
  const wallet = accounts.accounts.find((a) => a.name === 'Wallet')?.id ?? '';
  const categories = (await (
    await page.request.get('/v1/categories')
  ).json()) as { categories: { id: string; name: string }[] };
  const fun = categories.categories.find((c) => c.name === 'Fun')?.id ?? '';
  const late = await page.request.post('/v1/transactions', {
    data: {
      kind: 'expense',
      accountId: wallet,
      amount: eur(1500),
      categoryId: fun,
      occurredOn: '2026-03-10',
      note: 'Forgotten ticket',
    },
    headers: { origin: baseURL ?? '' },
  });
  expect(late.status(), await late.text()).toBe(201);

  await page.goto('/reports/history');
  const row = marchRow(page);
  await expect(row.getByTestId('amended')).toBeVisible();
  await expect(row.getByTestId('history-spending')).toHaveText(
    formatMoney(
      money(march.spending.amountMinor + 1500, march.spending.currency),
      locale,
    ),
  );
  await expectAccessible(page);

  await row.getByRole('link').click();
  const amendments = page.getByTestId('amendments');
  await expect(amendments).toContainText('Forgotten ticket');
  await expectAccessible(page);
  await amendments.getByRole('link', { name: /Show in the ledger/u }).click();
  await expect(page).toHaveURL(/\/transactions\?entry=/u);
});

test('Today links to the current cycle', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'See this cycle' }).click();
  await expect(page).toHaveURL(/\/reports$/u);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reports' }),
  ).toBeVisible();
  // The fixture's last paycheck is long past, so payday is overdue.
  await expect(page.locator('main')).toContainText(
    'Payday has passed without a paycheck.',
  );
  await expect(page.getByTestId('cycle-income')).toHaveText(
    formatMoney(eur(250000), locale),
  );
  await expectAccessible(page);

  // Only the open cycle has bills, from /v1/today.
  const today = (await (await page.request.get('/v1/today')).json()) as {
    cycleBills: { dueOn: string; paidOn: string | null }[];
  };
  await page.getByRole('tab', { name: 'Bills' }).click();
  const bills = page.getByRole('region', { name: 'Bills this cycle' });
  await expect(bills.getByRole('listitem')).toHaveCount(
    today.cycleBills.length,
  );
  await expect(bills.getByRole('link', { name: 'Manage bills' })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('link', { name: /^Previous cycle/u }).click();
  await expect(page).toHaveURL(/\/reports\?start=/u);
  await expect(page.getByRole('tab', { name: 'Bills' })).toHaveCount(0);
  await page.getByRole('link', { name: /^Next cycle/u }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reports' }),
  ).toBeVisible();
});

test('category cards roll subcategories up and expand', async ({ page }) => {
  type Group = {
    categoryId: string | null;
    amount: Money;
    children: { categoryId: string | null }[];
  };
  const summary = (await (
    await page.request.get('/v1/reports/categories?cycle=2026-03-01')
  ).json()) as { spending: Group[] };
  const [first] = summary.spending;
  if (first === undefined) throw new Error('the fixture spends in March');

  await page.goto('/reports?start=2026-03-01');
  const cards = page.getByTestId('category-card');
  await expect(cards.first()).toHaveAttribute(
    'data-category-id',
    first.categoryId ?? '',
  );
  await expect(cards.first()).toContainText(formatMoney(first.amount, locale));
  await expectAccessible(page);

  // A card with more than two subcategories opens to show them all.
  const wide = summary.spending.findIndex((g) => g.children.length > 2);
  if (wide >= 0) {
    const card = cards.nth(wide);
    const toggle = card.getByRole('button', { name: /^Show all/ });
    await expect(card.getByRole('listitem')).toHaveCount(2);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(card.getByRole('listitem')).toHaveCount(
      summary.spending[wide]?.children.length ?? 0,
    );
  }
});

test('the calendar-month setting changes the period of the cards', async ({
  page,
}) => {
  await page.goto('/settings#reports');
  await page
    .getByRole('radio', { name: 'Calendar month' })
    .check({ force: true });
  await page.goto('/reports?start=2026-03-01');
  await expect(
    page.getByRole('heading', { name: /^Spending per category/ }),
  ).toBeVisible();
  const month = await page.request.get('/v1/reports/categories?period=month');
  expect(month.ok()).toBe(true);
  await expectAccessible(page);
});
