import {
  appearanceSchema,
  onboardingStatusSchema,
  sessionSchema,
  sessionUserSchema,
  signUpBodySchema,
} from '@allotr/shared';
import { z } from 'zod';
import { endpoint } from './api.ts';

// Every server call the web app makes. Paths use the OpenAPI `{name}` form;
// endpoints.test.ts checks them against docs/openapi.json.

const signInBodySchema = z.object({ email: z.string(), password: z.string() });

export const endpoints = {
  onboardingStatus: endpoint({
    method: 'GET',
    path: '/v1/onboarding',
    response: onboardingStatusSchema,
  }),
  createFirstAccount: endpoint({
    method: 'POST',
    path: '/v1/onboarding',
    body: signUpBodySchema,
    response: z.object({ user: sessionUserSchema }),
  }),
  session: endpoint({
    method: 'GET',
    path: '/v1/session',
    response: sessionSchema,
  }),
  signIn: endpoint({
    method: 'POST',
    path: '/v1/auth/sign-in/email',
    body: signInBodySchema,
    response: z.union([
      z.object({ twoFactorRedirect: z.literal(true) }),
      z.object({ user: z.object({ id: z.string() }) }),
    ]),
    openapi: false,
  }),
  verifyTotp: endpoint({
    method: 'POST',
    path: '/v1/auth/two-factor/verify-totp',
    body: z.object({ code: z.string() }),
    response: z.unknown(),
    openapi: false,
  }),
  signOut: endpoint({
    method: 'POST',
    path: '/v1/auth/sign-out',
    body: z.object({}),
    response: z.unknown(),
    openapi: false,
  }),
  appearance: endpoint({
    method: 'GET',
    path: '/v1/settings/appearance',
    response: appearanceSchema,
  }),
  saveAppearance: endpoint({
    method: 'PUT',
    path: '/v1/settings/appearance',
    body: appearanceSchema,
    response: appearanceSchema,
  }),
};
