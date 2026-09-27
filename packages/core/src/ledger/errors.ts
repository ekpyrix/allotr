// Ledger errors carry a stable code so the API can map them to problem
// details (code-style rule "Errors").
export type LedgerErrorCode =
  | 'ledger.unbalanced'
  | 'ledger.invalid_transaction'
  | 'ledger.currency_mismatch'
  | 'ledger.unknown_account'
  | 'ledger.account_archived'
  | 'ledger.posting_count'
  | 'ledger.zero_amount'
  | 'ledger.invalid_amount'
  | 'ledger.same_account'
  | 'ledger.not_a_user_account'
  | 'ledger.missing_system_account'
  | 'ledger.budget_group_unchanged'
  | 'ledger.not_found'
  | 'ledger.already_reversed'
  | 'ledger.reversal_of_reversal';

export class LedgerError extends Error {
  override readonly name = 'LedgerError';
  readonly code: LedgerErrorCode;

  constructor(code: LedgerErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
