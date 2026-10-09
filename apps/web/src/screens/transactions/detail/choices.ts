import type { AccountView, CategoryView } from '@allotr/shared';
import type { Choice } from './fields.tsx';

/** Open accounts, plus any the entry already uses (it may be archived). */
export function accountChoicesFor(
  accounts: readonly AccountView[],
  keep: readonly string[],
): Choice[] {
  return accounts
    .filter((a) => !a.archived || keep.includes(a.id))
    .map((a) => ({ id: a.id, label: a.name }));
}

/**
 * Categories of the entry's kind as "Parent › Child", parents first with
 * their children right after, in the order the server keeps them.
 */
export function categoryChoicesFor(
  categories: readonly CategoryView[],
  kind: CategoryView['kind'],
): Choice[] {
  const ofKind = categories.filter((c) => c.kind === kind);
  const byPosition = [...ofKind].sort((a, b) => a.position - b.position);
  const name = new Map(ofKind.map((c) => [c.id, c.name]));
  const top = byPosition.filter(
    (c) => c.parentId === null || !name.has(c.parentId),
  );
  return top.flatMap((parent) => [
    { id: parent.id, label: parent.name },
    ...byPosition
      .filter((c) => c.parentId === parent.id)
      .map((c) => ({ id: c.id, label: `${parent.name} › ${c.name}` })),
  ]);
}
