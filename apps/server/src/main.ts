import { ConfigError, loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { startServer } from './server.ts';

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(error.message);
  process.exit(1);
}

const logger = createLogger(config.logLevel);

try {
  const server = await startServer({ config, logger });

  const shutdown = (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'shutting down');
    server.close().then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error({ err: error }, 'shutdown failed');
        process.exit(1);
      },
    );
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  logger.fatal({ err: error }, 'server failed to start');
  process.exit(1);
}
