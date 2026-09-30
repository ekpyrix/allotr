import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Fails on any WCAG 2.2 A or AA violation on the current page (NFR-8).
 * Entrances that fade in are let finish first, so contrast is checked on
 * what stays on screen rather than a frame of the fade; endless ones (the
 * skeleton pulse) are not waited for.
 */
export async function expectAccessible(page: Page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          // Time-based and running: scroll-driven ones (the top app bar)
          // follow the scroll position and never finish.
          .filter(
            (a) =>
              a.timeline === document.timeline &&
              a.playState === 'running' &&
              a.effect?.getTiming().iterations !== Infinity,
          )
          .map((a) => a.finished.catch(() => undefined)),
      ),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]),
  );
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}
