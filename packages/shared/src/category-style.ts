import { z } from 'zod';

// How a category looks (ADR 0022): a colour and a Lucide icon. The colour
// is a chart series role of the active theme, never a hex value, so every
// theme paints it with a contrast-fitted colour. The icon is one of a fixed
// set, so the server can validate it and the web app can bundle just those.

export const categoryColours = [
  'series-1',
  'series-2',
  'series-3',
  'series-4',
  'series-5',
  'series-6',
  'series-7',
  'series-8',
] as const;
export const categoryColourSchema = z.enum(categoryColours);
export type CategoryColour = z.infer<typeof categoryColourSchema>;

/** Lucide icon names in kebab-case. */
export const categoryIcons = [
  'banknote',
  'baby',
  'beer',
  'bike',
  'book-open',
  'briefcase',
  'bus',
  'car',
  'circle-dollar-sign',
  'coffee',
  'credit-card',
  'dumbbell',
  'film',
  'fuel',
  'gamepad-2',
  'gift',
  'graduation-cap',
  'hand-coins',
  'heart-pulse',
  'house',
  'landmark',
  'laptop',
  'lightbulb',
  'music',
  'paw-print',
  'percent',
  'piggy-bank',
  'pill',
  'plane',
  'receipt',
  'repeat',
  'scissors',
  'shirt',
  'shopping-bag',
  'shopping-basket',
  'smartphone',
  'sparkles',
  'tag',
  'ticket',
  'train-front',
  'tree-pine',
  'trending-up',
  'umbrella',
  'utensils',
  'utensils-crossed',
  'wallet',
  'wifi',
  'wrench',
] as const;
export const categoryIconSchema = z.enum(categoryIcons);
export type CategoryIcon = z.infer<typeof categoryIconSchema>;
