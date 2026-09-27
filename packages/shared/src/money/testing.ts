import { MoneyError, type MoneyErrorCode } from './errors.ts';

// Test helpers; not exported from the package.

// Returns the MoneyError code thrown by `fn`, or undefined if it returns.
export function errorCode(fn: () => unknown): MoneyErrorCode | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof MoneyError) return error.code;
    throw error;
  }
  return undefined;
}
