import { daysBetween, isLocalDate, type LocalDate } from '@allotr/shared';

// The weekly review shows once a week: dismissing it hides it for seven
// days. The day of the dismissal is kept on this device only.

const KEY = 'allotr.review-dismissed';
const WEEK = 7;

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readDismissed(store: Pick<Storage, 'getItem'> | undefined) {
  try {
    const value = store?.getItem(KEY) ?? null;
    return value !== null && isLocalDate(value) ? value : null;
  } catch {
    return null;
  }
}

/** Whether the review is due: never dismissed, or dismissed a week ago. */
export function reviewDue(dismissed: LocalDate | null, today: LocalDate) {
  return dismissed === null || daysBetween(dismissed, today) >= WEEK;
}

export function loadDismissed(): LocalDate | null {
  return readDismissed(storage());
}

export function saveDismissed(today: LocalDate): void {
  try {
    storage()?.setItem(KEY, today);
  } catch {
    // Without storage the card simply comes back next visit.
  }
}
