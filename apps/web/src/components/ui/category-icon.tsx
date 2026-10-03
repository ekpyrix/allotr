import {
  Baby,
  Banknote,
  Beer,
  Bike,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  CircleDollarSign,
  Coffee,
  CreditCard,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Lightbulb,
  Music,
  PawPrint,
  Percent,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Repeat,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Tag,
  Ticket,
  TrainFront,
  TreePine,
  TrendingUp,
  Umbrella,
  Utensils,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { CategoryIcon as IconName } from '@allotr/shared';
import { colourVar, type CategoryStyle } from '@/lib/category-style';
import { cn } from '@/lib/utils';

// Category icons (ADR 0022): the fixed set the API accepts, imported by name
// so the bundle holds these and not the whole icon library. Typed over the
// shared list, so a name added there without an icon here fails to compile.
export const categoryIconComponents: Readonly<Record<IconName, LucideIcon>> = {
  banknote: Banknote,
  baby: Baby,
  beer: Beer,
  bike: Bike,
  'book-open': BookOpen,
  briefcase: Briefcase,
  bus: Bus,
  car: Car,
  'circle-dollar-sign': CircleDollarSign,
  coffee: Coffee,
  'credit-card': CreditCard,
  dumbbell: Dumbbell,
  film: Film,
  fuel: Fuel,
  'gamepad-2': Gamepad2,
  gift: Gift,
  'graduation-cap': GraduationCap,
  'hand-coins': HandCoins,
  'heart-pulse': HeartPulse,
  house: House,
  landmark: Landmark,
  laptop: Laptop,
  lightbulb: Lightbulb,
  music: Music,
  'paw-print': PawPrint,
  percent: Percent,
  'piggy-bank': PiggyBank,
  pill: Pill,
  plane: Plane,
  receipt: Receipt,
  repeat: Repeat,
  scissors: Scissors,
  shirt: Shirt,
  'shopping-bag': ShoppingBag,
  'shopping-basket': ShoppingBasket,
  smartphone: Smartphone,
  sparkles: Sparkles,
  tag: Tag,
  ticket: Ticket,
  'train-front': TrainFront,
  'tree-pine': TreePine,
  'trending-up': TrendingUp,
  umbrella: Umbrella,
  utensils: Utensils,
  'utensils-crossed': UtensilsCrossed,
  wallet: Wallet,
  wifi: Wifi,
  wrench: Wrench,
};

/** A category's icon in its colour; decorative, the name is always beside it. */
function CategoryIcon({
  style,
  fallback: Fallback = Tag,
  className,
}: {
  style: CategoryStyle;
  fallback?: LucideIcon;
  className?: string;
}) {
  const Icon =
    style.icon === null ? Fallback : categoryIconComponents[style.icon];
  return (
    <Icon
      aria-hidden="true"
      data-slot="category-icon"
      className={cn('size-5 stroke-[1.75]', className)}
      style={{ color: colourVar(style.colour) }}
    />
  );
}

export { CategoryIcon };
