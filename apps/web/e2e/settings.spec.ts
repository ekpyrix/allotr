import type {
  CategoryView,
  LedgerSettingsView,
  TodayView,
} from '@allotr/shared';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';
import { totpFromUri } from './totp.ts';

// The settings view (FR-W2). One instance per size; the tests build on each
// other. The server runs on the real clock, so figures are compared with
// the API, never hardcoded.
test.describe.configure({ mode: 'serial' });

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
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

async function today(page: Page): Promise<TodayView> {
  return (await (await page.request.get('/v1/today')).json()) as TodayView;
}

async function ledgerSettings(page: Page): Promise<LedgerSettingsView> {
  return (await (
    await page.request.get('/v1/settings/ledger')
  ).json()) as LedgerSettingsView;
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const section = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true });

test('changing the payday override and rule updates Today’s figures', async ({
  page,
}) => {
  await page.goto('/settings#payday');
  await expect(page.getByRole('heading', { name: 'Payday' })).toBeFocused();
  await expectAccessible(page);

  const before = await today(page);
  const offset = before.daysLeft === 9 ? 12 : 9;
  const payday = addDays(before.today, offset);
  const region = section(page, 'Payday');
  await region.getByLabel('This cycle’s payday').fill(payday);
  await region.getByRole('button', { name: 'Save' }).click();
  await expect(region.getByText('Saved.')).toBeVisible();

  expect((await ledgerSettings(page)).paydayOverride).toBe(payday);
  const after = await today(page);
  expect(after.cycle.payday).toBe(payday);
  expect(after.daysLeft).not.toBe(before.daysLeft);
  await expect(
    region.getByText(`${String(after.daysLeft)} days left in this cycle`, {
      exact: false,
    }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Dashboard' }).first().click();
  await expect(page.getByRole('definition').nth(2)).toHaveText(
    String(after.daysLeft),
  );

  await page.goto('/settings#payday');
  await region
    .getByRole('button', { name: 'Clear this cycle’s payday' })
    .click();
  await expect(
    region.getByText('Payday follows the monthly day again.'),
  ).toBeVisible();
  await expect(region.getByLabel('This cycle’s payday')).toHaveValue('');
  expect((await ledgerSettings(page)).paydayOverride).toBeNull();

  // The rule can be the last working day, and back. (Part of this test:
  // every test signs in, and sign-ins are rate limited per minute.)
  await region.getByLabel('How payday is set').selectOption('last-working-day');
  // The day of the month is not used by this rule.
  await expect(region.getByLabel('Payday each month')).toHaveCount(0);
  await region.getByRole('button', { name: 'Save' }).click();
  await expect(region.getByText('Saved.')).toBeVisible();
  expect((await ledgerSettings(page)).paydayRule).toBe('last-working-day');
  const lastWorking = (await today(page)).cycle.payday;
  const weekday = new Date(`${lastWorking}T00:00:00Z`).getUTCDay();
  expect(weekday).toBeGreaterThanOrEqual(1);
  expect(weekday).toBeLessThanOrEqual(5);

  await region.getByLabel('How payday is set').selectOption('fixed');
  await region.getByRole('button', { name: 'Save' }).click();
  await expect(region.getByText('Saved.')).toBeVisible();
  expect((await ledgerSettings(page)).paydayRule).toBe('fixed');
});

test('the locale shows a sample and is saved in canonical form', async ({
  page,
}) => {
  await page.goto('/settings');
  const ledger = section(page, 'Ledger');
  const locale = ledger.getByLabel('Language and region');
  await locale.fill('de-de');
  await expect(
    ledger.getByText('Amounts look like', { exact: false }),
  ).toContainText('123.456,78');
  await ledger.getByRole('button', { name: 'Save' }).first().click();
  await expect(ledger.getByText('Saved.')).toBeVisible();
  await expect(locale).toHaveValue('de-DE');
  expect((await ledgerSettings(page)).locale).toBe('de-DE');

  await locale.fill('en-US');
  await ledger.getByRole('button', { name: 'Save' }).first().click();
  await expect(ledger.getByText('Saved.')).toBeVisible();
  await expectAccessible(page);

  // A ledger query that fails takes only the ledger sections down.
  await page.route('**/v1/rates', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
      }),
    }),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(section(page, 'Ledger')).toHaveCount(0);
  await expect(
    section(page, 'Security').getByRole('button', {
      name: 'Sign out',
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute('**/v1/rates');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(section(page, 'Ledger')).toBeVisible();
});

function post(
  page: Page,
  baseURL: string | undefined,
  path: string,
  data: object,
) {
  return page.request.post(path, { data, headers: { origin: baseURL ?? '' } });
}

async function categories(page: Page): Promise<CategoryView[]> {
  const response = await page.request.get('/v1/categories?includeMerged=true');
  return ((await response.json()) as { categories: CategoryView[] }).categories;
}

test('deleting a category in use requires a merge target', async ({
  page,
  baseURL,
}) => {
  const created = await post(page, baseURL, '/v1/accounts', {
    name: 'Everyday',
    currency: 'USD',
  });
  expect(created.ok()).toBe(true);
  const { id: accountId } = (await created.json()) as { id: string };
  const target = await post(page, baseURL, '/v1/categories', {
    name: 'Treats',
    kind: 'expense',
  });
  expect(target.ok()).toBe(true);
  const { id: treatsId } = (await target.json()) as { id: string };

  await page.goto('/settings#categories');
  const region = section(page, 'Categories');
  await expect(
    page.getByRole('heading', { name: 'Categories', exact: true }),
  ).toBeFocused();
  await region.getByRole('button', { name: 'New category' }).click();
  const add = page.getByRole('dialog', { name: 'New category' });
  await add.getByLabel('Name').fill('Snacks');
  await expect(add.getByLabel('Expense')).toBeChecked();
  await expectAccessible(page);
  await add.getByRole('button', { name: 'Add category' }).click();
  await expect(add).toBeHidden();
  await expect(region.getByRole('listitem', { name: 'Snacks' })).toBeVisible();

  const snacks = (await categories(page)).find((c) => c.name === 'Snacks');
  expect(snacks).toBeDefined();
  const spent = await post(page, baseURL, '/v1/transactions', {
    kind: 'expense',
    accountId,
    amount: { amountMinor: 450, currency: 'USD' },
    categoryId: snacks?.id,
  });
  expect(spent.ok()).toBe(true);

  await region.getByRole('button', { name: 'Delete Snacks' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete Snacks?' });
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(
    dialog.getByText('Entries use Snacks. Choose where they go.'),
  ).toBeVisible();
  const mergeInto = dialog.getByLabel('Merge into');
  await expect(mergeInto).toBeFocused();
  await dialog.getByRole('button', { name: 'Merge and delete' }).click();
  await expect(
    dialog.getByText('Choose a category to merge into.'),
  ).toBeVisible();
  await expectAccessible(page);
  await mergeInto.selectOption({ label: 'Treats' });
  await dialog.getByRole('button', { name: 'Merge and delete' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Snacks merged into Treats.')).toBeAttached();
  await expect(region.getByRole('listitem', { name: 'Snacks' })).toHaveCount(0);
  expect(
    (await categories(page)).find((c) => c.id === snacks?.id)?.mergedIntoId,
  ).toBe(treatsId);
});

test('a category nobody uses is deleted at once, and tags can be renamed', async ({
  page,
  baseURL,
}) => {
  const unused = await post(page, baseURL, '/v1/categories', {
    name: 'Unused',
    kind: 'expense',
  });
  expect(unused.ok()).toBe(true);
  await page.goto('/settings#tags');
  const tags = section(page, 'Tags');
  await tags.getByLabel('New tag').fill('trip');
  await tags.getByRole('button', { name: 'Add tag' }).click();
  await expect(tags.getByRole('listitem', { name: 'trip' })).toBeVisible();
  await tags.getByRole('button', { name: 'Rename trip' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename trip' });
  await rename.getByLabel('Name').fill('holiday');
  await rename.getByRole('button', { name: 'Save' }).click();
  await expect(rename).toBeHidden();
  await expect(tags.getByRole('listitem', { name: 'holiday' })).toBeVisible();
  await expect(
    tags.getByRole('button', { name: 'Rename holiday' }),
  ).toBeFocused();

  const region = section(page, 'Categories');
  await region.getByRole('button', { name: 'Delete Unused' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete Unused?' });
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Unused deleted.')).toBeAttached();
  await expect(
    page.getByRole('heading', { name: 'Categories', exact: true }),
  ).toBeFocused();
  await expectAccessible(page);
});

test('a bill due this cycle is set aside until it is paid', async ({
  page,
  baseURL,
}) => {
  // Two bills, each paid and undone, with accessibility checks.
  test.setTimeout(90_000);
  const before = await today(page);
  const dueDay = Number(before.today.slice(8));
  // Bills moved to Budget; the old settings address redirects there.
  await page.goto('/settings#bills');
  await expect(page).toHaveURL(/\/budget$/);
  await expect(
    page.getByRole('heading', { name: 'Bills', exact: true }),
  ).toBeVisible();
  const region = section(page, 'Bills');
  await region.getByRole('button', { name: 'New bill' }).click();
  const dialog = page.getByRole('dialog', { name: 'New bill' });
  await dialog.getByLabel('Name').fill('Phone');
  await expect(dialog.getByLabel('Paid from')).toHaveValue(/.+/);
  await dialog.getByLabel('Amount in USD').fill('0');
  await dialog.getByRole('button', { name: 'Add bill' }).click();
  await expect(
    dialog.getByText('Enter an amount greater than zero.'),
  ).toBeVisible();
  await expect(dialog.getByLabel('Amount in USD')).toBeFocused();
  await dialog.getByLabel('Amount in USD').fill('35');
  await dialog.getByLabel('Due each month on day').selectOption(String(dueDay));
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Add bill' }).click();
  await expect(dialog).toBeHidden();

  const bill = region.getByRole('listitem', { name: 'Phone' });
  await expect(bill).toContainText('$35.00');
  await expect(bill).toContainText('set aside');
  const reserved = await today(page);
  expect(reserved.cycleBills).toHaveLength(1);
  expect(reserved.cycleBills[0]?.paidOn).toBeNull();

  // Paying records the expense as it releases the reserve, so what is
  // available stays the same.
  await bill.getByRole('button', { name: /^Pay/ }).click();
  const pay = page.getByRole('dialog', { name: 'Pay Phone' });
  await expect(pay.getByLabel('Charged in USD')).toHaveValue('35.00');
  await expect(pay.getByLabel('Paid on')).toHaveValue(reserved.today);
  await pay.getByRole('button', { name: 'Record payment' }).click();
  await expect(pay.getByText('Choose a category.')).toBeVisible();
  await pay
    .getByLabel('Category for payments')
    .selectOption({ label: 'Bills and subscriptions' });
  await expectAccessible(page);
  await pay.getByRole('button', { name: 'Record payment' }).click();
  await expect(pay).toBeHidden();
  await expect(bill).toContainText('paid');
  await expect(bill).toContainText('$35.00');
  await expect(bill.getByRole('button', { name: /^Undo paid/ })).toBeVisible();
  const paid = await today(page);
  expect(paid.cycleBills[0]?.paidOn).toBe(paid.today);
  expect(paid.available).toEqual(reserved.available);

  // Undoing the payment undoes the expense it recorded.
  await bill.getByRole('button', { name: /^Undo paid/ }).click();
  await expect(bill.getByRole('button', { name: /^Pay/ })).toBeVisible();
  const unpaid = await today(page);
  expect(unpaid.cycleBills[0]?.paidOn).toBeNull();
  expect(unpaid.available).toEqual(reserved.available);

  // A payment already logged, say from chat, is linked instead.
  const bills = (await (await page.request.get('/v1/bills')).json()) as {
    bills: { name: string; accountId: string }[];
  };
  const categories = (await (
    await page.request.get('/v1/categories')
  ).json()) as { categories: CategoryView[] };
  const logged = await page.request.post('/v1/transactions', {
    data: {
      kind: 'expense',
      accountId: bills.bills.find((b) => b.name === 'Phone')?.accountId,
      amount: { amountMinor: 3_500, currency: 'USD' },
      categoryId: categories.categories.find(
        (c) => c.name === 'Bills and subscriptions',
      )?.id,
      note: 'Phone plan',
    },
    headers: { origin: baseURL ?? '' },
  });
  expect(logged.ok()).toBe(true);
  await bill.getByRole('button', { name: /^Pay/ }).click();
  await pay.getByLabel('Link an entry I already logged').check();
  await pay.getByRole('button', { name: 'Link payment' }).click();
  await expect(pay.getByText('Choose the entry that paid it.')).toBeVisible();
  await pay.getByRole('radio', { name: /Phone plan/ }).check();
  await expectAccessible(page);
  await pay.getByRole('button', { name: 'Link payment' }).click();
  await expect(pay).toBeHidden();
  await expect(bill.getByRole('button', { name: /^Undo paid/ })).toBeVisible();
  expect((await today(page)).available).toEqual(reserved.available);

  // Undoing a linked payment keeps the entry; the bill is set aside again.
  await bill.getByRole('button', { name: /^Undo paid/ }).click();
  await expect(bill.getByRole('button', { name: /^Pay/ })).toBeVisible();
  expect(
    reserved.available.amountMinor - (await today(page)).available.amountMinor,
  ).toBe(3_500);

  await bill.getByRole('button', { name: 'Edit Phone' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Phone' });
  // The account can be changed on an existing bill too.
  await expect(edit.getByLabel('Paid from')).toHaveValue(/.+/);
  await edit.getByLabel('Active').uncheck();
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect(bill).toContainText('Inactive');
  expect((await today(page)).cycleBills).toEqual([]);

  await bill.getByRole('button', { name: 'Delete Phone' }).click();
  await page
    .getByRole('dialog', { name: 'Delete Phone?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(region.getByRole('listitem', { name: 'Phone' })).toHaveCount(0);

  // A bill priced in another currency (part of this test: sign-ins are
  // rate limited per minute).
  {
    const before = await today(page);
    const dueDay = Number(before.today.slice(8));
    await page.goto('/budget');
    const region = section(page, 'Bills');
    await region.getByRole('button', { name: 'New bill' }).click();
    const dialog = page.getByRole('dialog', { name: 'New bill' });
    await dialog.getByLabel('Name').fill('Streaming');
    await dialog.getByLabel('Priced in another currency').check();
    await dialog.getByRole('button', { name: 'Add bill' }).click();
    await expect(
      dialog.getByText('Choose the currency it is billed in.'),
    ).toBeVisible();
    await dialog.getByLabel('Billed in').selectOption('EUR');
    await dialog.getByLabel('Price in EUR').fill('9.90');
    await dialog.getByLabel('Estimate in USD').fill('11');
    await dialog
      .getByLabel('Due each month on day')
      .selectOption(String(dueDay));
    await dialog
      .getByLabel('Category for payments')
      .selectOption({ label: 'Bills and subscriptions' });
    await expectAccessible(page);
    await dialog.getByRole('button', { name: 'Add bill' }).click();
    await expect(dialog).toBeHidden();

    const bill = region.getByRole('listitem', { name: 'Streaming' });
    await expect(bill).toContainText('€9.90');
    await expect(bill).toContainText('$11.00 set aside');
    const reserved = await today(page);
    expect(before.available.amountMinor - reserved.available.amountMinor).toBe(
      1_100,
    );

    await bill.getByRole('button', { name: /^Pay/ }).click();
    const pay = page.getByRole('dialog', { name: 'Pay Streaming' });
    await expect(pay.getByLabel('Price in EUR')).toHaveValue('9.90');
    await expect(pay.getByLabel('Charged in USD')).toHaveValue('11.00');
    await pay.getByLabel('Charged in USD').fill('11.35');
    await expect(pay).toContainText('1 EUR = $1.15');
    await expectAccessible(page);
    await pay.getByRole('button', { name: 'Record payment' }).click();
    await expect(pay).toBeHidden();

    await expect(bill).toContainText('$11.35 set aside');
    await expect(bill).toContainText('Last paid $11.35 · 1 EUR = $1.15');
    const paid = await today(page);
    expect(paid.cycleBills[0]?.paidOn).toBe(paid.today);
    expect(before.available.amountMinor - paid.available.amountMinor).toBe(
      1_135,
    );

    await bill.getByRole('button', { name: /^Undo paid/ }).click();
    await expect(bill.getByRole('button', { name: /^Pay/ })).toBeVisible();
    await expect(bill).toContainText('$11.00 set aside');
    expect((await today(page)).available).toEqual(reserved.available);

    await bill.getByRole('button', { name: 'Delete Streaming' }).click();
    await page
      .getByRole('dialog', { name: 'Delete Streaming?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(
      region.getByRole('listitem', { name: 'Streaming' }),
    ).toHaveCount(0);
  }
});

test('a manual rate brings a foreign account into the figures', async ({
  page,
  baseURL,
}) => {
  const created = await post(page, baseURL, '/v1/accounts', {
    name: 'Travel',
    currency: 'EUR',
    openingBalance: { amountMinor: 10_000, currency: 'EUR' },
  });
  expect(created.ok()).toBe(true);
  expect((await today(page)).missingRates).toEqual(['EUR']);

  await page.goto('/settings#rates');
  const region = section(page, 'Exchange rates');
  await expect(
    page.getByRole('heading', { name: 'Exchange rates' }),
  ).toBeFocused();
  await expect(region).toContainText('No rate yet for EUR');
  await expect(region.getByLabel('From currency')).toHaveValue('EUR');
  await expect(region.getByLabel('To currency')).toHaveValue('USD');
  await region.getByLabel('USD for 1 EUR').fill('abc');
  await region.getByRole('button', { name: 'Save rate' }).click();
  await expect(
    region.getByText('Enter a rate greater than zero', { exact: false }),
  ).toBeVisible();
  await region.getByLabel('USD for 1 EUR').fill('1.1');
  await region.getByRole('button', { name: 'Save rate' }).click();
  const list = region.getByRole('list', { name: 'Rates, newest first' });
  await expect(list.getByRole('listitem')).toHaveText([/1 EUR = 1.1 USD/]);
  await expect(region).not.toContainText('No rate yet for EUR');
  expect((await today(page)).missingRates).toEqual([]);
  await expectAccessible(page);

  await list.getByRole('button', { name: /^Delete 1 EUR = 1.1 USD/ }).click();
  await expect(list).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Exchange rates' }),
  ).toBeFocused();
  expect((await today(page)).missingRates).toEqual(['EUR']);
});

// The invited user's cookies, reused below: sign-ins are rate limited.
let invitedState: Awaited<ReturnType<BrowserContext['storageState']>>;

const invited = {
  name: 'Robin Example',
  email: 'robin@example.test',
  password: 'another long example passphrase',
};

test('an invite link from the instance section signs up a new user', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto('/settings#instance');
  const region = section(page, 'Instance');
  await expect(
    page.getByRole('heading', { name: 'Instance', exact: true }),
  ).toBeFocused();
  await expect(region.getByLabel('People with an invite link')).toBeChecked();
  await region.getByLabel('Link works for').selectOption({ label: '1 day' });
  await region.getByRole('button', { name: 'Create invite link' }).click();
  const link = region.getByLabel('Invite link', { exact: true });
  await expect(link).toBeFocused();
  const url = new URL(await link.inputValue());
  expect(url.pathname).toMatch(/^\/invite\/.+/);
  await expectAccessible(page);

  const other = await browser.newContext({ baseURL: baseURL ?? '' });
  const guest = await other.newPage();
  await guest.goto('/invite/not-a-real-token');
  await expect(
    guest.getByRole('heading', { name: 'Invite link not valid' }),
  ).toBeVisible();

  await guest.goto(url.pathname);
  await expect(
    guest.getByRole('heading', { name: 'Join Allotr' }),
  ).toBeVisible();
  await expectAccessible(guest);
  await guest.getByLabel('Name').fill(invited.name);
  await guest.getByLabel('Email').fill(invited.email);
  await guest.getByLabel('Password').fill(invited.password);
  await guest.getByRole('button', { name: 'Create account' }).click();
  // A new user starts with setup (setup.spec covers it).
  await expect(guest).toHaveURL(/\/setup$/);
  await guest.getByRole('button', { name: 'Skip the rest of setup' }).click();
  await expect(guest).toHaveURL(/\/$/);

  await guest.goto('/settings');
  await expect(
    guest.getByRole('region', { name: 'Security', exact: true }),
  ).toBeVisible();
  await expect(
    guest.getByRole('region', { name: 'Instance', exact: true }),
  ).toHaveCount(0);

  await guest.goto(url.pathname);
  await expect(guest).toHaveURL(/\/$/);
  invitedState = await other.storageState();
  await other.close();
});

// These run last: they turn 2FA on, which the sign-in above cannot pass,
// and leave it off again.
test('signing out other devices signs out a second browser', async ({
  page,
  browser,
  baseURL,
}) => {
  const other = await browser.newContext({ baseURL: baseURL ?? '' });
  const otherPage = await other.newPage();
  const signIn = await otherPage.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(signIn.ok()).toBe(true);
  await otherPage.goto('/');
  await expect(otherPage).toHaveURL(/\/$/);

  await page.goto('/settings#security');
  const region = section(page, 'Security');
  await expect(
    page.getByRole('heading', { name: 'Security', exact: true }),
  ).toBeFocused();
  const devices = region.getByRole('list', { name: 'Signed-in devices' });
  await expect(devices.getByText('This device')).toHaveCount(1);
  expect(await devices.getByRole('listitem').count()).toBeGreaterThan(1);
  await expectAccessible(page);

  await region
    .getByRole('button', { name: 'Sign out all other devices' })
    .click();
  await expect(
    region.getByText('Every other device is signed out.'),
  ).toBeVisible();
  await expect(devices.getByRole('listitem')).toHaveCount(1);

  await otherPage.goto('/');
  await expect(otherPage).toHaveURL(/\/sign-in/);
  await other.close();
  await page.reload();
  await expect(page).toHaveURL(/\/settings/);
});

test('two-factor authentication turns on with a code and stays on while required', async ({
  page,
  browser,
  baseURL,
}) => {
  // Two browser contexts and several sign-ins: slow under a full run.
  test.setTimeout(60_000);
  await page.goto('/settings#security');
  const region = section(page, 'Security');
  await region
    .getByRole('button', { name: 'Turn on two-factor authentication' })
    .click();
  await region.getByLabel('Your password').fill(account.password);
  await region.getByRole('button', { name: 'Continue' }).click();
  await expect(
    region.getByRole('img', { name: 'QR code for your authenticator app' }),
  ).toBeVisible();
  await expect(
    region.getByRole('list', { name: 'Backup codes' }).getByRole('listitem'),
  ).not.toHaveCount(0);
  await expectAccessible(page);

  const secret = (await region.getByTestId('totp-secret').innerText()).replace(
    /\s/g,
    '',
  );
  const uri = `otpauth://totp/Allotr?secret=${secret}`;
  await region.getByLabel('Code from the app').fill(totpFromUri(uri));
  await region.getByRole('button', { name: 'Verify and turn on' }).click();
  await expect(
    region.getByText('Two-factor authentication is on.'),
  ).toBeVisible();
  await expect(region).toContainText('On. Signing in asks for a code');

  const patch = (requireTwoFactor: boolean) =>
    page.request.patch('/v1/admin/settings', {
      data: { requireTwoFactor },
      headers: { origin: baseURL ?? '' },
    });
  expect((await patch(true)).ok()).toBe(true);

  // Someone without 2FA can reach only the security settings until they
  // set it up.
  const other = await browser.newContext({
    baseURL: baseURL ?? '',
    storageState: invitedState,
  });
  const unenrolled = await other.newPage();
  await unenrolled.goto('/');
  await unenrolled.getByRole('link', { name: 'Set it up in Settings' }).click();
  await expect(unenrolled).toHaveURL(/\/settings#security$/);
  await expect(
    unenrolled.getByRole('heading', { name: 'Security', exact: true }),
  ).toBeFocused();
  await expect(
    unenrolled.getByRole('region', { name: 'Ledger', exact: true }),
  ).toHaveCount(0);
  await expect(
    unenrolled.getByRole('button', {
      name: 'Turn on two-factor authentication',
    }),
  ).toBeVisible();
  await expectAccessible(unenrolled);

  // Once they have set it up, everything else comes back.
  const own = unenrolled.getByRole('region', { name: 'Security', exact: true });
  await own
    .getByRole('button', { name: 'Turn on two-factor authentication' })
    .click();
  await own.getByLabel('Your password').fill(invited.password);
  await own.getByRole('button', { name: 'Continue' }).click();
  const theirSecret = (
    await own.getByTestId('totp-secret').innerText()
  ).replace(/\s/g, '');
  await own
    .getByLabel('Code from the app')
    .fill(totpFromUri(`otpauth://totp/Allotr?secret=${theirSecret}`));
  await own.getByRole('button', { name: 'Verify and turn on' }).click();
  await expect(own.getByText('Two-factor authentication is on.')).toBeVisible();
  await expect(
    unenrolled.getByRole('region', { name: 'Ledger', exact: true }),
  ).toBeVisible();
  await expect(
    unenrolled.getByRole('link', { name: 'Set it up in Settings' }),
  ).toHaveCount(0);
  await other.close();

  await page.reload();
  await expect(
    region.getByText('requires two-factor authentication, so it cannot', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    region.getByRole('button', { name: 'Turn off two-factor authentication' }),
  ).toHaveCount(0);

  expect((await patch(false)).ok()).toBe(true);
  await page.reload();
  await region
    .getByRole('button', { name: 'Turn off two-factor authentication' })
    .click();
  await region.getByLabel('Your password').fill(account.password);
  await region.getByRole('button', { name: 'Turn off' }).click();
  await expect(
    region.getByText('Two-factor authentication is off.'),
  ).toBeVisible();
  await expectAccessible(page);
});
