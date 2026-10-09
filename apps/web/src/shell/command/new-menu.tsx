import { useState, type ComponentType } from 'react';
import {
  Menu,
  MenuTrigger,
  Popover,
  Button as AriaButton,
} from 'react-aria-components';
import { MenuItem } from '@/components/menu';
import { menuPresentation } from '@/components/menu-placement';
import { EmptyState } from '@/components/states';
import { Sheet } from '@/components/sheet';
import { useFrameWidth } from '@/components/use-frame-width';
import {
  IconAddLine,
  IconArrowDownLine,
  IconArrowLeftRightLine,
  IconArrowUpLine,
  IconBillLine,
  IconCalendarLine,
  IconGroupLine,
  IconScales3Line,
  type IconProps,
} from '@/generated/icons';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import {
  closeNewForm,
  NEW_FORM_KINDS,
  openNewForm,
  useCommandState,
  type NewFormKind,
} from './store.ts';

const kindIcons: Record<NewFormKind, ComponentType<IconProps>> = {
  expense: IconArrowDownLine,
  income: IconArrowUpLine,
  transfer: IconArrowLeftRightLine,
  split: IconGroupLine,
  payday: IconCalendarLine,
  bill: IconBillLine,
  iou: IconScales3Line,
};

const triggerClass =
  'inline-flex min-h-hit min-w-hit items-center justify-center gap-1 bg-primary px-3 text-small font-semibold text-on-primary hover:brightness-110 pressed:brightness-90';

/** The filled **+ new** menu (docs/ui.md §3): a popover, or a sheet on phones. */
export function NewMenu() {
  const sheet = menuPresentation(useFrameWidth()) === 'sheet';
  const [open, setOpen] = useState(false);
  const face = (
    <>
      <IconAddLine className="size-3.5" />
      {t('shell.command.new')}
    </>
  );
  const items = NEW_FORM_KINDS.map((kind) => (
    <MenuItem
      key={kind}
      id={kind}
      label={t(`shell.command.kinds.${kind}`)}
      icon={kindIcons[kind]}
      onAction={() => {
        setOpen(false);
        openNewForm(kind);
      }}
    />
  ));
  const menu = (
    <Menu
      aria-label={t('shell.command.newTitle')}
      className={cn(
        'min-w-48 py-1 outline-none',
        sheet && '[&_[role^=menuitem]]:min-h-[2.75rem]',
      )}
    >
      {items}
    </Menu>
  );
  return (
    <>
      {sheet ? (
        <>
          <AriaButton
            aria-haspopup="menu"
            aria-expanded={open}
            onPress={() => {
              setOpen(true);
            }}
            className={triggerClass}
          >
            {face}
          </AriaButton>
          <Sheet
            isOpen={open}
            onOpenChange={setOpen}
            title={t('shell.command.newTitle')}
            closeLabel={t('shell.command.close')}
          >
            {menu}
          </Sheet>
        </>
      ) : (
        <MenuTrigger isOpen={open} onOpenChange={setOpen}>
          <AriaButton className={triggerClass}>{face}</AriaButton>
          <Popover
            placement="top end"
            className="enter-pop min-w-[var(--trigger-width)] border border-outline bg-chrome text-text"
          >
            {menu}
          </Popover>
        </MenuTrigger>
      )}
      <NewFormHost />
    </>
  );
}

/**
 * Where a + new item's form opens. The structured forms arrive in later
 * work packages and replace the body here; until then each shows a note.
 */
function NewFormHost() {
  const { newForm } = useCommandState();
  return (
    <Sheet
      isOpen={newForm !== null}
      onOpenChange={(open) => {
        if (!open) closeNewForm();
      }}
      title={newForm === null ? '' : t(`shell.command.kinds.${newForm}`)}
      closeLabel={t('shell.command.close')}
    >
      <EmptyState
        title={newForm === null ? '' : t(`shell.command.kinds.${newForm}`)}
        hint={t('shell.command.formPending')}
      />
    </Sheet>
  );
}
