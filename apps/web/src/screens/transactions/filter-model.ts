import type { CategoryView } from '@allotr/shared';
import { TYPES, type EntryType } from './search-params.ts';
import type { CategoryNode } from '@/features/settings/categories-model';

// The filter menu's category tree. A parent selects or clears all of its
// children (docs/ui.md §5); the server also takes a parent to mean its
// children, so a selected parent alone would match the same entries, but
// keeping the children listed keeps the checkboxes honest.

export type Selected = ReadonlySet<string>;

const childIds = (node: CategoryNode) => node.children.map((c) => c.id);

/** Toggles a top-level category together with its subcategories. */
export function toggleParent(
  selected: readonly string[],
  node: CategoryNode,
): string[] {
  const family = [node.category.id, ...childIds(node)];
  const on = selected.includes(node.category.id);
  return on
    ? selected.filter((id) => !family.includes(id))
    : [...new Set([...selected, ...family])];
}

/** Toggles one subcategory; the parent follows whether all siblings are on. */
export function toggleChild(
  selected: readonly string[],
  node: CategoryNode,
  childId: string,
): string[] {
  const next = selected.includes(childId)
    ? selected.filter((id) => id !== childId)
    : [...selected, childId];
  const all = childIds(node).every((id) => next.includes(id));
  const without = next.filter((id) => id !== node.category.id);
  return all ? [...without, node.category.id] : without;
}

/** The node a category id belongs to, and whether it is the parent. */
export function nodeOf(
  tree: readonly CategoryNode[],
  id: string,
): { node: CategoryNode; parent: boolean } | undefined {
  for (const node of tree) {
    if (node.category.id === id) return { node, parent: true };
    if (node.children.some((c) => c.id === id)) return { node, parent: false };
  }
  return undefined;
}

/** Applies a menu toggle of `id` to the selection. */
export function toggleCategory(
  selected: readonly string[],
  tree: readonly CategoryNode[],
  id: string,
): string[] {
  const found = nodeOf(tree, id);
  if (found === undefined) {
    return selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
  }
  return found.parent
    ? toggleParent(selected, found.node)
    : toggleChild(selected, found.node, id);
}

export interface FilterChip {
  /** `category:ID`, `account:ID` or `type`. */
  key: string;
  label: string;
}

/**
 * One chip per filter value. A selected parent stands for its children, so
 * their chips are left out; the "×" on the parent clears them together.
 */
export function categoryChips(
  selected: readonly string[],
  categories: readonly CategoryView[],
): FilterChip[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return selected.flatMap((id) => {
    const category = byId.get(id);
    if (category === undefined) return [];
    if (category.parentId !== null && selected.includes(category.parentId)) {
      return [];
    }
    return [{ key: `category:${id}`, label: category.name }];
  });
}

/** Removes a chip's category; a parent also takes its children with it. */
export function removeCategory(
  selected: readonly string[],
  categories: readonly CategoryView[],
  id: string,
): string[] {
  const children = categories.filter((c) => c.parentId === id).map((c) => c.id);
  return selected.filter((s) => s !== id && !children.includes(s));
}

// The filter menu is one multi-select menu. Its keys name the section they
// belong to, and the type section behaves like radio buttons.

export interface FilterState {
  type: EntryType | undefined;
  categories: readonly string[];
  accounts: readonly string[];
}

export function filterKeys(state: FilterState): Set<string> {
  return new Set([
    ...(state.type === undefined ? [] : [`type:${state.type}`]),
    ...state.categories.map((id) => `category:${id}`),
    ...state.accounts.map((id) => `account:${id}`),
  ]);
}

/** The filter after the menu reports `next` as its selection. */
export function applyFilterKeys(
  state: FilterState,
  next: ReadonlySet<string>,
  tree: readonly CategoryNode[],
): FilterState {
  const before = filterKeys(state);
  let { type, categories, accounts } = state;
  for (const key of next) {
    if (before.has(key)) continue;
    const [kind, id] = splitKey(key);
    if (kind === 'type') type = TYPES.find((t) => t === id);
    else if (kind === 'category') {
      categories = toggleCategory(categories, tree, id);
    } else if (kind === 'account') accounts = [...accounts, id];
  }
  for (const key of before) {
    if (next.has(key)) continue;
    const [kind, id] = splitKey(key);
    if (kind === 'type') type = undefined;
    else if (kind === 'category') {
      categories = toggleCategory(categories, tree, id);
    } else if (kind === 'account') {
      accounts = accounts.filter((a) => a !== id);
    }
  }
  return { type, categories, accounts };
}

function splitKey(key: string): [string, string] {
  const at = key.indexOf(':');
  return [key.slice(0, at), key.slice(at + 1)];
}
