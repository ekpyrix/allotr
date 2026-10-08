import { useState, type ComponentType, type ReactNode } from 'react';
import {
  Button,
  Header,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  MenuTrigger,
  Popover,
  Separator,
  type Selection,
} from 'react-aria-components';
import {
  IconArrowDownSLine,
  IconCheckLine,
  type IconProps,
} from '@/generated/icons';
import { cn } from '@/lib/utils';
import { menuButtonClass } from './buttons.tsx';
import { menuPresentation } from './menu-placement.ts';
import { Sheet } from './sheet.tsx';
import { useFrameWidth } from './use-frame-width.ts';

// A menu is a popover from 600 px and a bottom sheet below (docs/ui.md §4).
// The items are the same React Aria menu in both. Rows are 30 px in
// popovers and 44 px in sheets. Nested fold groups are not implemented.

const rowClass =
  'press flex min-h-[1.875rem] items-center gap-2 px-3 text-small outline-none ';

export type MenuItemProps = {
  id: string;
  label: string;
  icon?: ComponentType<IconProps>;
  /** A key hint on the right, for example `f`. */
  hint?: string;
  destructive?: boolean;
  onAction?: () => void;
};

export function MenuItem({
  id,
  label,
  icon: Icon,
  hint,
  destructive = false,
  onAction,
}: MenuItemProps) {
  return (
    <AriaMenuItem
      id={id}
      textValue={label}
      {...(onAction === undefined ? {} : { onAction })}
      className={cn(rowClass, 'focus:bg-card', destructive && 'text-negative')}
    >
      {({ selectionMode, isSelected }) => (
        <>
          {selectionMode === 'none' ? null : (
            <span className="flex size-4 shrink-0 items-center justify-center">
              {isSelected ? <IconCheckLine className="size-4" /> : null}
            </span>
          )}
          {Icon === undefined ? null : (
            <Icon className="size-4 shrink-0 text-text-muted" />
          )}
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {hint === undefined ? null : (
            <kbd className="shrink-0 text-tiny text-text-muted">{hint}</kbd>
          )}
        </>
      )}
    </AriaMenuItem>
  );
}

/** Checkbox row: use inside a menu with `selectionMode="multiple"`. */
export const MenuCheckItem = MenuItem;
/** Radio row: use inside a menu with `selectionMode="single"`. */
export const MenuRadioItem = MenuItem;

export function MenuSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <AriaMenuSection>
      {title === undefined ? null : (
        <Header className="px-3 pt-2 pb-1 text-tiny font-semibold tracking-wide text-text-muted uppercase">
          {title}
        </Header>
      )}
      {children}
    </AriaMenuSection>
  );
}

export function MenuSeparator() {
  return <Separator className="my-1 border-t border-outline-variant" />;
}

export type MenuButtonProps = {
  label: string;
  value?: string;
  icon?: ComponentType<IconProps>;
  /** The sheet's title on phones. Defaults to the label. */
  title?: string;
  selectionMode?: 'none' | 'single' | 'multiple';
  selectedKeys?: Selection;
  onSelectionChange?: (keys: Selection) => void;
  className?: string;
  children: ReactNode;
};

/** A bordered `label · value ▾` control that opens a menu. */
export function MenuButton({
  label,
  value,
  icon: Icon,
  title,
  selectionMode = 'none',
  selectedKeys,
  onSelectionChange,
  className,
  children,
}: MenuButtonProps) {
  const presentation = menuPresentation(useFrameWidth());
  const [open, setOpen] = useState(false);

  const face = (
    <>
      {Icon === undefined ? null : <Icon className="size-3.5" />}
      <span className="text-text-muted">{label}</span>
      {value === undefined ? null : (
        <>
          <span aria-hidden="true" className="text-text-muted">
            ·
          </span>
          <span className="min-w-0 truncate">{value}</span>
        </>
      )}
      <IconArrowDownSLine className="size-3.5 shrink-0" />
    </>
  );
  const menu = (
    <AriaMenu
      aria-label={title ?? label}
      selectionMode={selectionMode}
      {...(selectedKeys === undefined ? {} : { selectedKeys })}
      {...(onSelectionChange === undefined ? {} : { onSelectionChange })}
      {...(presentation === 'sheet' && selectionMode === 'none'
        ? {
            onAction: () => {
              setOpen(false);
            },
          }
        : {})}
      className={cn(
        'min-w-48 py-1 outline-none',
        presentation === 'sheet' && '[&_[role^=menuitem]]:min-h-[2.75rem]',
      )}
    >
      {children}
    </AriaMenu>
  );

  if (presentation === 'sheet') {
    return (
      <>
        <Button
          onPress={() => {
            setOpen(true);
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(menuButtonClass, className)}
        >
          {face}
        </Button>
        <Sheet isOpen={open} onOpenChange={setOpen} title={title ?? label}>
          {menu}
        </Sheet>
      </>
    );
  }
  return (
    <MenuTrigger isOpen={open} onOpenChange={setOpen}>
      <Button className={cn(menuButtonClass, className)}>{face}</Button>
      <Popover
        placement="bottom start"
        className="enter-pop max-h-[var(--visual-viewport-height)] min-w-[var(--trigger-width)] overflow-auto border border-outline bg-chrome text-text"
      >
        {menu}
      </Popover>
    </MenuTrigger>
  );
}
