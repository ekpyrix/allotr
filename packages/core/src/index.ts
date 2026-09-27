export const workspaceName = '@allotr/core';

export { LedgerError, type LedgerErrorCode } from './ledger/errors.ts';
export {
  accountId,
  categoryId,
  transactionId,
  type Account,
  type AccountId,
  type BudgetGroup,
  type BudgetSwitch,
  type CategoryId,
  type EntryMeta,
  type Posting,
  type SystemRole,
  type Transaction,
  type TransactionId,
  type TransactionKind,
  type UserAccountKind,
} from './ledger/types.ts';
export {
  accountIn,
  chartOf,
  systemAccount,
  systemAccountsNeeded,
  type Chart,
} from './ledger/chart.ts';
export {
  budgetSwitch,
  commit,
  expense,
  income,
  opening,
  restore,
  transfer,
  writeOff,
  type PostingDraft,
  type SpendInput,
  type TransactionDraft,
  type TransferInput,
} from './ledger/build.ts';
export { edit, reverse, type ReversalMeta } from './ledger/reverse.ts';
export {
  accountBalances,
  balanceOf,
  budgetGroupBalances,
  budgetGroupOn,
  budgetGroupsOn,
  type GroupBalances,
} from './ledger/balances.ts';
