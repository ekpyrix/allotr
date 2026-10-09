import { BracketButton } from '@/components/buttons';
import { t } from '@/messages/t';

/** A tile body for a failed read, with a retry. */
export function TileFailed({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2 py-2 text-small">
      <span className="text-negative">{t('dashboardTiles.loadFailed')}</span>
      <BracketButton onPress={retry}>{t('dashboardTiles.retry')}</BracketButton>
    </div>
  );
}
