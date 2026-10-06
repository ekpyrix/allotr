import { serverEnvSchema, type ServerEnv } from '@allotr/shared';

export interface Config {
  readonly databasePath: string;
  readonly baseUrl: string;
  readonly secretKey: string;
  readonly host: string;
  readonly port: number;
  readonly reminderIntervalSeconds: number;
  readonly signInRequestsPerMinute: number;
  readonly logLevel: ServerEnv['ALLOTR_LOG_LEVEL'];
  readonly trustedProxies: readonly string[];
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export function loadConfig(
  env: Readonly<Record<string, string | undefined>>,
): Config {
  const result = serverEnvSchema.safeParse(env);
  if (!result.success) {
    // Name the variables only; values may be secrets.
    const problems = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new ConfigError(
      `Invalid configuration. Fix these environment variables (see .env.example):\n${problems.join('\n')}`,
    );
  }
  const parsed = result.data;
  return {
    databasePath: parsed.ALLOTR_DATABASE_PATH,
    baseUrl: parsed.ALLOTR_BASE_URL,
    secretKey: parsed.ALLOTR_SECRET_KEY,
    host: parsed.ALLOTR_HOST,
    port: parsed.ALLOTR_PORT,
    reminderIntervalSeconds: parsed.ALLOTR_REMINDER_INTERVAL_SECONDS,
    signInRequestsPerMinute: parsed.ALLOTR_SIGN_IN_REQUESTS_PER_MINUTE,
    logLevel: parsed.ALLOTR_LOG_LEVEL,
    trustedProxies: parsed.ALLOTR_TRUSTED_PROXIES,
  };
}
