import { expect, test } from '@playwright/test';
import { expectAccessible } from './a11y.ts';

// The production build serves the placeholder index until the shell lands.

test('the app loads and passes axe', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Allotr');
  await expect(
    page.getByRole('heading', { name: 'Allotr', level: 1 }),
  ).toBeVisible();
  await expectAccessible(page);
});
