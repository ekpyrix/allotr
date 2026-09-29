import type { TransactionView } from '@allotr/shared';
import { t } from '@/messages/t';

// An entry's categories: its own, or one per line of a split (FR-L5),
// whose postings carry them while the entry itself has none.

export function entryCategoryIds(entry: TransactionView): string[] {
  if (entry.categoryId !== null) return [entry.categoryId];
  return [
    ...new Set(
      entry.postings.flatMap((p) =>
        p.categoryId === null ? [] : [p.categoryId],
      ),
    ),
  ];
}

/** "Groceries", or "Split: Groceries, Eating out"; undefined for none. */
export function categoryTitle(
  entry: TransactionView,
  nameOf: ReadonlyMap<string, string>,
): string | undefined {
  const names = entryCategoryIds(entry)
    .map((id) => nameOf.get(id))
    .filter((name) => name !== undefined);
  if (names.length <= 1) return names[0];
  return t('entries.split', { names: names.join(', ') });
}
