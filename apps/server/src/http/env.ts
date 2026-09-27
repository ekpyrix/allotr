import type { SessionUser } from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { Auth } from '../auth/auth.ts';
import type { AuthLimits } from '../auth/limits.ts';
import type { Config } from '../config.ts';
import type { DB } from '../db/schema.ts';
import type { Logger } from '../logger.ts';

export interface AppDeps {
  readonly db: Kysely<DB>;
  readonly auth: Auth;
  readonly config: Config;
  readonly limits: AuthLimits;
  readonly logger: Logger;
  readonly now: () => Date;
}

export interface AppEnv {
  Variables: {
    user: SessionUser;
    /** Client address for rate limiting and session records. */
    clientIp: string | undefined;
  };
}
