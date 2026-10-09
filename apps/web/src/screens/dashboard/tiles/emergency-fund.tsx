import { Tile } from '@/components/layout';
import { SkeletonTile } from '@/components/bars';

export function EmergencyFundTile() {
  return (
    <Tile title="EmergencyFund" span={1}>
      <SkeletonTile />
    </Tile>
  );
}
