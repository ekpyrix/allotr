import { Tile } from '@/components/layout';
import { SkeletonTile } from '@/components/bars';

export function NetWorthTile() {
  return (
    <Tile title="NetWorth" span={2}>
      <SkeletonTile />
    </Tile>
  );
}
