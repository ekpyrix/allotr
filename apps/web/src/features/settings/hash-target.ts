// Where `/settings#<hash>` lands: the element's own `<id>-title` heading
// when it has one, so a screen reader starts at its name.
export function hashTarget(
  hash: string,
  root: Pick<Document, 'getElementById'> = document,
): { scroll: HTMLElement; focus: HTMLElement } | null {
  const id = hash.replace(/^#/, '');
  if (id === '') return null;
  const scroll = root.getElementById(id);
  if (scroll === null) return null;
  return { scroll, focus: root.getElementById(`${id}-title`) ?? scroll };
}
