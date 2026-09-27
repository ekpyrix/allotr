import type { SignUpBody } from '@allotr/shared';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { ApiError, call } from './api.ts';
import { endpoints } from './endpoints.ts';

export const onboardingQuery = queryOptions({
  queryKey: ['onboarding'],
  queryFn: () => call(endpoints.onboardingStatus),
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
  queryClient.clear();
}
