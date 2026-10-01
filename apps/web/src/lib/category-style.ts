import {
  categoryColours,
  type CategoryColour,
  type CategoryIcon,
  type CategoryView,
} from '@allotr/shared';

// How a category looks (ADR 0022): its own colour and icon, else its
// parent's, else a colour picked from its id so every category has one and
// the pick never changes. The colour is a chart series role, so each theme
// paints it contrast-fitted.

export interface CategoryStyle {
  colour: CategoryColour;
  /** Null until the user (or the starter set) picks one. */
  icon: CategoryIcon | null;
}

/** A stable colour for a category without one. */
export function defaultColour(id: string): CategoryColour {
  let sum = 0;
  for (const char of id)
    sum = (sum + char.charCodeAt(0)) % categoryColours.length;
  return categoryColours[sum] ?? 'series-1';
}

/** The CSS colour of a category colour: the theme's series role. */
export function colourVar(colour: CategoryColour): string {
  return `var(--${colour})`;
}

export function categoryStyles(
  categories: readonly CategoryView[],
): ReadonlyMap<string, CategoryStyle> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return new Map(
    categories.map((category) => {
      const parent =
        category.parentId === null ? undefined : byId.get(category.parentId);
      return [
        category.id,
        {
          colour:
            category.colour ??
            parent?.colour ??
            defaultColour(parent?.id ?? category.id),
          icon: category.icon ?? parent?.icon ?? null,
        },
      ] as const;
    }),
  );
}
