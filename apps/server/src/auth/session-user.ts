import { roleSchema, type SessionUser, type SignUpBody } from '@allotr/shared';
import type { Auth } from './auth.ts';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role?: unknown;
  twoFactorEnabled?: unknown;
}

export function toSessionUser(user: AuthUser): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: roleSchema.catch('user').parse(user.role),
    twoFactorEnabled: user.twoFactorEnabled === true,
  };
}

export async function currentUser(
  auth: Auth,
  headers: Headers,
): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  return session === null ? null : toSessionUser(session.user);
}

/** Creates an account from the server and returns its session cookies. */
export async function signUpWithEmail(
  auth: Auth,
  body: SignUpBody,
  headers: Headers,
): Promise<{ user: SessionUser; cookies: string[] }> {
  const { headers: responseHeaders, response } = await auth.api.signUpEmail({
    body,
    headers,
    returnHeaders: true,
  });
  return {
    user: toSessionUser(response.user),
    cookies: responseHeaders.getSetCookie(),
  };
}
