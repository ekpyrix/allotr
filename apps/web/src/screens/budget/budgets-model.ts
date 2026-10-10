import type { BudgetView, CategoryIcon, CategoryView } from '@allotr/shared';
import { spentShare } from '@/features/budget/share';
import {
  categoryStyles,
  seriesNumber,
  type SeriesNumber,
} from '@/lib/category-style';

// The budget tree's shape. Budgets sit on categories, so a budget on a
// subcategory is listed under its parent's row. A parent with no budget of
// its own is a header: it shows no figures, because the browser never sums.

export type TreeRole = 'parent' | 'child' | 'last-child' | 'flat';

export type TreeEntry = Readonly<{
  /** Row key; the top-level category's id for a parent. */
  key: string;
  role: TreeRole;
  /** The top-level key a child folds under. */
  group: string;
  name: string;
  budget: BudgetView | null;
  categoryId: string | null;
  icon: CategoryIcon | null;
  colour: SeriesNumber;
  /** The bar's fill, 0..1; 0 when there is no budget. */
  fraction: number;
  over: boolean;
}>;

function barOf(budget: BudgetView | null) {
  return budget === null
    ? { fraction: 0, over: false }
    : {
        fraction: spentShare(budget.spent, budget.left) / 100,
        over: budget.overflow.amountMinor > 0,
      };
}

function categoryOf(budget: BudgetView): string {
  return budget.target.kind === 'category' ? budget.target.categoryId : '';
}

function takenCategories(budgets: readonly BudgetView[]): Set<string> {
  return new Set(
    budgets.flatMap((b) =>
      b.target.kind === 'category' ? [b.target.categoryId] : [],
    ),
  );
}

/** The tree in display order: categories by position, then tag and Buffer budgets. */
export function budgetTree(
  budgets: readonly BudgetView[],
  categories: readonly CategoryView[],
): readonly TreeEntry[] {
  const styles = categoryStyles(categories);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const onCategory = new Map<string, BudgetView>();
  const others: BudgetView[] = [];
  for (const budget of budgets) {
    if (budget.target.kind === 'category') {
      onCategory.set(budget.target.categoryId, budget);
    } else {
      others.push(budget);
    }
  }
  const tops = new Map<string, BudgetView[]>();
  for (const [categoryId, budget] of onCategory) {
    const top = byId.get(categoryId)?.parentId ?? categoryId;
    tops.set(top, [...(tops.get(top) ?? []), budget]);
  }
  const order = (id: string) => byId.get(id)?.position ?? 0;
  const make = (
    key: string,
    role: TreeRole,
    group: string,
    name: string,
    budget: BudgetView | null,
    categoryId: string | null,
  ): TreeEntry => {
    const s = categoryId === null ? undefined : styles.get(categoryId);
    return {
      key,
      role,
      group,
      name,
      budget,
      categoryId,
      icon: s?.icon ?? null,
      colour: s === undefined ? 1 : seriesNumber(s.colour),
      ...barOf(budget),
    };
  };
  const entries: TreeEntry[] = [];
  const topIds = [...tops.keys()].sort(
    (a, b) => order(a) - order(b) || a.localeCompare(b),
  );
  for (const top of topIds) {
    const own = onCategory.get(top) ?? null;
    const kids = (tops.get(top) ?? [])
      .filter((b) => b !== own)
      .sort(
        (a, b) =>
          order(categoryOf(a)) - order(categoryOf(b)) ||
          a.name.localeCompare(b.name),
      );
    const name = own?.name ?? byId.get(top)?.name ?? '';
    if (kids.length === 0 && own !== null) {
      entries.push(make(top, 'flat', top, name, own, top));
      continue;
    }
    entries.push(make(top, 'parent', top, name, own, top));
    kids.forEach((kid, index) => {
      entries.push(
        make(
          kid.id,
          index === kids.length - 1 ? 'last-child' : 'child',
          top,
          kid.name,
          kid,
          categoryOf(kid),
        ),
      );
    });
  }
  for (const budget of others) {
    entries.push(make(budget.id, 'flat', budget.id, budget.name, budget, null));
  }
  return entries;
}

/** The entries to show, leaving out children of folded parents. */
export function visibleEntries(
  entries: readonly TreeEntry[],
  folded: ReadonlySet<string>,
): readonly TreeEntry[] {
  return entries.filter(
    (entry) =>
      entry.role === 'parent' ||
      entry.role === 'flat' ||
      !folded.has(entry.group),
  );
}

/** Subcategories of a budget's category that have no budget yet. */
export function subCandidates(
  budget: BudgetView,
  budgets: readonly BudgetView[],
  categories: readonly CategoryView[],
): readonly CategoryView[] {
  if (budget.target.kind !== 'category') return [];
  const parent = budget.target.categoryId;
  const taken = takenCategories(budgets);
  return categories.filter(
    (c) => c.parentId === parent && c.mergedIntoId === null && !taken.has(c.id),
  );
}

/** Categories a new budget can count: expense ones with no budget yet. */
export function freeCategories(
  budgets: readonly BudgetView[],
  categories: readonly CategoryView[],
): readonly CategoryView[] {
  const taken = takenCategories(budgets);
  return categories.filter(
    (c) => c.kind === 'expense' && c.mergedIntoId === null && !taken.has(c.id),
  );
}
