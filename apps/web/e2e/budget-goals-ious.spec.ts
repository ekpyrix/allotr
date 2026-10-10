import { expect, test, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The Budget screen's goals and IOUs sub-tabs, with made-up data. The tests
// share one server per project and run in order.
test.describe.configure({ mode: 'serial' });

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as { id: string };
}

async function signIn(page: Page, origin: string) {
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
}

async function noSmallTargets(scope: ReturnType<Page['locator']>) {
  const small = await scope
    .locator('a, button, [role=button], input')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
  expect(small).toEqual([]);
}

let currency = 'USD';

test('a goal is added on a savings account and shows its progress', async ({
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
  const today = await page.request.get('/v1/today');
  currency = ((await today.json()) as { available: { currency: string } })
    .available.currency;
  const minor = (amountMinor: number) => ({ amountMinor, currency });
  await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency,
    openingBalance: minor(500_000),
  });
  await post(page, origin, '/v1/accounts', {
    name: 'Rainy day',
    currency,
    budgetGroup: 'off',
    openingBalance: minor(250_000),
  });

  await page.goto('/budget/goals');
  await expect(page.getByText(t('budgetGoalsIous.goals.empty'))).toBeVisible();
  await expectAccessible(page);

  await page
    .getByRole('button', { name: t('budgetGoalsIous.goals.add') })
    .click();
  const sheet = page.getByRole('dialog', {
    name: t('budgetGoalsIous.goals.form.title'),
  });
  await expect(sheet).toBeVisible();
  await expectAccessible(page);
  await noSmallTargets(sheet);

  // An empty form says what is wrong next to each field.
  await sheet
    .getByRole('button', { name: t('budgetGoalsIous.goals.form.submit') })
    .click();
  await expect(
    sheet.getByText(t('budgetGoalsIous.goals.form.errors.name')),
  ).toBeVisible();

  await sheet
    .getByLabel(t('budgetGoalsIous.goals.form.name'), { exact: true })
    .fill('Trip');
  await sheet
    .getByRole('button', { name: t('budgetGoalsIous.goals.form.where') })
    .click();
  await page.getByRole('menuitemradio', { name: 'Rainy day' }).click();
  await sheet
    .getByLabel(t('budgetGoalsIous.goals.form.amount'), { exact: true })
    .fill('10000.00');
  await sheet
    .getByLabel(t('budgetGoalsIous.goals.form.date'), { exact: true })
    .fill('2031-12-01');
  await sheet
    .getByRole('button', { name: t('budgetGoalsIous.goals.form.submit') })
    .click();
  await expect(sheet).toBeHidden();

  const tile = page.getByRole('region', { name: 'Trip', exact: true });
  await expect(tile).toBeVisible();
  await expect(tile).toContainText('2,500.00');
  await expect(tile).toContainText('10,000.00');
  await expect(tile.getByRole('progressbar')).toBeVisible();
  await expect(tile.getByRole('img', { name: /Trip/ })).toBeVisible();
  await expectAccessible(page);
  await noSmallTargets(tile);
});

test('the payday plan and weekly review open as sheets', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/budget/goals');
  await page
    .getByRole('button', { name: t('budgetGoalsIous.goals.weekly') })
    .click();
  const review = page.getByRole('dialog', {
    name: t('budgetGoalsIous.weekly.title'),
  });
  await expect(review).toBeVisible();
  await expect(
    review.getByText(t('budgetGoalsIous.weekly.spent')),
  ).toBeVisible();
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await expect(review).toBeHidden();

  await page
    .getByRole('button', { name: t('budgetGoalsIous.goals.payday') })
    .click();
  const payday = page.getByRole('dialog', {
    name: t('budgetGoalsIous.payday.title'),
  });
  await expect(payday).toBeVisible();
  await expect(payday).toContainText(t('budgetGoalsIous.payday.noIncome'));
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await expect(payday).toBeHidden();
});

test('a goal can be archived', async ({ page, baseURL }) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/budget/goals');
  await page
    .getByRole('button', {
      name: t('budgetGoalsIous.goals.archiveLabel', { name: 'Trip' }),
    })
    .click();
  await expect(page.getByRole('region', { name: 'Trip' })).toBeHidden();
});

function detail(page: Page, name: string) {
  return page
    .getByRole('region', { name, exact: true })
    .or(page.getByRole('dialog', { name, exact: true }));
}

test('people owing money are listed with their IOUs', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await signIn(page, origin);
  const minor = (amountMinor: number) => ({ amountMinor, currency });
  const accounts = (await (await page.request.get('/v1/accounts')).json()) as {
    accounts: { id: string; name: string }[];
  };
  const everyday = accounts.accounts.find((a) => a.name === 'Everyday');
  expect(everyday).toBeDefined();
  await post(page, origin, '/v1/categories', {
    name: 'Treats',
    kind: 'expense',
  });
  await post(page, origin, '/v1/ious', {
    direction: 'owed-to-me',
    accountId: everyday?.id,
    people: [{ person: 'Alex', amount: minor(4_000), dueOn: '2026-01-05' }],
  });
  await post(page, origin, '/v1/ious', {
    direction: 'owed-by-me',
    accountId: everyday?.id,
    people: [{ person: 'Bea', amount: minor(1_500) }],
  });

  await page.goto('/budget/ious');
  const list = page.getByRole('region', {
    name: t('budgetGoalsIous.ious.title'),
  });
  await expect(list.getByRole('button', { name: /Alex/ })).toBeVisible();
  await expect(list.getByRole('button', { name: /Bea/ })).toBeVisible();
  await expect(list.getByRole('button', { name: /Alex/ })).toContainText(
    'late',
  );
  await expect(page.getByText('40.00').first()).toBeVisible();
  await expectAccessible(page);
  await noSmallTargets(list);
});

