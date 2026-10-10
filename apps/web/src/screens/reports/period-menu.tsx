import { useNavigate } from '@tanstack/react-router';
import { MenuButton, MenuRadioItem } from '@/components/menu';
import { useFrameWidth } from '@/components/use-frame-width';
import { IconCalendarLine } from '@/generated/icons';
import { t } from '@/messages/t';
import { StripControls } from '@/shell/strip-controls';
import { REPORT_PERIODS, type ReportPeriod } from './reports-search.ts';
import { useReportRange } from './use-report-range.ts';

// The period menu in the title strip (docs/ui.md §6). Mount it once per tab.
export function PeriodMenu() {
  const { period } = useReportRange();
  const navigate = useNavigate();
  const compact = useFrameWidth() < 600;
  return (
    <StripControls>
      <MenuButton
        label={t('reportsShell.period.label')}
        value={t(`reportsShell.period.${period}`)}
        icon={IconCalendarLine}
        iconOnly={compact}
        selectionMode="single"
        selectedKeys={new Set([period])}
        onSelectionChange={(keys) => {
          const next = keys === 'all' ? undefined : [...keys][0];
          const picked = REPORT_PERIODS.find((p) => p === next);
          if (picked === undefined) return;
          void navigate({
            to: '.',
            search: (prev: object) => ({
              ...prev,
              period: picked === 'cycle' ? undefined : picked,
            }),
          });
        }}
      >
        {REPORT_PERIODS.map((p: ReportPeriod) => (
          <MenuRadioItem key={p} id={p} label={t(`reportsShell.period.${p}`)} />
        ))}
      </MenuButton>
    </StripControls>
  );
}
