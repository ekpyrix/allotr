import { Tile } from '@/components/layout';
import { SkeletonTile } from '@/components/bars';

export function TodaysEntriesTile() {
  return (
    <Tile title="TodaysEntries" span={1}>
      <SkeletonTile />
    </Tile>
  );
}
