import * as React from 'react';
import {
  ContextMenu as ContextPrimitive,
  DropdownMenu as MenuPrimitive,
} from 'radix-ui';
import { cn } from '@/lib/utils';

// Menus (spec §8.2): a dropdown from a button, and a context menu from a
// right click or long press. card-raised with a hairline; the highlighted
// item steps down to card, where text is fitted too.

const content =
  'z-50 min-w-48 overflow-hidden rounded-lg border border-outline-variant bg-card-raised p-1 text-text outline-none data-[state=closed]:overlay-out data-[state=open]:overlay-in';
const item =
  'flex min-h-12 cursor-pointer items-center gap-3 rounded-sm px-3 text-body-lg outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-card data-[variant=danger]:text-negative [&_svg]:size-5 [&_svg]:stroke-[1.75]';

// Not modal: a modal menu hides the rest of the page from assistive
// technology while it stays focusable (axe aria-hidden-focus), and a menu
// needs no trap; Escape and an outside click close it.
function Menu(props: React.ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root modal={false} {...props} />;
}
const MenuTrigger = MenuPrimitive.Trigger;

function MenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(content, className)}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

function MenuItem({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item> & {
  variant?: 'danger';
}) {
  return (
    <MenuPrimitive.Item
      data-variant={variant}
      className={cn(item, className)}
      {...props}
    />
  );
}

function ContextMenu(
  props: React.ComponentProps<typeof ContextPrimitive.Root>,
) {
  return <ContextPrimitive.Root modal={false} {...props} />;
}
const ContextMenuTrigger = ContextPrimitive.Trigger;

function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextPrimitive.Content>) {
  return (
    <ContextPrimitive.Portal>
      <ContextPrimitive.Content className={cn(content, className)} {...props} />
    </ContextPrimitive.Portal>
  );
}

function ContextMenuItem({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof ContextPrimitive.Item> & {
  variant?: 'danger';
}) {
  return (
    <ContextPrimitive.Item
      data-variant={variant}
      className={cn(item, className)}
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
};
