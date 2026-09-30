import {
  formatContrastRatio,
  type Role,
  type RoleFailure,
} from '@allotr/shared';
import { t } from '@/messages/t';

// Words for roles and their problems, for the editor and the import errors.

export const ROLE_GROUPS = [
  [
    'surfaces',
    [
      'canvas',
      'chrome',
      'card',
      'card-raised',
      'inverse',
      'primary-container',
      'info-container',
      'success-container',
      'warning-container',
      'danger-container',
    ],
  ],
  [
    'text',
    [
      'text',
      'text-muted',
      'on-inverse',
      'on-primary',
      'on-primary-container',
      'on-danger-container',
    ],
  ],
  [
    'money',
    [
      'hero-ok',
      'hero-tight',
      'hero-over',
      'positive',
      'negative',
      'pace',
      'reserved',
    ],
  ],
  ['controls', ['primary', 'outline', 'outline-variant', 'ring', 'selection']],
  ['status', ['info', 'success', 'warning', 'danger']],
  [
    'charts',
    [
      'series-1',
      'series-2',
      'series-3',
      'series-4',
      'series-5',
      'series-6',
      'series-7',
      'series-8',
    ],
  ],
] as const satisfies readonly (readonly [string, readonly Role[]])[];

export function roleLabel(role: Role): string {
  return t(`themes.roles.${role}`);
}

/** "Secondary text on Card: 2.61:1, needs 4.5:1" */
export function failureText(failure: RoleFailure): string {
  return failure.reason === 'unknown-slot'
    ? t('themes.unknownSlot', {
        role: roleLabel(failure.role),
        slot: failure.slot,
      })
    : t('themes.roleFailure', {
        role: roleLabel(failure.role),
        surface: roleLabel(failure.surface),
        ratio: formatContrastRatio(failure.ratio),
        required: failure.required,
      });
}
