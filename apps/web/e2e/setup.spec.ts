import { formatMoney, type TodayView } from '@allotr/shared';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';

// Setup after first sign-in (FR-W7). One instance per size: the first test
// creates the administrator and leaves setup half-way; the second invites a
// new user and times the whole flow with realistic input. The server runs
// on the real clock, so the figure is compared with `/v1/today`.
test.describe.configure({ mode: 'serial' });

/** A person typing on a phone keyboard. */
const keyDelayMs = 120;
/** Reading a step before answering it. */
const readMs = 2_000;
/** FR-W7: a first daily number in about three minutes. */
const budgetMs = 180_000;

const invited = {
  name: 'Alex Example',
  email: 'alex@example.test',
  password: 'another horse battery staple',
};

async function type(field: Locator, text: string) {
  await field.click();
  await field.pressSequentially(text, { delay: keyDelayMs });
}

function stepHeading(page: Page, n: number, title: string) {
  return page.getByRole('heading', {
    level: 2,
    name: `Step ${String(n)} of 5: ${title}`,
  });
}

/** Wall-clock time spent by the user, leaving out the axe checks. */
function stopwatch() {
  let spent = 0;
  let since = Date.now();
  return {
    async excluding(work: () => Promise<void>) {
      spent += Date.now() - since;
      await work();
      since = Date.now();
    },
    elapsed: () => spent + Date.now() - since,
  };
}

async function addAccount(page: Page, name: string, balance: string) {
  await type(page.getByLabel('Name'), name);
  await type(page.getByLabel(/^Opening balance in/), balance);
  await page.getByRole('button', { name: 'Add account' }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: name }),
  ).toBeVisible();
}

test('leaving mid-way and signing in again resumes at the same step', async ({
  page,
  baseURL,
  browser,
}) => {
  const origin = { origin: baseURL ?? '' };
  const onboard = await page.request.post('/v1/onboarding', {
    data: account,
    headers: origin,
  });
  expect(onboard.ok()).toBe(true);

  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(stepHeading(page, 1, 'Currency and region')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(stepHeading(page, 2, 'Payday')).toBeFocused();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Skip this step' }).click();

  await expect(stepHeading(page, 3, 'Spending accounts')).toBeFocused();
  await addAccount(page, 'Everyday', '420');
  await expectAccessible(page);

  // A new device: nothing is kept in the browser.
  const context = await browser.newContext();
  const again = await context.newPage();
  await again.goto(new URL('/', baseURL).href);
  await expect(again).toHaveURL(/\/sign-in$/);
  await again.getByLabel('Email').fill(account.email);
  await again.getByLabel('Password').fill(account.password);
  await again.getByRole('button', { name: 'Sign in' }).click();
  await expect(again).toHaveURL(/\/setup$/);
  await expect(stepHeading(again, 3, 'Spending accounts')).toBeVisible();
  await expect(
    again.getByRole('listitem').filter({ hasText: 'Everyday' }),
  ).toBeVisible();

  // Other views stay reachable; Today brings setup back until it is done.
  await again.goto(new URL('/accounts', baseURL).href);
  await expect(again).toHaveURL(/\/accounts$/);
  await again.goto(new URL('/today', baseURL).href);
  await expect(again).toHaveURL(/\/setup$/);

  await again.getByRole('button', { name: 'Skip the rest of setup' }).click();
  await expect(again).toHaveURL(/\/today$/);
  await again.goto(new URL('/setup', baseURL).href);
  await expect(again).toHaveURL(/\/today$/);
  await context.close();
});

test('a new user reaches a first daily number in about three minutes', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(budgetMs + 60_000);
  const origin = { origin: baseURL ?? '' };
  const admin = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: origin,
  });
  expect(admin.ok()).toBe(true);
  const invite = await page.request.post('/v1/invites', {
    data: { expiresInDays: 1 },
    headers: origin,
  });
  expect(invite.ok()).toBe(true);
  const { url } = (await invite.json()) as { url: string };
  const token = new URL(url).pathname.split('/').pop() ?? '';
  await page.request.post('/v1/auth/sign-out', { data: {}, headers: origin });
  const accepted = await page.request.post(`/v1/invites/${token}/accept`, {
    data: invited,
    headers: origin,
  });
  expect(accepted.ok()).toBe(true);

  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  const clock = stopwatch();
  const read = () => page.waitForTimeout(readMs);
  const check = () => clock.excluding(() => expectAccessible(page));

  await expect(stepHeading(page, 1, 'Currency and region')).toBeVisible();
  await read();
  await page.getByLabel('Default currency').selectOption('EUR');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(stepHeading(page, 2, 'Payday')).toBeFocused();
  await read();
  await page.getByLabel('Payday each month').selectOption('25');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(stepHeading(page, 3, 'Spending accounts')).toBeFocused();
  await read();
  await addAccount(page, 'Current account', '1,250.00');
  await addAccount(page, 'Cash', '80');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(stepHeading(page, 4, 'Savings')).toBeFocused();
  await read();
  await addAccount(page, 'Rainy day', '5,000');
  await check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(stepHeading(page, 5, 'Bills')).toBeFocused();
  await read();
  await type(page.getByLabel('Name'), 'Rent');
  await type(page.getByLabel('Amount in EUR'), '650');
  await page.getByLabel('Due each month on day').selectOption('3');
  await page.getByRole('button', { name: 'Add bill' }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Rent' }),
  ).toBeVisible();
  await check();
  await page.getByRole('button', { name: 'Finish' }).click();

  await expect(page).toHaveURL(/\/today$/);
  const hero = page.getByTestId('left-today');
  await expect(hero).toBeVisible();
  const elapsed = clock.elapsed();

  const figures = (await (
    await page.request.get('/v1/today')
  ).json()) as TodayView;
  expect(figures.leftToday.currency).toBe('EUR');
  await expect(hero).toHaveText(formatMoney(figures.leftToday, 'en-US'));
  await expectAccessible(page);
  test.info().annotations.push({
    type: 'setup time',
    description: `${String(Math.round(elapsed / 1000))} s`,
  });
  expect(elapsed).toBeLessThan(budgetMs);
});
