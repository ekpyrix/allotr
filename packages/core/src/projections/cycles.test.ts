import { describe, expect, it } from 'vitest';
import { reverse } from '../ledger/reverse.ts';
import { meta } from '../ledger/testing.ts';
import { billWindow, cycleOn, cyclesOf } from './cycles.ts';
import {
  chart,
  day,
  openingUsd,
  paycheck,
  settings,
  spend,
  view,
  viewFrom,
} from './testing.ts';

describe('cyclesOf', () => {
  it('opens the first cycle on the day the user started', () => {
    expect(cyclesOf(view([]), day('2026-03-10'))).toEqual([
      {
        openedOn: '2026-02-18',
        openedBy: null,
        payday: '2026-03-01',
        closedOn: null,
      },
    ]);
  });

  it('keeps the first cycle when an older expense is back-dated', () => {
    const ledger = [spend('2026-01-05', 500)];
    const [first] = cyclesOf(view(ledger), day('2026-02-25'));
    expect(first?.openedOn).toBe('2026-02-18');
  });

  it('opens the first cycle with an older paycheck from imported history', () => {
    const pay = paycheck('2026-01-01', 150000);
    const cycles = cyclesOf(view([pay]), day('2026-01-10'));
    expect(cycles).toEqual([
      {
        openedOn: '2026-01-01',
        openedBy: pay.id,
        payday: '2026-02-01',
        closedOn: null,
      },
    ]);
  });

  it('closes the cycle when a paycheck arrives and opens the next', () => {
    const pay = paycheck('2026-03-01', 150000);
    const ledger = [openingUsd('2026-02-18', 90000), pay];
    expect(cyclesOf(view(ledger), day('2026-03-10'))).toEqual([
      {
        openedOn: '2026-02-18',
        openedBy: null,
        payday: '2026-03-01',
        closedOn: '2026-03-01',
      },
      {
        openedOn: '2026-03-01',
        openedBy: pay.id,
        payday: '2026-04-01',
        closedOn: null,
      },
    ]);
  });

  it('starts the next cycle for a paycheck up to three days early', () => {
    const early = paycheck('2026-03-29', 150000);
    const ledger = [paycheck('2026-03-01', 150000), early];
    const cycles = cyclesOf(viewFrom('2026-03-01', ledger), day('2026-04-02'));
    expect(cycles).toHaveLength(2);
    expect(cycles[1]).toMatchObject({
      openedOn: '2026-03-29',
      openedBy: early.id,
      payday: '2026-04-01',
    });
  });

  it('adds a paycheck earlier in the cycle to the open cycle', () => {
    const ledger = [
      paycheck('2026-03-01', 150000),
      paycheck('2026-03-15', 20000),
    ];
    expect(
      cyclesOf(viewFrom('2026-03-01', ledger), day('2026-03-20')),
    ).toHaveLength(1);
  });

  it('merges a cycle back when its paycheck is undone', () => {
    const late = paycheck('2026-04-01', 150000);
    const undo = reverse(chart, [late], late.id, meta());
    const ledger = [paycheck('2026-03-01', 150000), late, undo];
    const cycles = cyclesOf(viewFrom('2026-03-01', ledger), day('2026-04-03'));
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ openedOn: '2026-03-01', closedOn: null });
  });

  it('ignores a paycheck dated after today until its day comes', () => {
    const ledger = [paycheck('2026-03-01', 150000), paycheck('2026-04-01', 1)];
    const v = viewFrom('2026-03-01', ledger);
    expect(cyclesOf(v, day('2026-03-31'))).toHaveLength(1);
    expect(cyclesOf(v, day('2026-04-01'))).toHaveLength(2);
  });

  it('uses the last day of short months for a late payday', () => {
    const ledger = [paycheck('2026-01-31', 150000)];
    const v = view(ledger, {
      settings: settings({ startedOn: day('2026-01-31'), paydayDay: 31 }),
    });
    const [cycle] = cyclesOf(v, day('2026-02-10'));
    expect(cycle?.payday).toBe('2026-02-28');
  });

  it('applies the payday override to the open cycle only', () => {
    const ledger = [openingUsd('2026-02-18', 90000), paycheck('2026-03-01', 1)];
    const overridden = view(ledger, {
      settings: settings({ paydayOverride: day('2026-03-30') }),
    });
    const cycles = cyclesOf(overridden, day('2026-03-10'));
    expect(cycles.map((c) => c.payday)).toEqual(['2026-03-01', '2026-03-30']);

    // An override from before the open cycle has no effect.
    const stale = view(ledger, {
      settings: settings({ paydayOverride: day('2026-02-27') }),
    });
    expect(cyclesOf(stale, day('2026-03-10'))[1]?.payday).toBe('2026-04-01');
  });
});

describe('cycleOn and billWindow', () => {
  const cycles = cyclesOf(
    view([openingUsd('2026-02-18', 1), paycheck('2026-03-03', 1)]),
    day('2026-03-10'),
  );

  it('finds the cycle of a day', () => {
    expect(cycleOn(cycles, day('2026-02-18')).openedOn).toBe('2026-02-18');
    expect(cycleOn(cycles, day('2026-03-02')).openedOn).toBe('2026-02-18');
    expect(cycleOn(cycles, day('2026-03-03')).openedOn).toBe('2026-03-03');
    expect(cycleOn(cycles, day('2026-01-01')).openedOn).toBe('2026-02-18');
  });

  it('covers a late paycheck’s extra days in the closed cycle', () => {
    const [closed, open] = cycles;
    expect(closed && billWindow(closed)).toEqual({
      from: '2026-02-18',
      to: '2026-03-03',
    });
    expect(open && billWindow(open)).toEqual({
      from: '2026-03-03',
      to: '2026-04-01',
    });
  });
});
