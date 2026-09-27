import { Page } from '@/components/page';
import { t } from '@/messages/t';

// Placeholder until the ledger view (#60).
export function LedgerPage() {
  return <Page title={t('ledger.title')} intro={t('ledger.placeholder')} />;
}
