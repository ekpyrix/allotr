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
  baseSystemRoles,
  chartOf,
  iouSystemRoles,
  systemAccount,
  systemAccountsNeeded,
  type Chart,
} from './ledger/chart.ts';
export {
  borrow,
  lend,
  repayment,
  writeOffReceivable,
  type BorrowInput,
  type IouDirection,
  type IouWriteOffInput,
  type LendInput,
  type RepaymentInput,
} from './ledger/ious.ts';
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
  type SplitLine,
  type TransactionDraft,
  type TransferInput,
} from './ledger/build.ts';
export {
  compareEntries,
  moveEntry,
  placeEntry,
  sortDay,
  type DaySlot,
} from './ledger/order.ts';
export {
  edit,
  reinstate,
  reverse,
  type ReinstateMeta,
  type ReversalMeta,
} from './ledger/reverse.ts';
export {
  adjustmentKind,
  balanceFromOwed,
  reconciliation,
  unrecordedAdjustment,
  type Reconciliation,
} from './ledger/reconcile.ts';
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
  type CycleBill,
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
  cycleAllocation,
  type CycleAllocation,
} from './projections/allocation.ts';
export { lastWorkingDayOfMonth, nextPayday } from './projections/payday.ts';
export {
  availableOn,
  budgetFold,
  billsDueOn,
  billsInCycle,
  dailyFigures,
  dailyFiguresOn,
  leftTodayChange,
  leftTodayDrop,
} from './projections/daily.ts';
export {
  emergencyFund,
  netWorthOn,
  netWorthSeries,
  paydayPlan,
  savingsLine,
  weeklyReview,
  type EmergencyFund,
  type NetWorth,
  type NetWorthPoint,
  type PaydayPlan,
  type PayYourselfFirst,
  type PlanLine,
  type WeeklyReview,
} from './projections/plan.ts';
export { dayNetTotals, type DayTotal } from './projections/day-totals.ts';
export {
  balanceHistory,
  cycleDays,
  type CycleDay,
  type CycleDays,
} from './projections/series.ts';
export {
  budgetId,
  budgetPeriodOn,
  coverOrderOf,
  budgetPeriods,
  foldBudgets,
  heldBy,
  leftOf,
  tagId,
  type Budget,
  type BudgetAmount,
  type BudgetFold,
  type BudgetId,
  type BudgetLeftover,
  type BudgetMode,
  type BudgetPeriod,
  type BudgetPeriodLine,
  type BudgetPeriodRule,
  type BudgetReturn,
  type CoverRequest,
  type CoverSource,
  type CoverTake,
  type FoldEnv,
  type Refill,
  type BudgetSetup,
  type BudgetTarget,
  type CategoryNode,
  type DailyMode,
  type SpendLine,
  type TagId,
} from './projections/budgets.ts';
export {
  budgetCovers,
  budgetStatus,
  coverPreview,
  type BudgetCover,
  type BudgetLineStatus,
  type BudgetStatus,
  type CoveredFigures,
  type CoverPreview,
} from './projections/budget-status.ts';
export {
  defaultPoolSetup,
  groupsOn,
  poolCounts,
  poolId,
  poolsOn,
  type Pool,
  type PoolId,
  type PoolKind,
  type PoolMove,
  type PoolInputs,
  type PoolSetup,
} from './projections/pools.ts';
export {
  defaultWriteOffAfterDays,
  iouBalanceGaps,
  iouId,
  iouReturns,
  iouStatus,
  iouStatuses,
  iouTotals,
  iousOf,
  loanKey,
  type Iou,
  type IouId,
  type IouSettlement,
  type IouSettlementKind,
  type IouSetup,
  type IouStatus,
  type IouTotals,
} from './projections/ious.ts';
export { convertOn, totalOn } from './projections/rates.ts';
export {
  billAmount,
  carryDeficit,
  defaultPolicies,
  dueDates,
  leftoverStays,
  offerAdjustment,
  reserveAtPayday,
  type BillsStrategy,
  type DateWindow,
  type LeftoverStrategy,
  type OverspendStrategy,
  type Policies,
  type ReconcileAction,
  type ReconcileStrategy,
  type Settlement,
} from './projections/policies.ts';
export {
  amendmentsOf,
  cycleReports,
  type Amendment,
  type CycleReport,
  type GroupTotals,
} from './projections/history.ts';
export {
  categoryTotalsBetween,
  rollUpCategories,
  type CategoryGroup,
  type SummaryCategoryNode,
} from './projections/category-summary.ts';
export {
  calendar,
  heatLevel,
  HEAT_LEVELS,
  MAX_CALENDAR_DAYS,
  type Calendar,
  type CalendarBill,
  type CalendarDay,
  type CalendarIou,
} from './projections/calendar.ts';
export {
  BILL_LEAD_DAYS,
  dueReminders,
  type DueReminder,
  type ReminderKind,
} from './projections/reminders.ts';
export { savingsRate } from './projections/savings-rate.ts';
export { rankTotals, type RankedTotals } from './projections/ranked.ts';
export {
  cycleSnapshot,
  type CategoryTotal,
  type CycleSnapshot,
  type Leftover,
} from './projections/snapshot.ts';
