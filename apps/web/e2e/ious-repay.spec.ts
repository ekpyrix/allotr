import type { IouListView } from '@allotr/shared';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// Repaying a person with several open IOUs from one amount, oldest first.
test.describe.configure({ mode: 'serial' });

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

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
  const opened = await api.post('/v1/accounts', {
    data: { name: 'Everyday', currency: 'USD', openingBalance: usd(100_000) },
  });
  expect(opened.ok(), await opened.text()).toBe(true);
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

test("repays a person's IOUs oldest first from one amount", async ({
  page,
  baseURL,
}) => {
  const accountId = (
    (await (await page.request.get('/v1/accounts')).json()) as {
      accounts: { id: string }[];
    }
  ).accounts[0]?.id;
  for (const [amount, day] of [
    [3000, 9],
    [2000, 4],
  ] as const) {
    const lent = await page.request.post('/v1/ious', {
      data: {
        accountId,
        direction: 'owed-to-me',
        people: [{ person: 'Robin Example', amount: usd(amount) }],
        occurredOn: daysAgo(day),
      },
      headers: { origin: baseURL ?? '' },
    });
    expect(lent.ok(), await lent.text()).toBe(true);
  }
  await page.goto('/budget');
  await page
    .getByRole('button', { name: 'Record repayment Robin Example' })
    .first()
    .click();
  const sheet = page.getByRole('dialog', { name: 'Repayment: Robin Example' });
  await expect(sheet).toContainText('Still owed: $50.00 across 2 IOUs');
  await sheet.getByLabel('Amount repaid').fill('35');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Record repayment' }).click();
  await expect(sheet).toBeHidden();

  const list = (await ious(page)).ious.filter(
    (i) => i.person === 'Robin Example',
  );
  expect(list.map((i) => i.outstanding.amountMinor)).toEqual([1500]);
  const all = (await (
    await page.request.get('/v1/ious?status=all')
  ).json()) as IouListView;
  const robin = all.ious
    .filter((i) => i.person === 'Robin Example')
    .sort((a, b) => a.recordedOn.localeCompare(b.recordedOn));
  expect(robin.map((i) => i.settled)).toEqual([true, false]);
});
