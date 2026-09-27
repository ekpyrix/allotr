// Maps Better Auth's camelCase models and fields to the snake_case tables in
// migrations/0002_auth.sql. auth/schema.test.ts fails if they drift apart.

function snakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function fields(names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, snakeCase(name)]));
}

export const userNames = {
  modelName: 'users',
  fields: fields(['emailVerified', 'createdAt', 'updatedAt']),
};

export const sessionNames = {
  modelName: 'sessions',
  fields: fields([
    'expiresAt',
    'createdAt',
    'updatedAt',
    'ipAddress',
    'userAgent',
    'userId',
  ]),
};

export const accountNames = {
  modelName: 'accounts',
  fields: fields([
    'accountId',
    'providerId',
    'userId',
    'accessToken',
    'refreshToken',
    'idToken',
    'accessTokenExpiresAt',
    'refreshTokenExpiresAt',
    'createdAt',
    'updatedAt',
  ]),
};

export const verificationNames = {
  modelName: 'verifications',
  fields: fields(['expiresAt', 'createdAt', 'updatedAt']),
};

export const twoFactorNames = {
  twoFactor: {
    modelName: 'two_factors',
    fields: fields([
      'backupCodes',
      'userId',
      'failedVerificationCount',
      'lockedUntil',
    ]),
  },
  user: { fields: fields(['twoFactorEnabled']) },
};
