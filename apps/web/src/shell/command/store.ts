import type { Money } from '@allotr/shared';
import { useSyncExternalStore } from 'react';

// The command line's small shared state, outside React so the keyboard map
// (`/`), the result line and the + new menu reach it without prop drilling:
//
//   focusCommandLine()      focuses the input; false when it is not mounted
//   registerCommandInput()  the input registers itself on mount
//   useCommandState()       the "into" account, the last logged entry and
//                           the open + new form
//   openNewForm(kind)       the one seam the structured forms replace later

/** The + new menu, in order (docs/ui.md §3). */
export const NEW_FORM_KINDS = [
  'expense',
  'income',
  'transfer',
  'split',
  'payday',
  'bill',
  'iou',
] as const;
export type NewFormKind = (typeof NEW_FORM_KINDS)[number];

/** What the result line shows after an entry was logged. */
export interface LoggedEntry {
  readonly id: string;
  /** Signed as stored. */
  readonly amount: Money;
  readonly kind: 'expense' | 'income' | 'transfer';
  readonly accountName: string;
  readonly categoryLabel: string | null;
}

export interface CommandState {
  /** The account the next entry goes into; null for the default one. */
  readonly intoAccountId: string | null;
  readonly logged: LoggedEntry | null;
  readonly newForm: NewFormKind | null;
}

interface Focusable {
  focus: () => void;
}

const initial: CommandState = {
  intoAccountId: null,
  logged: null,
  newForm: null,
};

let state: CommandState = initial;
let input: Focusable | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<CommandState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function getCommandState(): CommandState {
  return state;
}

export function subscribeCommandState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCommandState(): CommandState {
  return useSyncExternalStore(subscribeCommandState, getCommandState);
}

export function registerCommandInput(element: Focusable | null): void {
  input = element;
}

/** Focuses the command line input. Returns false when it is not mounted. */
export function focusCommandLine(): boolean {
  if (input === null) return false;
  input.focus();
  return true;
}

export function setIntoAccount(accountId: string | null): void {
  update({ intoAccountId: accountId });
}

export function showLogged(entry: LoggedEntry): void {
  update({ logged: entry });
}

export function dismissLogged(): void {
  if (state.logged !== null) update({ logged: null });
}

/** Opens the form for a + new item. The structured forms land here later. */
export function openNewForm(kind: NewFormKind): void {
  update({ newForm: kind });
}

export function closeNewForm(): void {
  if (state.newForm !== null) update({ newForm: null });
}

/** Back to the initial state, for tests. */
export function resetCommandState(): void {
  input = null;
  state = initial;
  for (const listener of listeners) listener();
}
