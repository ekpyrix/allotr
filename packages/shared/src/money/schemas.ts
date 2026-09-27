import { z } from 'zod';
import { isCurrencyCode } from './currency.ts';

// Zod schemas output the same branded types the constructors return.
export const currencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine(isCurrencyCode, { error: 'Unknown ISO 4217 currency code' })
  .brand<'CurrencyCode'>();
