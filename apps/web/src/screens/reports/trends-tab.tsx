import { Stack, Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { t } from '@/messages/t';
import { PeriodMenu } from './period-menu.tsx';

export function TrendsTab() {
  return (
    <Stack className="h-full">
      <PeriodMenu />
      <Tile title="Trends">
        <EmptyState title="Trends" hint={t('reportsShell.stub')} />
      </Tile>
    </Stack>
  );
}
