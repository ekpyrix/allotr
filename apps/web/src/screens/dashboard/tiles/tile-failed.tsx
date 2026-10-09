import { BracketButton } from '@/components/buttons';
import { t } from '@/messages/t';

/** A tile whose query failed: the reason is the tile's, with a retry. */
export function TileFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2 py-2 text-small">
      <span className="text-negative">{t('dashboardTiles.loadFailed')}</span>
      <BracketButton onPress={onRetry}>
        {t('dashboardTiles.retry')}
      </BracketButton>
    </div>
  );
}
