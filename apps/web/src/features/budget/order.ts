/**
 * The list with the item at `from` moved to index `to`. Out-of-range moves
 * leave it as it was. Used by the cover order, drag and keyboard alike.
 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const item = next[from];
  if (item === undefined || to < 0 || to >= list.length || from === to)
    return next;
  next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
