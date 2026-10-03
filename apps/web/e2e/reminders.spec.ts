import type { ReminderListView, TodayView } from '@allotr/shared';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// Reminders: the in-app feed, the Dashboard card and the opt-in push switch,
// one instance per size. The server checks every second in e2e, so the
// reminders for a bill due today and the weekly review appear at once. Push
// itself is never turned on here: it needs the browser vendor's push service.
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
  todayDate = ((await (await api.get('/v1/today')).json()) as TodayView).today;
  await created(api, '/v1/bills', {
    name: 'Rent',
    amount: usd(80_000),
    dueDay: Number(todayDate.slice(8)),
    accountId: everyday,
    categoryId: categories.find((c) => c.name === 'Housing')?.id ?? '',
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

test('the server creates the reminders once', async ({ page }) => {
  await expect
    .poll(async () => {
      const feed = (await (
        await page.request.get('/v1/reminders')
      ).json()) as ReminderListView;
      return feed.reminders.map((r) => r.kind).sort();
    })
    .toEqual(['bill_due', 'weekly_review']);
  // The job keeps running every second; nothing is added twice.
  await page.waitForTimeout(2500);
  const feed = (await (
    await page.request.get('/v1/reminders')
  ).json()) as ReminderListView;
  expect(feed.reminders).toHaveLength(2);
  expect(feed.unread).toBe(2);
});

test('the Dashboard shows unread reminders until they are read', async ({
  page,
}) => {
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Reminders' });
  await expect(card).toContainText(`Rent is due ${todayDate}`);
  await expectAccessible(page);
  await card.getByRole('button', { name: 'Mark all read' }).click();
  await expect(card).toBeHidden();
  const feed = (await (
    await page.request.get('/v1/reminders')
  ).json()) as ReminderListView;
  expect(feed.unread).toBe(0);
});

test('Settings lists the feed and keeps push off until asked', async ({
  page,
}) => {
  await page.goto('/settings#reminders');
  const section = page.getByRole('region', { name: 'Reminders' });
  await expect(section.getByTestId('reminder')).toHaveCount(2);
  await expect(section.getByTestId('reminders-unread')).toHaveText('0 unread');
  const device = section.getByTestId('push-device');
  await expect(device).toContainText("browser vendor's push service");
  await expect(device).toContainText('Off until you turn it on');
  // Either the browser can ask, or it says it cannot; it never starts by itself.
  await expect(
    device
      .getByTestId('push-state')
      .or(device.getByText(/cannot show notifications|blocked/u)),
  ).toBeVisible();
  const subscriptions = (await (
    await page.request.get('/v1/push/subscriptions')
  ).json()) as { subscriptions: unknown[] };
  expect(subscriptions.subscriptions).toEqual([]);
  await expectAccessible(page);
});
