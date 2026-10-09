import { Tile } from '@/components/layout';
import { SkeletonTile } from '@/components/bars';

export function BudgetsTile() {
  return (
    <Tile title="Budgets" span={1}>
      <SkeletonTile />
    </Tile>
  );
}
