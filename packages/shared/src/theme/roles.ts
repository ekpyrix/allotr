import { z } from 'zod';
import type { ContrastKind, ThemeScheme } from './tokens.ts';

// The colours the UI paints with. A role map assigns each role a palette
// slot; the resolver walks ROLES in order, so a role is only checked against
// roles resolved before it.

export const SURFACE_ROLES = [
  'canvas',
  'chrome',
  'card',
  'card-raised',
  'inverse',
] as const;
export type SurfaceRole = (typeof SURFACE_ROLES)[number];

const FILL_ROLES = ['primary', 'info', 'success', 'warning', 'danger'] as const;
const CONTAINER_ROLES = [
  'primary-container',
  'info-container',
  'success-container',
  'warning-container',
  'danger-container',
] as const;
const SERIES_ROLES = [
  'series-1',
  'series-2',
  'series-3',
  'series-4',
  'series-5',
  'series-6',
  'series-7',
  'series-8',
] as const;

/** Every role, in resolution order. */
export const ROLES = [
  ...SURFACE_ROLES,
  ...FILL_ROLES,
  ...CONTAINER_ROLES,
  'text',
  'text-muted',
  'on-inverse',
  'on-primary',
  'on-primary-container',
  'on-danger-container',
  'outline',
  'outline-variant',
  'ring',
  'hero-ok',
  'hero-tight',
  'hero-over',
  'positive',
  'negative',
  ...SERIES_ROLES,
  'pace',
  'reserved',
  'selection',
] as const;
export type Role = (typeof ROLES)[number];
export const themeRoleSchema = z.enum(ROLES);

/**
 * `surface` roles are backgrounds and are never checked. `decorative`
 * roles (dividers, the selection tint) have no contrast requirement
 * (WCAG 2.2 SC 1.4.11 exempts them). The rest must meet their contrast
 * kind on every role in `on`.
 */
export type RoleKind = 'surface' | 'decorative' | ContrastKind;
export type RoleSpec = Readonly<{ kind: RoleKind; on: readonly Role[] }>;

const PAGE: readonly Role[] = ['canvas', 'chrome', 'card', 'card-raised'];
const surface: RoleSpec = { kind: 'surface', on: [] };
const decorative: RoleSpec = { kind: 'decorative', on: [] };
const onCard = (kind: ContrastKind): RoleSpec => ({ kind, on: ['card'] });

export const ROLE_SPECS: Readonly<Record<Role, RoleSpec>> = {
  ...(Object.fromEntries(
    [...SURFACE_ROLES, ...CONTAINER_ROLES].map((role) => [role, surface]),
  ) as Record<SurfaceRole | (typeof CONTAINER_ROLES)[number], RoleSpec>),
  primary: { kind: 'non-text', on: ['canvas', 'card', 'chrome'] },
  info: onCard('non-text'),
  success: onCard('non-text'),
  warning: onCard('non-text'),
  danger: onCard('non-text'),
  text: { kind: 'text', on: [...PAGE, ...CONTAINER_ROLES] },
  'text-muted': { kind: 'text', on: [...PAGE, ...CONTAINER_ROLES] },
  'on-inverse': { kind: 'text', on: ['inverse'] },
  'on-primary': { kind: 'text', on: ['primary'] },
  'on-primary-container': { kind: 'text', on: ['primary-container'] },
  'on-danger-container': { kind: 'text', on: ['danger-container'] },
  outline: { kind: 'non-text', on: ['canvas', 'card'] },
  'outline-variant': decorative,
  ring: { kind: 'non-text', on: PAGE },
  'hero-ok': onCard('large-text'),
  'hero-tight': onCard('large-text'),
  'hero-over': onCard('large-text'),
  positive: { kind: 'text', on: ['canvas', 'card', 'card-raised'] },
  negative: { kind: 'text', on: ['canvas', 'card', 'card-raised'] },
  ...(Object.fromEntries(
    SERIES_ROLES.map((role) => [role, onCard('non-text')]),
  ) as Record<(typeof SERIES_ROLES)[number], RoleSpec>),
  pace: onCard('non-text'),
  reserved: onCard('non-text'),
  selection: decorative,
};

/**
 * One role's colour. `slot` names a neutral slot, a canonical hue or an
 * accent; `a|b` tries each name in turn and takes the first the palette
 * has. `alpha` lays the colour over the `over` surface (canvas when left
 * out). `fit: 'auto'` (the default) shifts lightness until the role meets
 * its contrast; `fit: 'off'` keeps the colour and reports any failure.
 */
export const roleEntrySchema = z
  .strictObject({
    slot: z.string().min(1).max(80),
    alpha: z.number().min(0).max(1).optional(),
    over: z.enum(SURFACE_ROLES).optional(),
    fit: z.enum(['auto', 'off']).optional(),
  })
  .meta({ id: 'ThemeRoleEntry' });
export type RoleEntry = z.infer<typeof roleEntrySchema>;
export type RoleMap = Readonly<Record<Role, RoleEntry>>;

const slot = (name: string): RoleEntry => ({ slot: name });

function roleMap(scheme: ThemeScheme): RoleMap {
  const light = scheme === 'light';
  const container = (hue: string): RoleEntry => ({
    slot: hue,
    alpha: light ? 0.18 : 0.24,
    over: 'card',
  });
  return {
    canvas: slot('base'),
    chrome: slot('mantle'),
    card: slot(light ? 'mantle' : 'surface0'),
    'card-raised': slot(light ? 'crust' : 'surface1'),
    inverse: slot('text'),
    primary: slot('purple'),
    info: slot('blue'),
    success: slot('green'),
    warning: slot('orange'),
    danger: slot('red'),
    'primary-container': container('purple'),
    'info-container': container('blue'),
    'success-container': container('green'),
    'warning-container': container('orange'),
    'danger-container': container('red'),
    text: slot('text'),
    'text-muted': slot('subtext0'),
    'on-inverse': slot('base'),
    'on-primary': slot(light ? 'base' : 'crust'),
    'on-primary-container': slot('text'),
    'on-danger-container': slot('text'),
    outline: slot('overlay1'),
    'outline-variant': slot(light ? 'surface0' : 'surface1'),
    ring: slot(light ? 'purple' : 'lavender|blue'),
    'hero-ok': slot('purple'),
    'hero-tight': slot('orange'),
    // A soft rose for "over", never alarm red; red only when there's none.
    'hero-over': slot('maroon|red'),
    positive: slot('green'),
    negative: slot('maroon|red'),
    'series-1': slot('blue'),
    'series-2': slot('purple'),
    'series-3': slot('cyan'),
    'series-4': slot('orange'),
    'series-5': slot('pink'),
    'series-6': slot('green'),
    'series-7': slot('yellow'),
    'series-8': slot('lavender|red'),
    pace: slot('overlay2'),
    reserved: slot('orange'),
    selection: { slot: 'overlay2', alpha: 0.25, over: 'canvas' },
  };
}

/** The role map a theme uses for every role it does not set. */
export const DEFAULT_ROLE_MAP: Readonly<Record<ThemeScheme, RoleMap>> = {
  light: roleMap('light'),
  dark: roleMap('dark'),
};
