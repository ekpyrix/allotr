import { Tile } from '@/components/layout';
import { SkeletonTile } from '@/components/bars';

export function PoolsTile() {
  return (
    <Tile title="Pools" span={1}>
      <SkeletonTile />
    </Tile>
  );
}
