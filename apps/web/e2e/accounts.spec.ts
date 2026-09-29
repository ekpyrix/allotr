import {
  formatMoney,
  money,
  type AccountListView,
  type TodayView,
} from '@allotr/shared';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y.ts';
import { account } from './account.ts';

// The accounts view (FR-W2, FR-L2, FR-L8). One instance per size; the
// tests build on each other. The server runs on the real clock, so figures
// are compared with the API, never hardcoded.
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL ?? '';
  const api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
  expect((await api.post('/v1/onboarding', { data: account })).ok()).toBe(true);
  await api.dispose();
});

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post('/v1/auth/sign-in/email', {
    data: { email: account.email, password: account.password },
    headers: { origin: baseURL ?? '' },
  });
  expect(response.ok()).toBe(true);
});

function post(
  page: Page,
  baseURL: string | undefined,
  path: string,
  data: object,
) {
  return page.request.post(path, { data, headers: { origin: baseURL ?? '' } });
}

async function accounts(page: Page): Promise<AccountListView> {
  return (await (
    await page.request.get('/v1/accounts?includeArchived=true')
  ).json()) as AccountListView;
}

async function today(page: Page): Promise<TodayView> {
  return (await (await page.request.get('/v1/today')).json()) as TodayView;
}

const section = (page: Page, name: 'On budget' | 'Off budget') =>
  page.getByRole('region', { name, exact: true });
const row = (page: Page, name: string) =>
  page.getByRole('listitem', { name, exact: true });

async function createAccount(
  page: Page,
  fields: { name: string; currency: string; balance: string; off?: boolean },
) {
  await page.getByRole('button', { name: 'New account' }).click();
  const dialog = page.getByRole('dialog', { name: 'New account' });
  await dialog.getByLabel('Name').fill(fields.name);
  await dialog.getByLabel('Currency').selectOption(fields.currency);
  if (fields.off === true) await dialog.getByLabel(/^Off budget/).check();
  await dialog
    .getByLabel(`Opening balance in ${fields.currency}`)
    .fill(fields.balance);
  await dialog.getByRole('button', { name: 'Add account' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`${fields.name} added.`)).toBeAttached();
}

test('accounts in two currencies total with the manual rate, and a missing rate is flagged', async ({
  page,
  baseURL,
}) => {
  await page.goto('/accounts');
  await expect(
    page.getByText('No accounts yet', { exact: false }),
  ).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'New account' }).click();
  const dialog = page.getByRole('dialog', { name: 'New account' });
  await expect(dialog.getByLabel('Currency')).toHaveValue('USD');
  await dialog.getByRole('button', { name: 'Add account' }).click();
  await expect(dialog.getByLabel('Name')).toBeFocused();
  await expect(dialog.getByText('Enter a name.')).toBeVisible();
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Close' }).click();

  await createAccount(page, {
    name: 'Everyday',
    currency: 'USD',
    balance: '1,250.00',
  });
  await createAccount(page, {
    name: 'Travel',
    currency: 'EUR',
    balance: '200',
  });
  await expect(row(page, 'Travel')).toContainText('€200.00');

  // Without a EUR rate, the euros are left out and flagged.
  const on = section(page, 'On budget');
  let list = await accounts(page);
  expect(list.totals.on).toEqual({
    amount: money(125_000, 'USD'),
    missingRates: ['EUR'],
  });
  await expect(on.getByTestId('total-on')).toHaveText('$1,250.00');
  await expect(on).toContainText(
    'Leaves out EUR: there is no exchange rate to USD.',
  );
  await expect(on.getByRole('link', { name: 'Add a EUR rate' })).toBeVisible();
  await expectAccessible(page);

  // A duplicate name is a field error, not a new account.
  await page.getByRole('button', { name: 'New account' }).click();
  const again = page.getByRole('dialog', { name: 'New account' });
  await again.getByLabel('Name').fill('Travel');
  await again.getByRole('button', { name: 'Add account' }).click();
  await expect(
    again.getByText('Another open account has this name.'),
  ).toBeVisible();
  await expect(again.getByLabel('Name')).toBeFocused();
  await again.getByRole('button', { name: 'Close' }).click();

  const rate = await post(page, baseURL, '/v1/rates', {
    base: 'EUR',
    quote: 'USD',
    rate: '1.1',
  });
  expect(rate.ok()).toBe(true);
  await page.reload();
  list = await accounts(page);
  expect(list.totals.on).toEqual({
    amount: money(147_000, 'USD'),
    missingRates: [],
  });
  await expect(on.getByTestId('total-on')).toHaveText(
    formatMoney(list.totals.on.amount, 'en-US'),
  );
  await expect(on).not.toContainText('Leaves out');
});

test('moving an account off budget lowers Today’s figure from that day', async ({
  page,
}) => {
  await page.goto('/accounts');
  await createAccount(page, {
    name: 'Holiday fund',
    currency: 'USD',
    balance: '300',
  });
  const before = await today(page);

  await row(page, 'Holiday fund')
    .getByRole('button', { name: 'Move off budget' })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Move Holiday fund off budget?',
  });
  await expect(dialog).toContainText(
    'From today, its $300.00 counts as savings',
  );
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Move off budget' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    section(page, 'Off budget').getByRole('listitem', { name: 'Holiday fund' }),
  ).toBeVisible();
  await expect(
    section(page, 'Off budget').getByRole('button', {
      name: 'Move on budget Holiday fund',
    }),
  ).toBeFocused();

  const after = await today(page);
  expect(after.available).toEqual(
    money(before.available.amountMinor - 30_000, 'USD'),
  );
  await page.getByRole('link', { name: 'Today' }).first().click();
  await expect(page.getByTestId('left-today')).toHaveText(
    formatMoney(after.leftToday, 'en-US'),
  );

  // The switch is an entry dated today in the account's ledger.
  const holiday = (await accounts(page)).accounts.find(
    (a) => a.name === 'Holiday fund',
  );
  await page.goto(`/ledger?account=${holiday?.id ?? ''}`);
  await expect(page.getByText('Moved off budget')).toBeVisible();
});

