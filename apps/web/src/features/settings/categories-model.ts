import type { CategoryView } from '@allotr/shared';

// The category list as the settings view shows it: by kind, each top-level
// category followed by its subcategories. Merged categories only resolve
// old entries, so they are left out.

export const CATEGORY_KINDS = ['expense', 'income', 'transfer'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export interface CategoryNode {
  readonly category: CategoryView;
  readonly children: readonly CategoryView[];
}

const byPosition = (a: CategoryView, b: CategoryView) =>
  a.position - b.position || a.name.localeCompare(b.name);

export function categoryTree(
  categories: readonly CategoryView[],
): Record<CategoryKind, CategoryNode[]> {
  const active = categories.filter((c) => c.mergedIntoId === null);
  const tree: Record<CategoryKind, CategoryNode[]> = {
    expense: [],
    income: [],
    transfer: [],
  };
  for (const category of active
    .filter((c) => c.parentId === null)
    .sort(byPosition)) {
    tree[category.kind].push({
      category,
      children: active
        .filter((c) => c.parentId === category.id)
        .sort(byPosition),
    });
  }
  return tree;
}

/** "Food / Coffee" for a subcategory, the name alone for a top level. */
export function categoryPath(
  category: CategoryView,
  categories: readonly CategoryView[],
): string {
  const parent =
    category.parentId === null
      ? undefined
      : categories.find((c) => c.id === category.parentId);
  return parent === undefined
    ? category.name
    : `${parent.name} / ${category.name}`;
}

/** Where a category's entries can go: another active one of its kind. */
export function mergeTargets(
  category: CategoryView,
  categories: readonly CategoryView[],
): { id: string; label: string }[] {
  return categories
    .filter(
      (c) =>
        c.mergedIntoId === null &&
        c.id !== category.id &&
        c.kind === category.kind,
    )
    .map((c) => ({ id: c.id, label: categoryPath(c, categories) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
