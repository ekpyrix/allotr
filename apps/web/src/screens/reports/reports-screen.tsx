import { useParams } from '@tanstack/react-router';
import { CalendarTab } from './calendar-tab.tsx';
import { CyclesTab } from './cycles-tab.tsx';
import { PlanTab } from './plan-tab.tsx';
import { SummaryTab } from './summary-tab.tsx';
import { TrendsTab } from './trends-tab.tsx';

// Reports (docs/ui.md §6): one component per sub-tab, picked by the address.
export function ReportsScreen() {
  const { sub } = useParams({ strict: false });
  switch (sub) {
    case 'trends':
      return <TrendsTab />;
    case 'plan':
      return <PlanTab />;
    case 'calendar':
      return <CalendarTab />;
    case 'cycles':
      return <CyclesTab />;
    default:
      return <SummaryTab />;
  }
}
