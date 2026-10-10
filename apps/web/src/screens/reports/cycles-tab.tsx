import { Stack, Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { t } from '@/messages/t';
import { PeriodMenu } from './period-menu.tsx';

export function CyclesTab() {
  return (
    <Stack className="h-full">
      <PeriodMenu />
      <Tile title="Cycles">
        <EmptyState title="Cycles" hint={t('reportsShell.stub')} />
      </Tile>
    </Stack>
  );
}
