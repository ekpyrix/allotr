import type { ThemeDraft } from './draft.ts';

// An imported palette waiting for the editor: Appearance reads the file,
// then opens /settings/themes/new, which takes the draft once. It lives in
// memory only, so a reload starts the editor afresh.

let pending: ThemeDraft | undefined;

export function handOffDraft(draft: ThemeDraft): void {
  pending = draft;
}

export function takeDraft(): ThemeDraft | undefined {
  const draft = pending;
  pending = undefined;
  return draft;
}
