import { Grid } from '@/components/layout';
import { BudgetsTile } from './tiles/budgets.tsx';
import { CycleAllocationTile } from './tiles/cycle-allocation.tsx';
import { EmergencyFundTile } from './tiles/emergency-fund.tsx';
import { NeedsAttentionTile } from './tiles/needs-attention.tsx';
import { NetWorthTile } from './tiles/net-worth.tsx';
import { NextSevenDaysTile } from './tiles/next-seven-days.tsx';
import { PoolsTile } from './tiles/pools.tsx';
import { ThisCycleTile } from './tiles/this-cycle.tsx';
import { TodaysEntriesTile } from './tiles/todays-entries.tsx';

// The Dashboard (docs/ui.md §6): default tile order and sizes, no layout
// editor yet. Every figure comes from the server.
export function Dashboard() {
  return (
    <Grid>
      <ThisCycleTile />
      <NeedsAttentionTile />
      <TodaysEntriesTile />
      <CycleAllocationTile />
      <BudgetsTile />
      <NextSevenDaysTile />
      <PoolsTile />
      <EmergencyFundTile />
      <NetWorthTile />
    </Grid>
  );
}
