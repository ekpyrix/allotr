import type { CategoryView, LocalDate } from '@allotr/shared';
import { t } from '@/messages/t';

// Labels for the cycle, history and savings views. Amounts come from the
// server as they are; nothing here adds or converts money.

const rangeFormatters = new Map<string, Intl.DateTimeFormat>();

/** Two calendar days as one range, such as "Mar 1 – 24, 2026". */
export function formatRange(
  from: LocalDate,
  to: LocalDate,
  locale: string,
): string {
  let formatter = rangeFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    rangeFormatters.set(locale, formatter);
  }
  return formatter.formatRange(
    new Date(`${from}T00:00:00Z`),
    new Date(`${to}T00:00:00Z`),
  );
}

/**
 * Category names for figures: a subcategory with its parent, such as
 * "Food › Groceries". Merged categories keep their names for old entries,
 * though the server already counts them as the one they merged into.
 */
export function categoryNames(
  categories: readonly CategoryView[],
): Map<string, string> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return new Map(
    categories.map((c) => {
      const parent = c.parentId === null ? undefined : byId.get(c.parentId);
      return [
        c.id,
        parent === undefined ? c.name : `${parent.name} › ${c.name}`,
      ];
    }),
  );
}

export function categoryName(
  names: ReadonlyMap<string, string>,
  id: string | null,
): string {
  return (id === null ? undefined : names.get(id)) ?? t('cycle.noCategory');
}
