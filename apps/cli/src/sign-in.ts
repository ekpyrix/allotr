import {
  createSession,
  problemOf,
  type ApiResponse,
  type Session,
} from './http.ts';
import type { CliIo } from './io.ts';

// One signed-in session for one command: asks for the email (unless
// given), the password and, when two-factor is on, the authenticator code,
// then signs out when the command is done.

export async function withSignedIn(
  options: { readonly server: string; readonly email?: string | undefined },
  io: CliIo,
  command: (session: Session) => Promise<number>,
): Promise<number> {
  const session = createSession(options.server, io.fetch);
  const email =
    options.email ?? (await io.prompt('Email: ', { hidden: false }));
  const password = await io.prompt('Password: ', { hidden: true });
  if (!(await signIn(session, email, password, io))) return 1;
  try {
    return await command(session);
  } finally {
    // The session is only for this command; a failed sign-out changes
    // nothing.
    await session.post('/v1/auth/sign-out').catch(() => undefined);
  }
}

async function signIn(
  session: Session,
  email: string,
  password: string,
  io: CliIo,
): Promise<boolean> {
  const response = await session.post('/v1/auth/sign-in/email', {
    email,
    password,
  });
  if (response.status !== 200) {
    io.stderr(`Sign-in failed: ${describe(response)}`);
    return false;
  }
  if (!needsCode(response.body)) return true;
  const code = await io.prompt('Authenticator code: ', { hidden: true });
  const verified = await session.post('/v1/auth/two-factor/verify-totp', {
    code,
  });
  if (verified.status !== 200) {
    io.stderr(`Sign-in failed: ${describe(verified)}`);
    return false;
  }
  return true;
}

function needsCode(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    'twoFactorRedirect' in body &&
    body.twoFactorRedirect === true
  );
}

/** The server's explanation of a refused request. */
export function describe(response: ApiResponse): string {
  const details = problemOf(response);
  if (details !== null) return details.detail ?? details.title;
  return `the server answered ${String(response.status)} without details.`;
}

export const twoFactorHint =
  'this instance requires two-factor authentication. Set it up in the web app, then run the command again.';
