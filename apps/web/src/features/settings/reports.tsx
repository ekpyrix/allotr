import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { describeProblem } from '@/lib/problem';
import { ledgerSettingsQuery } from '@/lib/ledger';
import { updateLedgerSettings } from '@/lib/settings';
import { t } from '@/messages/t';
import { Section } from './section.tsx';

// How Reports shows category summaries. Kept per user, so every device
// shows the same views; each change saves at once.
export function ReportsSection() {
  const queryClient = useQueryClient();
  const settings = useQuery(ledgerSettingsQuery);
  const save = useMutation({
    mutationFn: updateLedgerSettings,
    onSuccess: (next) => {
      queryClient.setQueryData(ledgerSettingsQuery.queryKey, next);
    },
  });
  const ids = useId();
  const period = settings.data?.reportPeriod ?? 'cycle';
  const cards = settings.data?.categoryCards ?? 'top';
  return (
    <Section
      id="reports"
      title={t('settings.reports.title')}
      intro={t('settings.reports.intro')}
    >
      <div className="mt-4 grid gap-2">
        <span className="text-label">{t('settings.reports.period')}</span>
        <ToggleGroup
          label={t('settings.reports.period')}
          value={period}
          onValueChange={(reportPeriod) => {
            save.mutate({ reportPeriod });
          }}
          options={[
            { value: 'cycle', label: t('settings.reports.cycle') },
            { value: 'month', label: t('settings.reports.month') },
          ]}
          className="max-w-xs"
        />
      </div>
      <div className="mt-5 flex items-center justify-between gap-4">
        <Label htmlFor={`${ids}-expand`}>
          {t('settings.reports.alwaysExpand')}
        </Label>
        <Switch
          id={`${ids}-expand`}
          checked={cards === 'all'}
          disabled={settings.data === undefined}
          onCheckedChange={(on) => {
            save.mutate({ categoryCards: on ? 'all' : 'top' });
          }}
        />
      </div>
      {save.isError ? (
        <p role="alert" className="mt-3 text-negative">
          {describeProblem(save.error).message}
        </p>
      ) : null}
    </Section>
  );
}
