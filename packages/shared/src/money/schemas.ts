import { z } from 'zod';
import { isCurrencyCode } from './currency.ts';
import { isRate } from './rate.ts';

// Zod schemas output the same branded types the constructors return.
export const currencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine(isCurrencyCode, { error: 'Unknown ISO 4217 currency code' })
  .brand<'CurrencyCode'>();

// z.int() is limited to the safe-integer range.
export const moneySchema = z
  .object({ amountMinor: z.int(), currency: currencyCodeSchema })
  .brand<'Money'>();

export const rateSchema = z
  .string()
  .max(40)
  .regex(/^\d+(\.\d+)?$/)
  .refine(isRate, { error: 'Exchange rates must be greater than zero' })
  .brand<'Rate'>();
