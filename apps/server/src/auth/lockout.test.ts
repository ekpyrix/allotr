import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { createTestDatabase } from '../testing/database.ts';
import { defaultAuthLimits } from './limits.ts';
import {
  clearSignInFailures,
  lockedUntil,
  recordSignInFailure,
} from './lockout.ts';

const minute = 60_000;
const start = Date.UTC(2026, 0, 1, 12, 0, 0);
const at = (minutes: number) => new Date(start + minutes * minute);
const limits = defaultAuthLimits;

let db: Kysely<DB>;
beforeEach(() => {
  db = createTestDatabase();
});
afterEach(async () => {
  await db.destroy();
});

async function fail(email: string, times: number, minutes = 0) {
  for (let i = 0; i < times; i++) {
    await recordSignInFailure(db, email, at(minutes), limits);
  }
}

describe('sign-in lockout', () => {
  it('locks after the maximum failures within the window', async () => {
    await fail('a@example.test', limits.signInMaxFailures - 1);
    expect(await lockedUntil(db, 'a@example.test', at(1))).toBeNull();

    await fail('a@example.test', 1, 1);
    expect(await lockedUntil(db, 'a@example.test', at(2))).toEqual(
      new Date(at(1).getTime() + limits.signInLockoutMs),
    );
  });

  it('treats addresses case-insensitively', async () => {
    await fail('A@Example.test', limits.signInMaxFailures);
    expect(await lockedUntil(db, ' a@example.TEST ', at(1))).not.toBeNull();
  });

  it('unlocks once the lockout has passed', async () => {
    await fail('a@example.test', limits.signInMaxFailures);
    const minutes = limits.signInLockoutMs / minute;
    expect(await lockedUntil(db, 'a@example.test', at(minutes + 1))).toBeNull();
  });

  it('starts a new window when earlier failures are old', async () => {
    await fail('a@example.test', limits.signInMaxFailures - 1);
    const later = limits.signInFailureWindowMs / minute + 1;
    await fail('a@example.test', 1, later);
    expect(await lockedUntil(db, 'a@example.test', at(later))).toBeNull();
  });

  it('clears failures after a successful sign-in', async () => {
    await fail('a@example.test', limits.signInMaxFailures - 1);
    await clearSignInFailures(db, 'a@example.test');
    await fail('a@example.test', 1, 1);
    expect(await lockedUntil(db, 'a@example.test', at(1))).toBeNull();
  });

  it('keeps accounts independent', async () => {
    await fail('a@example.test', limits.signInMaxFailures);
    expect(await lockedUntil(db, 'b@example.test', at(1))).toBeNull();
  });
});
