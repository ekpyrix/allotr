import { expect, test } from '@playwright/test';
import { expectAccessible } from './a11y.ts';

// Every primitive in the gallery at the three design widths (390, 820 and
// 1440 px), in a light and a dark theme, at rest and with overlays open.

const widths = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const size of widths) {
  test.describe(`${size.name} ${String(size.width)} px`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test.beforeEach(async ({ page }) => {
      await page.goto('/dev/components');
      await expect(
        page.getByRole('heading', { name: 'Components', level: 1 }),
      ).toBeVisible();
    });

    for (const theme of ['light', 'dark'] as const) {
      test(`the gallery passes axe in ${theme}`, async ({ page }) => {
        await page.evaluate((scheme) => {
          document.documentElement.dataset.theme = scheme;
        }, theme);
        await expectAccessible(page);
      });
    }

    test('nothing is round', async ({ page }) => {
      const radii = await page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          .map((el) => getComputedStyle(el).borderTopLeftRadius)
          .filter((radius) => radius !== '0px'),
      );
      expect(radii).toEqual([]);
    });

    test('keyboard focus shows a solid 2 px ring', async ({ page }) => {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus-visible');
      await expect(focused).toHaveCount(1);
      const ring = await focused.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          style: style.outlineStyle,
          width: parseFloat(style.outlineWidth),
        };
      });
      expect(ring.style).toBe('solid');
      expect(ring.width).toBeGreaterThanOrEqual(2);
    });

    test('a menu opens from the keyboard, passes axe and returns focus', async ({
      page,
    }) => {
      const trigger = page.getByRole('button', { name: /^Period/ }).first();
      await trigger.focus();
      await page.keyboard.press('Enter');
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      await expectAccessible(page);
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
    });

    test('a menu is a popover from 600 px and a bottom sheet below', async ({
      page,
    }) => {
      await page
        .getByRole('button', { name: /^Period/ })
        .first()
        .click();
      // React Aria gives a popover role=dialog too; the sheet is the modal.
      const sheet = page.locator(
        '[aria-modal="true"], [data-rac][role="dialog"]:not([data-trigger])',
      );
      const popover = page.locator('[data-trigger="MenuTrigger"]');
      await expect(page.getByRole('menu')).toBeVisible();
      if (size.width < 600) {
        await expect(sheet.first()).toBeVisible();
        await expect(popover).toHaveCount(0);
      } else {
        await expect(popover).toBeVisible();
      }
    });

    test('every control meets the 24 px target size', async ({ page }) => {
      const small = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            'button, [role="menuitem"], [role="radio"], a[href]',
          ),
        ]
          .map((el) => ({ el, box: el.getBoundingClientRect() }))
          .filter(
            ({ box }) => box.width > 0 && (box.width < 24 || box.height < 24),
          )
          .map(({ el }) => el.textContent.trim() || el.ariaLabel),
      );
      expect(small).toEqual([]);
    });
  });
}
