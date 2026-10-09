import { expect, test } from '@playwright/test';
import { expectAccessible } from './a11y.ts';

// A fresh instance has no account yet, so every address leads to onboarding.
// The page is a placeholder until the settings step restyles it.

test('a fresh instance leads to onboarding and passes axe', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page).toHaveTitle('Allotr');
  await expect(
    page.getByRole('heading', { name: 'Set up Allotr', level: 1 }),
  ).toBeVisible();
  await expectAccessible(page);
});
