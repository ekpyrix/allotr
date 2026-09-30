import { z } from 'zod';

// Request and response shapes for onboarding, invites and the session.

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export const registrationModeSchema = z.enum(['invite_only', 'open', 'closed']);
export type RegistrationMode = z.infer<typeof registrationModeSchema>;

export const instanceSettingsSchema = z.object({
  registrationMode: registrationModeSchema,
  requireTwoFactor: z.boolean(),
  /**
   * Users may import a theme from a URL, which the server then fetches.
   * Off unless an admin turns it on (ADR 0011).
   */
  themeUrlImport: z.boolean(),
});
export type InstanceSettings = z.infer<typeof instanceSettingsSchema>;

export const instanceSettingsPatchSchema = instanceSettingsSchema.partial();
export type InstanceSettingsPatch = z.infer<typeof instanceSettingsPatchSchema>;

export const signUpBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});
export type SignUpBody = z.infer<typeof signUpBodySchema>;

export const roleSchema = z.enum(['admin', 'user']);

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  twoFactorEnabled: z.boolean(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const sessionSchema = z.object({
  user: sessionUserSchema,
  twoFactorRequired: z.boolean(),
  /** The instance requires 2FA, so enrolled users cannot turn it off. */
  twoFactorEnforced: z.boolean(),
  /** An admin allows importing themes from a URL. */
  themeUrlImport: z.boolean(),
});
export type SessionView = z.infer<typeof sessionSchema>;

export const onboardingStatusSchema = z.object({ required: z.boolean() });

export const createInviteBodySchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

export const inviteSchema = z.object({
  url: z.url(),
  expiresAt: z.iso.datetime(),
});

export const inviteStatusSchema = z.object({ expiresAt: z.iso.datetime() });

/**
 * Confirms deleting the signed-in user. `code` is a TOTP code or a backup
 * code, and is needed only when the user has 2FA on.
 */
export const deleteUserBodySchema = z.object({
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  code: z.string().trim().min(1).max(64).optional(),
});
export type DeleteUserBody = z.infer<typeof deleteUserBodySchema>;
