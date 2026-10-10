import { Stack, Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { t } from '@/messages/t';
import { PeriodMenu } from './period-menu.tsx';

export function CalendarTab() {
  return (
    <Stack className="h-full">
      <PeriodMenu />
      <Tile title="Calendar">
        <EmptyState title="Calendar" hint={t('reportsShell.stub')} />
      </Tile>
    </Stack>
  );
}
