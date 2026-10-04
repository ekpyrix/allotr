import { localDate, localTime, type LocalTime } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  compareEntries,
  moveEntry,
  placeEntry,
  sortDay,
  type DaySlot,
} from './order.ts';
import { errorCode } from './testing.ts';
import { transactionId, type TransactionId } from './types.ts';

const id = (n: number) => transactionId(`t${String(n)}`);

function slot(
  n: number,
  sortRank: string,
  time: string | null = null,
): DaySlot {
  return {
    id: id(n),
    sortRank,
    occurredTime: time === null ? null : localTime(time),
  };
}

function ids(day: readonly DaySlot[]): TransactionId[] {
  return sortDay(day).map((s) => s.id);
}

function timedInOrder(day: readonly DaySlot[]): boolean {
  const times = sortDay(day).flatMap((s) =>
    s.occurredTime === null ? [] : [s.occurredTime],
  );
  return times.every((t, i) => i === 0 || (times[i - 1] ?? t) <= t);
}

describe('compareEntries', () => {
  const entry = (
    n: number,
    occurredOn: string,
    sortRank: string | null,
    createdAt: string,
  ) => ({ id: id(n), occurredOn: localDate(occurredOn), sortRank, createdAt });

  it('orders by date, then rank, ignoring when entries were recorded', () => {
    const list = [
      entry(1, '2026-03-02', 'A', '2026-03-01T00:00:00.000Z'),
      entry(2, '2026-03-01', 'V', '2026-03-01T09:00:00.000Z'),
      entry(3, '2026-03-01', 'B', '2026-03-05T09:00:00.000Z'),
    ];
    expect(list.sort(compareEntries).map((e) => e.id)).toEqual([
      id(3),
      id(2),
      id(1),
    ]);
  });

  it('falls back to when entries were recorded before they are placed', () => {
    const a = entry(1, '2026-03-01', null, '2026-03-01T10:00:00.000Z');
    const b = entry(2, '2026-03-01', null, '2026-03-01T09:00:00.000Z');
    expect(compareEntries(a, b)).toBeGreaterThan(0);
  });

  it('compares ranks by code unit, not by locale', () => {
    const a = entry(1, '2026-03-01', 'Z', '2026-03-01T00:00:00.000Z');
    const b = entry(2, '2026-03-01', 'a', '2026-03-01T00:00:00.000Z');
    expect(compareEntries(a, b)).toBeLessThan(0);
  });
});

describe('placeEntry', () => {
  const day = [
    slot(1, 'G'),
    slot(2, 'N', '09:00'),
    slot(3, 'U'),
    slot(4, 'b', '18:00'),
  ];

  it('puts an untimed entry at the end of the day', () => {
    const rank = placeEntry(day, { occurredTime: null });
    expect(rank > 'b').toBe(true);
  });

  it('puts a timed entry right after the last one timed no later', () => {
    const rank = placeEntry(day, { occurredTime: localTime('12:00') });
    expect(rank > 'N' && rank < 'U').toBe(true);
  });

  it('puts a timed entry before every later one', () => {
    const rank = placeEntry(day, { occurredTime: localTime('07:00') });
    expect(rank > 'G' && rank < 'N').toBe(true);
  });

  it('keeps the place of the entry it replaces when the time allows', () => {
    const rank = placeEntry(day, { occurredTime: null }, id(1));
    expect(rank > 'G' && rank < 'N').toBe(true);
  });

  it('ignores the replaced entry when the time does not fit there', () => {
    const rank = placeEntry(day, { occurredTime: localTime('20:00') }, id(1));
    expect(rank > 'b').toBe(true);
  });

  it('ignores a replaced entry from another day', () => {
    const rank = placeEntry(day, { occurredTime: null }, id(9));
    expect(rank > 'b').toBe(true);
  });

  it('starts an empty day', () => {
    expect(placeEntry([], { occurredTime: null })).toBe('V');
  });
});

describe('moveEntry', () => {
  const day = [
    slot(1, 'G'),
    slot(2, 'N', '09:00'),
    slot(3, 'U'),
    slot(4, 'b', '18:00'),
  ];
  const moved = (n: number, rank: string) =>
    day.map((s) => (s.id === id(n) ? { ...s, sortRank: rank } : s));

  it('moves an untimed entry anywhere', () => {
    expect(ids(moved(3, moveEntry(day, id(3), null)))).toEqual([
      id(3),
      id(1),
      id(2),
      id(4),
    ]);
    expect(ids(moved(1, moveEntry(day, id(1), id(4))))).toEqual([
      id(2),
      id(3),
      id(4),
      id(1),
    ]);
  });

  it('moves a timed entry while it stays in time order', () => {
    expect(ids(moved(2, moveEntry(day, id(2), id(3))))).toEqual([
      id(1),
      id(3),
      id(2),
      id(4),
    ]);
  });

  it('refuses to move a timed entry out of time order', () => {
    expect(errorCode(() => moveEntry(day, id(2), id(4)))).toBe(
      'ledger.out_of_time_order',
    );
  });

  it('refuses a move after an entry on another day', () => {
    expect(errorCode(() => moveEntry(day, id(1), id(9)))).toBe(
      'ledger.different_day',
    );
    expect(errorCode(() => moveEntry(day, id(9), null))).toBe(
      'ledger.not_found',
    );
    expect(errorCode(() => moveEntry(day, id(1), id(1)))).toBe(
      'ledger.invalid_transaction',
    );
  });
});

describe('order within a day (properties)', () => {
  const timeArb: fc.Arbitrary<LocalTime | null> = fc.option(
    fc
      .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
      .map(([h, m]) =>
        localTime(
          `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        ),
      ),
    { nil: null },
  );

  const opArb = fc.oneof(
    fc.record({ kind: fc.constant('add' as const), time: timeArb }),
    fc.record({
      kind: fc.constant('move' as const),
      from: fc.nat(),
      to: fc.option(fc.nat(), { nil: null }),
    }),
  );

  it('keeps timed entries in time order and ranks unique', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 60 }), (ops) => {
        let day: DaySlot[] = [];
        for (const op of ops) {
          if (op.kind === 'add') {
            const n = day.length + 1;
            const sortRank = placeEntry(day, { occurredTime: op.time });
            day = [...day, { id: id(n), sortRank, occurredTime: op.time }];
          } else if (day.length > 1) {
            const order = ids(day);
            const moving = order[op.from % order.length] ?? id(0);
            const others = order.filter((x) => x !== moving);
            const after =
              op.to === null ? null : (others[op.to % others.length] ?? null);
            try {
              const sortRank = moveEntry(day, moving, after);
              day = day.map((s) => (s.id === moving ? { ...s, sortRank } : s));
              const now = ids(day);
              expect(now.indexOf(moving)).toBe(
                after === null ? 0 : now.indexOf(after) + 1,
              );
            } catch (error) {
              expect(
                errorCode(() => {
                  throw error;
                }),
              ).toBe('ledger.out_of_time_order');
            }
          }
          expect(timedInOrder(day)).toBe(true);
          expect(new Set(day.map((s) => s.sortRank)).size).toBe(day.length);
        }
      }),
    );
  });
});
