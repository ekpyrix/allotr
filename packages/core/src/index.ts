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
export {
  billId,
  type Bill,
  type BillDue,
  type BillId,
  type BillPayment,
  type Cycle,
  type DailyFigures,
  type ExchangeRate,
  type Figure,
  type LedgerSettings,
  type LedgerView,
} from './projections/types.ts';
export { cycleOn, cyclesOf } from './projections/cycles.ts';
export {
  availableOn,
  billsDueOn,
  dailyFigures,
  dailyFiguresOn,
} from './projections/daily.ts';
export { convertOn } from './projections/rates.ts';
export {
  carryDeficit,
  defaultPolicies,
  dueDates,
  leftoverStays,
  reserveAtPayday,
  type BillsStrategy,
  type DateWindow,
  type LeftoverStrategy,
  type OverspendStrategy,
  type Policies,
  type Settlement,
} from './projections/policies.ts';
export {
  cycleSnapshot,
  type CategoryTotal,
  type CycleSnapshot,
  type Leftover,
} from './projections/snapshot.ts';
