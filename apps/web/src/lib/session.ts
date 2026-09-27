import {
  onboardingStatusSchema,
  sessionSchema,
  sessionUserSchema,
  type SignUpBody,
} from '@allotr/shared';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api, ApiError } from './api.ts';

export const onboardingQuery = queryOptions({
  queryKey: ['onboarding'],
  queryFn: () => api('/v1/onboarding', onboardingStatusSchema),
});

/** The session, or null when signed out. */
export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: async () => {
    try {
      return await api('/v1/session', sessionSchema);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
});

const createdUserSchema = z.object({ user: sessionUserSchema });

export function createFirstAccount(body: SignUpBody) {
  return api('/v1/onboarding', createdUserSchema, { method: 'POST', body });
}

const signInSchema = z.union([
  z.object({ twoFactorRedirect: z.literal(true) }),
  z.object({ user: z.object({ id: z.string() }) }),
]);

/** Returns 'two-factor' when a TOTP code is needed next. */
export async function signIn(email: string, password: string) {
  const result = await api('/v1/auth/sign-in/email', signInSchema, {
    method: 'POST',
    body: { email, password },
  });
  return 'twoFactorRedirect' in result
    ? ('two-factor' as const)
    : ('signed-in' as const);
}

export async function verifyTotp(code: string) {
  await api('/v1/auth/two-factor/verify-totp', z.unknown(), {
    method: 'POST',
    body: { code },
  });
}

export async function signOut(queryClient: QueryClient) {
  await api('/v1/auth/sign-out', z.unknown(), { method: 'POST', body: {} });
  queryClient.clear();
}
