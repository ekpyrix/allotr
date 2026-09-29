import type { InstanceSettingsPatch, SignUpBody } from '@allotr/shared';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { ApiError, call } from './api.ts';
import { endpoints } from './endpoints.ts';

export const onboardingQuery = queryOptions({
  queryKey: ['onboarding'],
  queryFn: () => call(endpoints.onboardingStatus),
  // Once the first account exists, onboarding never comes back.
  staleTime: (query) => (query.state.data?.required === false ? Infinity : 0),
});

/** The session, or null when signed out. */
export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: async () => {
    try {
      return await call(endpoints.session);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
});

export function createFirstAccount(body: SignUpBody) {
  return call(endpoints.createFirstAccount, { body });
}

/** Returns 'two-factor' when a TOTP code is needed next. */
export async function signIn(email: string, password: string) {
  const result = await call(endpoints.signIn, { body: { email, password } });
  return 'twoFactorRedirect' in result
    ? ('two-factor' as const)
    : ('signed-in' as const);
}

export async function verifyTotp(code: string) {
  await call(endpoints.verifyTotp, { body: { code } });
}

export async function signOut(queryClient: QueryClient) {
  await call(endpoints.signOut, { body: {} });
  // Tell mounted observers (ThemeProvider lives above the router) that the
  // session is gone, and keep that query so they see the next sign-in.
  // clear() would drop it without telling them.
  queryClient.setQueryData(sessionQuery.queryKey, null);
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== sessionQuery.queryKey[0],
  });
}

/**
 * Starts TOTP enrolment. It is on only once a code from the new secret is
 * verified; the backup codes are shown this once.
 */
export function enableTwoFactor(password: string) {
  return call(endpoints.enableTwoFactor, { body: { password } });
}

export async function disableTwoFactor(password: string) {
  await call(endpoints.disableTwoFactor, { body: { password } });
}

/** This device's sign-ins and the others, with which one is this. */
export const authSessionsQuery = queryOptions({
  queryKey: ['devices'],
  queryFn: async () => {
    const [current, sessions] = await Promise.all([
      call(endpoints.currentAuthSession),
      call(endpoints.authSessions),
    ]);
    return { currentToken: current?.session.token ?? null, sessions };
  },
});

export async function revokeSession(token: string) {
  await call(endpoints.revokeSession, { body: { token } });
}

export async function revokeOtherSessions() {
  await call(endpoints.revokeOtherSessions, { body: {} });
}

/** Instance-wide settings; only administrators can read them. */
export const instanceSettingsQuery = queryOptions({
  queryKey: ['instance'],
  queryFn: () => call(endpoints.instanceSettings),
});

export function updateInstanceSettings(patch: InstanceSettingsPatch) {
  return call(endpoints.updateInstanceSettings, { body: patch });
}

/** A single-use sign-up link; its URL is only shown this once. */
export function createInvite(expiresInDays: number) {
  return call(endpoints.createInvite, { body: { expiresInDays } });
}

export function inviteQuery(token: string) {
  return queryOptions({
    queryKey: ['invite', token],
    queryFn: () => call(endpoints.inviteStatus, { params: { token } }),
    retry: false,
  });
}

export function acceptInvite(token: string, body: SignUpBody) {
  return call(endpoints.acceptInvite, { params: { token }, body });
}
