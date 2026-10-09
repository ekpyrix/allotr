import { Tile } from '@/components/layout';
import { SkeletonTile } from '@/components/bars';

export function NextSevenDaysTile() {
  return (
    <Tile title="NextSevenDays" span={1}>
      <SkeletonTile />
    </Tile>
  );
}
