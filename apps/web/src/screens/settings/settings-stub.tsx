import { Stack, Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { t } from '@/messages/t';

/** Stands in for a settings sub-tab until its fork lands. */
export function SettingsStub({ title }: { title: string }) {
  return (
    <Stack className="h-full">
      <Tile title={title}>
        <EmptyState title={title} hint={t('settingsShell.stub')} />
      </Tile>
    </Stack>
  );
}
