export const workspaceName = '@allotr/shared';

export * from './auth.ts';
export { problemDetailsSchema, type ProblemDetails } from './problem.ts';
export { serverEnvSchema, type ServerEnv } from './server-env.ts';
export { MoneyError, type MoneyErrorCode } from './money/errors.ts';
export {
  currencies,
  currencyCode,
  isCurrencyCode,
  iso4217Published,
  minorUnit,
  type Currency,
  type CurrencyCode,
} from './money/currency.ts';
export { currencyCodeSchema } from './money/schemas.ts';
