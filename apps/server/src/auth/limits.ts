import { MIN_PASSWORD_LENGTH } from '@allotr/shared';

// Default security thresholds. They become admin settings later; until then
// tests and the server pass them explicitly.
export interface AuthLimits {
  readonly minPasswordLength: number;
  /** Failed password sign-ins per account before a temporary lockout. */
  readonly signInMaxFailures: number;
  readonly signInFailureWindowMs: number;
  readonly signInLockoutMs: number;
  /** Sign-in and 2FA verification requests per client address per minute. */
  readonly signInRequestsPerMinute: number;
  readonly inviteTtlMs: number;
}

const minute = 60_000;

export const defaultAuthLimits: AuthLimits = {
  minPasswordLength: MIN_PASSWORD_LENGTH,
  signInMaxFailures: 5,
  signInFailureWindowMs: 15 * minute,
  signInLockoutMs: 15 * minute,
  signInRequestsPerMinute: 10,
  inviteTtlMs: 7 * 24 * 60 * minute,
};
