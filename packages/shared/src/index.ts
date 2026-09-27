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
export {
  money,
  moneyFromDecimal,
  moneyToDecimal,
  type Money,
} from './money/money.ts';
export { formatMoney, type FormatMoneyOptions } from './money/format.ts';
export { parseMoney } from './money/parse.ts';
export { convert, isRate, parseRate, type Rate } from './money/rate.ts';
export {
  currencyCodeSchema,
  moneySchema,
  rateSchema,
} from './money/schemas.ts';
