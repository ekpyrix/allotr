export const workspaceName = '@allotr/shared';

export * from './auth.ts';
export { problemDetailsSchema, type ProblemDetails } from './problem.ts';
export { serverEnvSchema, type ServerEnv } from './server-env.ts';
export {
  addDays,
  DateError,
  daysBetween,
  isLocalDate,
  localDate,
  localDateIn,
  isoWeekday,
  lastDayOfMonth,
  nextDayOfMonth,
  localDateSchema,
  type DateErrorCode,
  type LocalDate,
} from './dates.ts';
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
export {
  formatMoney,
  formatMoneyCompact,
  formatMoneyInput,
  type FormatMoneyOptions,
} from './money/format.ts';
export { parseMoney } from './money/parse.ts';
export {
  convert,
  convertInverse,
  impliedRate,
  isRate,
  parseRate,
  type Rate,
} from './money/rate.ts';
export {
  currencyCodeSchema,
  moneySchema,
  rateSchema,
} from './money/schemas.ts';
export * from './ledger.ts';
export * from './pools.ts';
export * from './bundle.ts';
export * from './theme/index.ts';
