import { addDays, type LocalDate } from '@allotr/shared';
import type { Transaction } from '../ledger/types.ts';
import { nextPayday } from './payday.ts';
import type { DateWindow } from './policies.ts';
import type { Cycle, LedgerView } from './types.ts';

// Cycles run from one paycheck to the next (docs/domain.md "Cycles",
// FR-C1, FR-C2). They are derived from the ledger as of `today`, so a
// back-dated or undone paycheck reshapes them through the same function.

/** A paycheck this close to payday starts the next cycle early. */
const EARLY_PAYCHECK_DAYS = 3;

function ordered(a: Transaction, b: Transaction): number {
  return (
    a.occurredOn.localeCompare(b.occurredOn) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

function earliest(first: LocalDate, ...dates: LocalDate[]): LocalDate {
  return dates.reduce((a, b) => (b < a ? b : a), first);
}

function paychecks(view: LedgerView, today: LocalDate): Transaction[] {
  const reversed = new Set(
    view.ledger.flatMap((t) => (t.reversesId === null ? [] : [t.reversesId])),
  );
  return view.ledger
    .filter(
      (t) =>
        t.kind === 'income' &&
        // A split income opens a cycle when any of its lines is a paycheck.
        t.postings.some(
          (p) =>
            p.categoryId !== null && view.paycheckCategories.has(p.categoryId),
        ) &&
        !reversed.has(t.id) &&
        t.occurredOn <= today,
    )
    .sort(ordered);
}

/**
 * Every cycle up to `today`, oldest first. Exactly the last one is open
 * (invariant 5), and each closes on the day the next one opens.
 */
export function cyclesOf(view: LedgerView, today: LocalDate): Cycle[] {
  const { paydayRule, paydayDay, paydayOverride, startedOn } = view.settings;
  const found = paychecks(view, today);
  // Only a paycheck moves the start, so a back-dated expense never
  // reshapes the cycles.
  const first = earliest(startedOn, today, found[0]?.occurredOn ?? today);

  const cycles: Cycle[] = [];
  let open: Cycle = {
    openedOn: first,
    openedBy: null,
    payday: nextPayday(paydayRule, paydayDay, first),
    closedOn: null,
  };
  for (const paycheck of found) {
    const date = paycheck.occurredOn;
    if (date === open.openedOn && open.openedBy === null) {
      // A paycheck on the first day opens the first cycle.
      open = { ...open, openedBy: paycheck.id };
    } else if (
      date > open.openedOn &&
      date >= addDays(open.payday, -EARLY_PAYCHECK_DAYS)
    ) {
      cycles.push({ ...open, closedOn: date });
      open = {
        openedOn: date,
        openedBy: paycheck.id,
        payday: nextPayday(paydayRule, paydayDay, date),
        closedOn: null,
      };
    }
    // Any other paycheck adds to the open cycle (the "second paycheck"
    // guess in docs/domain.md "Policies").
  }
  if (paydayOverride !== null && paydayOverride > open.openedOn) {
    open = { ...open, payday: paydayOverride };
  }
  cycles.push(open);
  return cycles;
}

/** The cycle a day belongs to; days before the first go to the first. */
export function cycleOn(cycles: readonly Cycle[], date: LocalDate): Cycle {
  const found = cycles.findLast((cycle) => cycle.openedOn <= date);
  const cycle = found ?? cycles[0];
  if (cycle === undefined) throw new RangeError('There are no cycles.');
  return cycle;
}

/** The days whose bills a cycle reserves: from opening up to payday. */
export function billWindow(cycle: Cycle): DateWindow {
  const to =
    cycle.closedOn !== null && cycle.closedOn > cycle.payday
      ? cycle.closedOn
      : cycle.payday;
  return { from: cycle.openedOn, to };
}
