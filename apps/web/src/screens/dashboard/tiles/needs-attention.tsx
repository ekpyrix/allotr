import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { SkeletonTile } from '@/components/bars';
import { BracketButton, Tag } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { MenuButton, MenuItem } from '@/components/menu';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { EmptyState } from '@/components/states';
import { IconMore2Line } from '@/generated/icons';
import { formatDay } from '@/features/today/format';
import { formatMoney } from '@/lib/format-money';
import { todayQuery } from '@/lib/ledger';
import { markRead, remindersQuery } from '@/lib/reminders';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';
import { attentionItems, type AttentionItem } from './needs-attention-model.ts';

const locale = 'en';

const columns: readonly RowColumn[] = [
  { width: '3.5rem' },
  { width: 'minmax(0, 1fr)' },
  { width: 'auto', from: 'medium' },
  { width: '1.75rem' },
];

type Presented = Readonly<{
  tag: string;
  text: string;
  action: string;
  href: string;
}>;

function present(item: AttentionItem): Presented {
  switch (item.kind) {
    case 'payday-overdue':
      return {
        tag: t('dashboardTiles.needsAttention.tagPayday'),
        text: t('dashboardTiles.needsAttention.payday'),
        action: t('dashboardTiles.needsAttention.actionPayday'),
        href: '/settings/money',
      };
    case 'bill-due':
      return {
        tag: t('dashboardTiles.needsAttention.tagBill'),
        text: item.today
          ? t('dashboardTiles.needsAttention.billDueToday', {
              name: item.name,
              amount: formatMoney(item.amount, 'symbol', locale),
            })
          : t('dashboardTiles.needsAttention.billDue', {
              name: item.name,
              amount: formatMoney(item.amount, 'symbol', locale),
              date: formatDay(item.dueOn, locale),
            }),
        action: t('dashboardTiles.needsAttention.actionBill'),
        href: '/budget/bills',
      };
    case 'missing-rate':
      return {
        tag: t('dashboardTiles.needsAttention.tagRate'),
        text: t('dashboardTiles.needsAttention.missingRate', {
          currency: item.currency,
        }),
        action: t('dashboardTiles.needsAttention.actionRate'),
        href: '/settings/money',
      };
    case 'reminder':
      return {
        tag:
          item.reminderKind === 'weekly_review'
            ? t('dashboardTiles.needsAttention.tagReview')
            : t('dashboardTiles.needsAttention.tagIou'),
        text: item.body,
        action: t('dashboardTiles.needsAttention.actionOpen'),
        href: item.url,
      };
  }
}

// "Needs attention" (docs/ui.md §6): a tag, the text, an action and a ⋮ menu
// per item, from today's figures and the unread reminders.
export function NeedsAttentionTile() {
  const today = useQuery(todayQuery);
  const reminders = useQuery(remindersQuery);
  const router = useRouter();
  const queryClient = useQueryClient();
  const read = useMutation({
    mutationFn: (id: string) => markRead([id]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminders'] }),
  });
  const title = t('dashboardTiles.needsAttention.title');

  if (today.isError || reminders.isError) {
    return (
      <Tile title={title}>
        <TileFailed
          retry={() => {
            void today.refetch();
            void reminders.refetch();
          }}
        />
      </Tile>
    );
  }
  if (today.data === undefined || reminders.data === undefined) {
    return <SkeletonTile />;
  }

  const items = attentionItems(today.data, reminders.data.reminders);
  const go = (href: string) => {
    void router.navigate({ href });
  };

  return (
    <Tile
      title={title}
      subtitle={items.length === 0 ? undefined : String(items.length)}
      bodyClassName="px-0 pb-0"
    >
      {items.length === 0 ? (
        <EmptyState
          title={t('dashboardTiles.needsAttention.empty')}
          hint={t('dashboardTiles.needsAttention.emptyHint')}
        />
      ) : (
        <div>
          {items.map((item) => {
            const view = present(item);
            return (
              <Row
                key={item.id}
                columns={columns}
                cells={[
                  <Tag
                    key="tag"
                    tone={item.kind === 'payday-overdue' ? 'warning' : 'muted'}
                  >
                    {view.tag}
                  </Tag>,
                  view.text,
                  <BracketButton
                    key="action"
                    onPress={() => {
                      go(view.href);
                    }}
                  >
                    {view.action}
                  </BracketButton>,
                  <MenuButton
                    key="more"
                    label={t('dashboardTiles.needsAttention.more')}
                    icon={IconMore2Line}
                    className="size-hit justify-center border-0"
                  >
                    <MenuItem
                      id="open"
                      label={view.action}
                      onAction={() => {
                        go(view.href);
                      }}
                    />
                    {item.kind === 'reminder' ? (
                      <MenuItem
                        id="read"
                        label={t('dashboardTiles.needsAttention.markRead')}
                        onAction={() => {
                          read.mutate(item.reminderId);
                        }}
                      />
                    ) : null}
                  </MenuButton>,
                ]}
              />
            );
          })}
        </div>
      )}
    </Tile>
  );
}
