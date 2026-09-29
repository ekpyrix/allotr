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
  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeVisible();
  // Focus pauses its countdown, so it outlasts the axe run.
  await undo.focus();
  await expectAccessible(page);
  await expect(undo).toBeVisible();
  await undo.click();
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

test('a sheet opens, resizes from its handle and returns focus', async ({
  page,
}) => {
  const opener = page.getByRole('button', { name: 'Open sheet' }).first();
  await opener.click();
  const sheet = page.getByRole('dialog', { name: 'Lunch' });
  await expect(sheet).toBeVisible();
  await expectAccessible(page);
  const resize = sheet.getByRole('button', { name: 'Resize' });
  // A centred dialog on wide screens has no handle.
  if ((await resize.count()) > 0) await resize.click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();
});

test('swipe actions are all in the row menu', async ({ page }) => {
  await page
    .getByRole('button', { name: 'More actions for Lunch' })
    .first()
    .click();
  const menu = page.getByRole('menu');
  for (const name of ['Edit', 'Reverse', 'Duplicate'])
    await expect(menu.getByRole('menuitem', { name })).toBeVisible();
  await expectAccessible(page);
  await menu.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(page.locator('[data-slot="snackbar-status"]')).toHaveText(
    'Duplicated Lunch',
  );
});

test('the rolling number reads as plain text', async ({ page }) => {
  const roller = page.getByTestId('roller').first();
  await expect(roller).toContainText('$38.40');
  await page.getByRole('button', { name: 'Change amount' }).first().click();
  await expect(roller.locator('.sr-only')).toHaveText('$1,234.56');
});

test('reduced motion shows the final value with no roll', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const strip = page
    .getByTestId('roller')
    .first()
    .locator('[aria-hidden="true"] span span')
    .first();
  const duration = await strip.evaluate(
    (el) => getComputedStyle(el).transitionDuration,
  );
  expect(parseFloat(duration)).toBeLessThan(0.001);
});
