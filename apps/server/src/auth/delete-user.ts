import type { SessionUser } from '@allotr/shared';
import { APIError } from 'better-auth/api';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import type { Auth } from './auth.ts';
import { normaliseEmail } from './lockout.ts';

// Deleting a user and every row that belongs to them (FR-U3).

/** A six-digit code is a TOTP code; anything else is a backup code. */
const totpCode = /^\d{6}$/;

/** Whether the user is the only administrator of an instance with others. */
export async function isLastAdmin(
  db: Kysely<DB>,
  user: SessionUser,
): Promise<boolean> {
  if (user.role !== 'admin') return false;
  const row = await db
    .selectFrom('users')
    .select((eb) => [
      eb.fn.countAll<number>().as('users'),
      eb.fn.count<number>('id').filterWhere('role', '=', 'admin').as('admins'),
    ])
    .executeTakeFirstOrThrow();
  return row.admins === 1 && row.users > 1;
}

export async function passwordMatches(
  auth: Auth,
  db: Kysely<DB>,
  userId: string,
  password: string,
): Promise<boolean> {
  const account = await db
    .selectFrom('auth_accounts')
    .select('password')
    .where('user_id', '=', userId)
    .where('provider_id', '=', 'credential')
    .executeTakeFirst();
  if (account?.password == null) return false;
  const context = await auth.$context;
  return context.password.verify({ hash: account.password, password });
}

/**
 * Checks a TOTP or backup code against the signed-in user's 2FA. A matching
 * backup code is used up, as at sign-in.
 */
export async function codeMatches(
  auth: Auth,
  headers: Headers,
  code: string,
): Promise<boolean> {
  try {
    if (totpCode.test(code)) {
      await auth.api.verifyTOTP({ body: { code }, headers });
    } else {
      await auth.api.verifyBackupCode({
        body: { code, disableSession: true },
        headers,
      });
    }
    return true;
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 401) return false;
    throw error;
  }
}

/**
 * Hard-deletes the user. Most rows go by cascade from `users`; the ledger's
 * append-only triggers allow it once the user row is gone. Rows keyed by
 * something other than the user id are removed first.
 */
export async function deleteUser(
  db: Kysely<DB>,
  user: Pick<SessionUser, 'id' | 'email'>,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    // 2FA sign-in challenges and trusted devices hold the user id.
    await trx
      .deleteFrom('verifications')
      .where('value', '=', user.id)
      .execute();
    await trx
      .deleteFrom('sign_in_failures')
      .where('email', '=', normaliseEmail(user.email))
      .execute();
    await trx.deleteFrom('users').where('id', '=', user.id).execute();
  });
}
