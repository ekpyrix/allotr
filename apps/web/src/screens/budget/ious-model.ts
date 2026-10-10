import type { IouView } from '@allotr/shared';

// IOUs grouped by person. Only counts and server figures are used: a
// person's open IOUs are never added together (that sum would be browser
// money maths), so a person with several shows the count and each IOU's own
// figure in the detail.

export type Person = Readonly<{
  /** Lower-cased name: the same person however it was typed. */
  key: string;
  name: string;
  /** Every IOU with this person, newest first. */
  ious: readonly IouView[];
  open: readonly IouView[];
  owedToMe: readonly IouView[];
  owedByMe: readonly IouView[];
  /** The most days any open IOU is past its due date; 0 when none is. */
  daysOverdue: number;
  writeOffOffered: boolean;
  settled: boolean;
}>;

export function personKey(name: string): string {
  return name.trim().toLowerCase();
}

function newestFirst(a: IouView, b: IouView): number {
  return b.recordedOn.localeCompare(a.recordedOn) || b.id.localeCompare(a.id);
}

/**
 * People with their IOUs. Overdue first, then people with something open
 * (by name), then settled ones (by name). Settled people appear only with
 * `showSettled`.
 */
export function groupPeople(
  ious: readonly IouView[],
  showSettled: boolean,
): Person[] {
  const byKey = new Map<string, IouView[]>();
  for (const iou of ious) {
    const key = personKey(iou.person);
    byKey.set(key, [...(byKey.get(key) ?? []), iou]);
  }
  const people: Person[] = [];
  for (const [key, group] of byKey) {
    const all = [...group].sort(newestFirst);
    const open = all.filter((i) => !i.settled);
    if (open.length === 0 && !showSettled) continue;
    const [first] = all;
    if (first === undefined) continue;
    people.push({
      key,
      name: first.person,
      ious: all,
      open,
      owedToMe: open.filter((i) => i.direction === 'owed-to-me'),
      owedByMe: open.filter((i) => i.direction === 'owed-by-me'),
      daysOverdue: Math.max(0, ...open.map((i) => i.daysOverdue)),
      writeOffOffered: open.some(
        (i) => i.direction === 'owed-to-me' && i.writeOffOffered,
      ),
      settled: open.length === 0,
    });
  }
  return people.sort(
    (a, b) =>
      Number(b.daysOverdue > 0) - Number(a.daysOverdue > 0) ||
      Number(a.settled) - Number(b.settled) ||
      a.name.localeCompare(b.name),
  );
}

/** How many open IOUs are past their due date (a count, not money). */
export function overdueCount(ious: readonly IouView[]): number {
  return ious.filter((i) => i.overdue && !i.settled).length;
}

export function openCount(ious: readonly IouView[]): number {
  return ious.filter((i) => !i.settled).length;
}

/**
 * The single open IOU whose outstanding amount stands for the person, or
 * null when they have none or several (then the row shows a count).
 */
export function soleOpen(person: Person): IouView | null {
  const [only] = person.open;
  return person.open.length === 1 && only !== undefined ? only : null;
}