test('a repayment settles part of an IOU and can be deleted', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/budget/ious');
  await page.getByRole('button', { name: /Alex/ }).click();
  const pane = detail(page, 'Alex');
  await expect(pane).toBeVisible();
  await expectAccessible(page);

  await pane
    .getByRole('button', {
      name: t('budgetGoalsIous.ious.actionFor', {
        action: t('budgetGoalsIous.ious.repay'),
        person: 'Alex',
      }),
    })
    .click();
  const sheet = page.getByRole('dialog', {
    name: t('budgetGoalsIous.ious.sheets.repay', { person: 'Alex' }),
  });
  await expect(sheet).toBeVisible();
  await expectAccessible(page);
  await noSmallTargets(sheet);
  await sheet
    .getByLabel(t('budgetGoalsIous.ious.form.amount'), { exact: true })
    .fill('15.00');
  await sheet
    .getByRole('button', {
      name: t('budgetGoalsIous.ious.form.recordRepayment'),
    })
    .click();
  await expect(sheet).toBeHidden();
  await expect(pane).toContainText('25.00');
  await expect(pane).toContainText(t('budgetGoalsIous.ious.repaid'));

  await pane.getByRole('button', { name: /^delete repaid/i }).click();
  await expect(pane).toContainText('40.00');
  await expect(
    pane.getByText(t('budgetGoalsIous.ious.noPayments')),
  ).toBeVisible();
});

test('a due date can be set and an IOU written off', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/budget/ious');
  await page.getByRole('button', { name: /Alex/ }).click();
  const pane = detail(page, 'Alex');

  await pane
    .getByRole('button', {
      name: t('budgetGoalsIous.ious.actionFor', {
        action: t('budgetGoalsIous.ious.dueDate'),
        person: 'Alex',
      }),
    })
    .click();
  const due = page.getByRole('dialog', {
    name: t('budgetGoalsIous.ious.sheets.due', { person: 'Alex' }),
  });
  await due
    .getByLabel(t('budgetGoalsIous.ious.form.due'), { exact: true })
    .fill('soon');
  await due
    .getByRole('button', { name: t('budgetGoalsIous.ious.form.saveDue') })
    .click();
  await expect(
    due.getByText(t('budgetGoalsIous.ious.form.errors.dueDate')),
  ).toBeVisible();
  await due
    .getByLabel(t('budgetGoalsIous.ious.form.due'), { exact: true })
    .fill('2031-01-01');
  await due
    .getByRole('button', { name: t('budgetGoalsIous.ious.form.saveDue') })
    .click();
  await expect(due).toBeHidden();
  await expect(pane).toContainText('Jan 1');
  await expect(pane).not.toContainText('late');

  await pane
    .getByRole('button', {
      name: t('budgetGoalsIous.ious.actionFor', {
        action: t('budgetGoalsIous.ious.writeOff'),
        person: 'Alex',
      }),
    })
    .click();
  const off = page.getByRole('dialog', {
    name: t('budgetGoalsIous.ious.sheets.writeOff', { person: 'Alex' }),
  });
  await expect(off).toBeVisible();
  await expectAccessible(page);
  await off
    .getByRole('button', {
      name: t('budgetGoalsIous.ious.form.confirmWriteOff'),
    })
    .click();
  await expect(off).toBeHidden();
  await expect(pane).toContainText(t('budgetGoalsIous.ious.writtenOff'));
  await expect(pane).toContainText(t('budgetGoalsIous.ious.settledTag'));
});

test('a new IOU is recorded from the form', async ({ page, baseURL }) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/budget/ious');
  await page
    .getByRole('button', { name: t('budgetGoalsIous.ious.add') })
    .click();
  const sheet = page.getByRole('dialog', {
    name: t('budgetGoalsIous.ious.sheets.loan'),
  });
  await expect(sheet).toBeVisible();
  await sheet
    .getByRole('button', { name: t('budgetGoalsIous.ious.form.record') })
    .click();
  await expect(
    sheet.getByText(t('budgetGoalsIous.ious.form.errors.person')),
  ).toBeVisible();
  await sheet
    .getByLabel(t('budgetGoalsIous.ious.form.person'), { exact: true })
    .fill('Cy');
  await sheet
    .getByLabel(t('budgetGoalsIous.ious.form.amount'), { exact: true })
    .fill('12.50');
  await sheet
    .getByRole('button', { name: t('budgetGoalsIous.ious.form.record') })
    .click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: /Cy/ })).toBeVisible();
  await expectAccessible(page);
});
