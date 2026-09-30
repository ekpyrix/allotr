import { expect, test } from '@playwright/test';
import { expectAccessible } from './a11y.ts';

// Every primitive in the gallery passes axe in four palette themes (two
// light, two dark), at rest and with overlays open.

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/components');
  await expect(
    page.getByRole('heading', { name: 'Components', level: 1 }),
  ).toBeVisible();
});

test('the gallery is accessible at rest', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(4);
  await expectAccessible(page);
});

test('hovered buttons keep their contrast', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Hover needs a pointer');
  for (const name of ['Save', 'Edit', 'Delete', 'Cancel']) {
    await page.getByRole('button', { name, exact: true }).first().hover();
    await expectAccessible(page);
  }
});

test('a dialog traps focus, passes axe and returns focus', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Open dialog' }).first();
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Reverse this entry?' });
  await expect(dialog).toBeVisible();
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('a menu opens from the keyboard and passes axe', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Open menu' }).last();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Reverse' })).toBeVisible();
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('controls change state and say so', async ({ page }) => {
  const haptics = page.getByRole('switch', { name: 'Haptics' }).first();
  await expect(haptics).toBeChecked();
  await haptics.click();
  await expect(haptics).not.toBeChecked();

  const food = page.getByRole('button', { name: 'Food' }).first();
  await expect(food).toHaveAttribute('aria-pressed', 'true');
  await food.click();
  await expect(food).toHaveAttribute('aria-pressed', 'false');

  const week = page.getByRole('radio', { name: 'Week' }).first();
  await week.click();
  await expect(week).toBeChecked();

  await page.getByRole('tab', { name: 'Days' }).first().click();
  await expect(page.getByRole('tabpanel').first()).toHaveText('Days panel.');
  await expectAccessible(page);
});

test('a snackbar announces its message and offers its action', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Show snackbar' }).first().click();
  await expect(page.locator('[data-slot="snackbar-status"]')).toHaveText(
    /Saved\. .* left today/,
  );
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden();
});

test('keyboard focus shows a solid 2 px ring', async ({ page }) => {
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus-visible');
  await expect(focused).toHaveCount(1);
  const ring = await focused.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(ring.style).toBe('solid');
  expect(ring.width).toBeGreaterThanOrEqual(2);
});
