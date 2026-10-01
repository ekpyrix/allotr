import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { useDevicePref } from '@/lib/device-prefs';
import { t } from '@/messages/t';
import { Section } from './section.tsx';

// How Reports shows category summaries. Kept on this device, like the
// other display settings.
export function ReportsSection() {
  const [period, setPeriod] = useDevicePref('reportPeriod');
  const [cards, setCards] = useDevicePref('categoryCards');
  const ids = useId();
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
          onValueChange={setPeriod}
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
          onCheckedChange={(on) => {
            setCards(on ? 'all' : 'top');
          }}
        />
      </div>
    </Section>
  );
}
