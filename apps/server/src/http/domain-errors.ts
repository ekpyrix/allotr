import { LedgerError, type LedgerErrorCode } from '@allotr/core';
import { DateError, MoneyError } from '@allotr/shared';
import type { Context } from 'hono';
import { problem, type ProblemStatus } from './problem.ts';

// Domain errors from core and shared become problem details with the error's
// stable code, minus its namespace (code-style rule "Errors").

const ledgerStatus: Record<LedgerErrorCode, ProblemStatus> = {
  'ledger.unbalanced': 400,
  'ledger.invalid_transaction': 400,
  'ledger.currency_mismatch': 400,
  'ledger.unknown_account': 404,
  'ledger.account_archived': 409,
  'ledger.posting_count': 400,
  'ledger.zero_amount': 400,
  'ledger.invalid_amount': 400,
  'ledger.same_account': 400,
  'ledger.not_a_user_account': 400,
  // The server creates system accounts before it builds an entry.
  'ledger.missing_system_account': 500,
  'ledger.budget_group_unchanged': 409,
  'ledger.not_found': 404,
  'ledger.already_reversed': 409,
  'ledger.reversal_of_reversal': 409,
};

/** A refusal from a server rule, such as a name already in use. */
export class RequestProblem extends Error {
  override readonly name = 'RequestProblem';
  readonly status: ProblemStatus;
  readonly code: string;

  constructor(status: ProblemStatus, code: string, detail: string) {
    super(detail);
    this.status = status;
    this.code = code;
  }
}

export type DomainError = LedgerError | MoneyError | DateError | RequestProblem;

export function isDomainError(error: unknown): error is DomainError {
  return (
    error instanceof LedgerError ||
    error instanceof MoneyError ||
    error instanceof DateError ||
    error instanceof RequestProblem
  );
}

export function domainProblem(c: Context, error: DomainError) {
  if (error instanceof RequestProblem) {
    return problem(c, error.status, {
      detail: error.message,
      code: error.code,
    });
  }
  const status = error instanceof LedgerError ? ledgerStatus[error.code] : 400;
  return problem(c, status, {
    detail:
      status === 500 ? 'The ledger could not record this.' : error.message,
    code: error.code.replace(/^ledger\./, '').replace('.', '_'),
  });
}
