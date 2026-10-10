import { Stack, Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { t } from '@/messages/t';
import { PeriodMenu } from './period-menu.tsx';

export function SummaryTab() {
  return (
    <Stack className="h-full">
      <PeriodMenu />
      <Tile title="Summary">
        <EmptyState title="Summary" hint={t('reportsShell.stub')} />
      </Tile>
    </Stack>
  );
}
