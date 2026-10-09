import { Stack, Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { t } from '@/messages/t';

/** Stands in for a screen until its work package lands. */
export function Placeholder({ title }: { title: string }) {
  return (
    <Stack className="h-full">
      <Tile title={title}>
        <EmptyState title={title} hint={t('shell.placeholder')} />
      </Tile>
    </Stack>
  );
}
