import { Stack, Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { t } from '@/messages/t';
import { PeriodMenu } from './period-menu.tsx';

export function PlanTab() {
  return (
    <Stack className="h-full">
      <PeriodMenu />
      <Tile title="Plan">
        <EmptyState title="Plan" hint={t('reportsShell.stub')} />
      </Tile>
    </Stack>
  );
}
