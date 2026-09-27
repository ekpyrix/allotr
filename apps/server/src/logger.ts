import {
  pino,
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from 'pino';
import type { Config } from './config.ts';

export type { Logger };

export function createLogger(
  level: Config['logLevel'],
  destination?: DestinationStream,
): Logger {
  const options: LoggerOptions = {
    level,
    base: { service: 'allotr-server' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'secretKey',
        '*.secretKey',
        'headers.authorization',
        'headers.cookie',
        '*.headers.authorization',
        '*.headers.cookie',
      ],
      censor: '[redacted]',
    },
  };
  return destination === undefined ? pino(options) : pino(options, destination);
}
