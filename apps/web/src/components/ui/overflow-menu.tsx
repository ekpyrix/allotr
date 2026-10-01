import * as React from 'react';
import { Ellipsis } from 'lucide-react';
import { Menu, MenuContent, MenuTrigger } from '@/components/ui/menu';
import { IconButton } from '@/components/ui/icon-button';
import { t } from '@/messages/t';

// The overflow menu (ADR 0022): rarely used actions, such as rename, move
// to another pool or archive, sit behind one "more" button instead of a row
// of buttons. Put `MenuItem`s inside.

function OverflowMenu({
  label = t('ui.moreActions'),
  children,
}: {
  /** Names the trigger, e.g. "More actions for Everyday". */
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton aria-label={label}>
          <Ellipsis aria-hidden="true" />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end">{children}</MenuContent>
    </Menu>
  );
}

export { OverflowMenu };
