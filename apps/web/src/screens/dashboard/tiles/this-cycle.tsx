import { Tile } from '@/components/layout';
import { SkeletonTile } from '@/components/bars';

export function ThisCycleTile() {
  return (
    <Tile title="ThisCycle" span={2}>
      <SkeletonTile />
    </Tile>
  );
}