test('archiving an account with a balance goes through a transfer, then archives', async ({
  page,
}) => {
  await page.goto('/accounts');
  await createAccount(page, {
    name: 'Euro savings',
    currency: 'EUR',
    balance: '50',
    off: true,
  });

  await row(page, 'Travel').getByRole('button', { name: 'Archive' }).click();
  const dialog = page.getByRole('dialog', { name: 'Archive Travel?' });
  await expect(dialog).toContainText('It still holds €200.00.');
  await expect(
    dialog.getByLabel('Transferring it to another account'),
  ).toBeChecked();
  await expect(dialog.getByLabel('Transfer to')).toHaveValue(
    (await accounts(page)).accounts.find((a) => a.name === 'Euro savings')
      ?.id ?? '',
  );
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Transfer and archive' }).click();
  await expect(dialog).toBeHidden();

  await expect(row(page, 'Travel')).toHaveCount(0);
  await expect(page.getByText('Travel archived.')).toBeAttached();
  await expect(page.locator('main')).toBeFocused();
  await expect(row(page, 'Euro savings')).toContainText('€250.00');
  const archived = page.getByText('Archived (1 account)');
  await archived.click();
  await expect(
    page.getByRole('link', { name: 'Entries of Travel' }),
  ).toBeVisible();
  await expectAccessible(page);

  const list = await accounts(page);
  expect(list.accounts.find((a) => a.name === 'Travel')).toMatchObject({
    archived: true,
    balance: money(0, 'EUR'),
  });
  expect(list.accounts.find((a) => a.name === 'Euro savings')?.balance).toEqual(
    money(25_000, 'EUR'),
  );
});

test('an account at zero balance archives after a plain confirm', async ({
  page,
}) => {
  await page.goto('/accounts');
  await createAccount(page, {
    name: 'Old wallet',
    currency: 'USD',
    balance: '',
  });
  await row(page, 'Old wallet')
    .getByRole('button', { name: 'Archive' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Archive Old wallet?' });
  await expect(dialog).toContainText('It leaves the list');
  await expect(dialog.getByRole('radio')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, 'Old wallet')).toHaveCount(0);
  await expect(page.getByText('Archived (2 accounts)')).toBeVisible();
});

test('reconciling an on-budget account records a match, then adjusts a difference and changes Today', async ({
  page,
}) => {
  await page.goto('/accounts');
  const everyday = row(page, 'Everyday');
  await expect(everyday).toContainText('Not reconciled yet');
  const balance = (await accounts(page)).accounts.find(
    (a) => a.name === 'Everyday',
  )?.balance;
  if (balance === undefined) throw new Error('no Everyday account');

  // The bank agrees: recorded, nothing posted.
  await everyday.getByRole('button', { name: 'Reconcile Everyday' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reconcile Everyday' });
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Compare' }).click();
  await expect(dialog.getByText('Enter the bank balance.')).toBeVisible();
  await expect(dialog.getByLabel('Bank balance in USD')).toBeFocused();
  await dialog
    .getByLabel('Bank balance in USD')
    .fill(formatMoney(balance, 'en-US').replace('$', ''));
  await dialog.getByRole('button', { name: 'Compare' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Everyday matches the bank.')).toBeAttached();
  await expect(everyday).toContainText('Reconciled ');

  // The bank shows $12.50 less: the difference is offered as one adjustment.
  const before = await today(page);
  await everyday.getByRole('button', { name: 'Reconcile Everyday' }).click();
  const stated = money(balance.amountMinor - 1_250, 'USD');
  await dialog
    .getByLabel('Bank balance in USD')
    .fill(formatMoney(stated, 'en-US').replace('$', ''));
  await dialog.getByRole('button', { name: 'Compare' }).click();
  const difference = dialog.getByTestId('reconcile-difference');
  await expect(difference).toBeFocused();
  await expect(difference).toContainText(
    'The bank shows $12.50 less than the ledger',
  );
  await expect(difference).toContainText('This changes what you can spend.');
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Adjust to match' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Everyday now matches the bank.')).toBeAttached();
  await expect(everyday.getByTestId('account-row-balance')).toHaveText(
    formatMoney(stated, 'en-US'),
  );

  const after = await today(page);
  expect(after.available).toEqual(
    money(before.available.amountMinor - 1_250, 'USD'),
  );
  await page.getByRole('link', { name: 'Today' }).first().click();
  await expect(page.getByTestId('left-today')).toHaveText(
    formatMoney(after.leftToday, 'en-US'),
  );

  // The adjustment is an ordinary entry in the ledger.
  const id = (await accounts(page)).accounts.find(
    (a) => a.name === 'Everyday',
  )?.id;
  await page.goto(`/ledger?account=${id ?? ''}`);
  await expect(
    page.getByRole('link', { name: /^Unrecorded Everyday -\$12\.50/ }),
  ).toBeVisible();
});
