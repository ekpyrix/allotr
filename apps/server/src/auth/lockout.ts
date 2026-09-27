import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import type { AuthLimits } from './limits.ts';

// Temporary lockout after repeated failed password sign-ins (SECURITY.md,
// "Web sessions"). Keyed by the normalised email so unknown addresses behave
// like real ones and reveal nothing.

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function lockedUntil(
  db: Kysely<DB>,
  email: string,
  now: Date,
): Promise<Date | null> {
  const row = await db
    .selectFrom('sign_in_failures')
    .select('locked_until')
    .where('email', '=', normaliseEmail(email))
    .executeTakeFirst();
  if (row?.locked_until == null) return null;
  const until = new Date(row.locked_until);
  return until > now ? until : null;
}

export async function recordSignInFailure(
  db: Kysely<DB>,
  email: string,
  now: Date,
  limits: AuthLimits,
): Promise<void> {
  const key = normaliseEmail(email);
  await db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('sign_in_failures')
      .selectAll()
      .where('email', '=', key)
      .executeTakeFirst();

    const windowOpen =
      row !== undefined &&
      now.getTime() - new Date(row.window_started_at).getTime() <
        limits.signInFailureWindowMs;
    const failedCount = windowOpen ? row.failed_count + 1 : 1;
    const windowStartedAt = windowOpen
      ? row.window_started_at
      : now.toISOString();
    const lockedUntil =
      failedCount >= limits.signInMaxFailures
        ? new Date(now.getTime() + limits.signInLockoutMs).toISOString()
        : null;

    await trx
      .insertInto('sign_in_failures')
      .values({
        email: key,
        failed_count: failedCount,
        window_started_at: windowStartedAt,
        locked_until: lockedUntil,
      })
      .onConflict((oc) =>
        oc.column('email').doUpdateSet({
          failed_count: failedCount,
          window_started_at: windowStartedAt,
          locked_until: lockedUntil,
        }),
      )
      .execute();
  });
}

export async function clearSignInFailures(
  db: Kysely<DB>,
  email: string,
): Promise<void> {
  await db
    .deleteFrom('sign_in_failures')
    .where('email', '=', normaliseEmail(email))
    .execute();
}
