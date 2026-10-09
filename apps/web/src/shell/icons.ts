import type { ComponentType } from 'react';
import {
  IconArrowLeftRightLine,
  IconBankLine,
  IconDashboard3Line,
  IconLineChartLine,
  IconPieChart2Line,
  IconSettings3Line,
  type IconProps,
} from '@/generated/icons';
import type { ScreenKey } from '../nav-items.ts';

/** Each destination's icon, shared by the navigation and the title strip. */
export const screenIcons: Record<ScreenKey, ComponentType<IconProps>> = {
  dashboard: IconDashboard3Line,
  accounts: IconBankLine,
  transactions: IconArrowLeftRightLine,
  budget: IconPieChart2Line,
  reports: IconLineChartLine,
  settings: IconSettings3Line,
};
