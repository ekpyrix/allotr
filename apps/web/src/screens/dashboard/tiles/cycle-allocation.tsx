import { Tile } from '@/components/layout';
import { SkeletonTile } from '@/components/bars';

export function CycleAllocationTile() {
  return (
    <Tile title="CycleAllocation" span={'full'}>
      <SkeletonTile />
    </Tile>
  );
}
