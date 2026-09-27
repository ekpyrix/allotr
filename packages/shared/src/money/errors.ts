// Money, currency and rate errors carry a stable code so the API can map
// them to problem details (code-style rule "Errors").
export type MoneyErrorCode =
  | 'currency.unknown'
  | 'money.not_integer'
  | 'money.out_of_range'
  | 'money.invalid_format'
  | 'money.too_many_decimals'
  | 'rate.invalid';

export class MoneyError extends Error {
  override readonly name = 'MoneyError';
  readonly code: MoneyErrorCode;

  constructor(code: MoneyErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
