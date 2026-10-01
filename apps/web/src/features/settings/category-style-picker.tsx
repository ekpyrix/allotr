import {
  categoryColours,
  categoryIcons,
  type CategoryColour,
  type CategoryIcon as IconName,
} from '@allotr/shared';
import { useId } from 'react';
import { categoryIconComponents } from '@/components/ui/category-icon';
import { colourVar } from '@/lib/category-style';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';

// The colour and icon of a category (ADR 0022). Both are radio groups, so
// the keyboard and screen readers work as they do for any choice, with an
// "Automatic" or "None" first. Colours are chart series roles: the theme
// decides the actual shade, so they are named by number.

const choice =
  'relative flex cursor-pointer items-center justify-center rounded-md border border-outline-variant has-checked:border-primary has-checked:bg-primary-container has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring';

/** "shopping-basket" as "Shopping basket". */
export function iconLabel(name: IconName): string {
  const words = name.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function CategoryStylePicker({
  colour,
  icon,
  onColourChange,
  onIconChange,
}: {
  colour: CategoryColour | null;
  icon: IconName | null;
  onColourChange: (colour: CategoryColour | null) => void;
  onIconChange: (icon: IconName | null) => void;
}) {
  const group = useId();
  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="text-label">
          {t('settings.categories.colour')}
        </legend>
        <div className="flex flex-wrap gap-2">
          <label className={cn(choice, 'h-11 px-3 text-label')}>
            <input
              type="radio"
              name={`${group}-colour`}
              className="sr-only"
              checked={colour === null}
              onChange={() => {
                onColourChange(null);
              }}
            />
            {t('settings.categories.automatic')}
          </label>
          {categoryColours.map((value, index) => (
            <label key={value} className={cn(choice, 'size-11')}>
              <input
                type="radio"
                name={`${group}-colour`}
                className="sr-only"
                aria-label={t('settings.categories.colourOption', {
                  number: index + 1,
                })}
                checked={colour === value}
                onChange={() => {
                  onColourChange(value);
                }}
              />
              <span
                aria-hidden="true"
                className="size-6 rounded-full"
                style={{ backgroundColor: colourVar(value) }}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="text-label">{t('settings.categories.icon')}</legend>
        <div className="flex flex-wrap gap-2">
          <label className={cn(choice, 'h-11 px-3 text-label')}>
            <input
              type="radio"
              name={`${group}-icon`}
              className="sr-only"
              checked={icon === null}
              onChange={() => {
                onIconChange(null);
              }}
            />
            {t('settings.categories.noIcon')}
          </label>
          {categoryIcons.map((value) => {
            const Icon = categoryIconComponents[value];
            return (
              <label key={value} className={cn(choice, 'size-11')}>
                <input
                  type="radio"
                  name={`${group}-icon`}
                  className="sr-only"
                  aria-label={iconLabel(value)}
                  checked={icon === value}
                  onChange={() => {
                    onIconChange(value);
                  }}
                />
                <Icon
                  aria-hidden="true"
                  className="size-5 stroke-[1.75]"
                  style={{
                    color: colour === null ? 'var(--text)' : colourVar(colour),
                  }}
                />
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
