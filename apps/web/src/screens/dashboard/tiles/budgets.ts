import type {
  BudgetView,
  CategoryIcon,
  CategoryView,
  Money,
} from '@allotr/shared';
import { spentShare } from '@/features/budget/share';
import {
  categoryStyles,
  seriesNumber,
  type SeriesNumber,
} from '@/lib/category-style';

export type BudgetRow = Readonly<{
  id: string;
  name: string;
  left: Money;
  /** How full the bar is, 0..1. */
  fraction: number;
  over: boolean;
  icon: CategoryIcon | null;
  /** The series number, 1..8. */
  colour: SeriesNumber;
}>;

/** One row per budget, with its category's icon and colour when it has one. */
export function budgetRows(
  budgets: readonly BudgetView[],
  categories: readonly CategoryView[],
): readonly BudgetRow[] {
  const styles = categoryStyles(categories);
  return budgets.map((b) => {
    const style =
      b.target.kind === 'category'
        ? styles.get(b.target.categoryId)
        : undefined;
    return {
      id: b.id,
      name: b.name,
      left: b.left,
      fraction: spentShare(b.spent, b.left) / 100,
      over: b.overflow.amountMinor > 0,
      icon: style?.icon ?? null,
      colour: style === undefined ? 1 : seriesNumber(style.colour),
    };
  });
}
