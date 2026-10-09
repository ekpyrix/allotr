import { Tile } from '@/components/layout';
import { SkeletonTile } from '@/components/bars';

export function NeedsAttentionTile() {
  return (
    <Tile title="NeedsAttention" span={1}>
      <SkeletonTile />
    </Tile>
  );
}
