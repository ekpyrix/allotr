import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { BracketButton, PrimaryButton, Tag } from '@/components/buttons';
import { Split, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { Sheet } from '@/components/sheet';
import { Stats, type Stat } from '@/components/stats';
import { EmptyState } from '@/components/states';
import { useFrameWidth } from '@/components/use-frame-width';
import { allIousQuery } from '@/lib/ious';
import { t } from '@/messages/t';
import { PersonDetail } from './iou-detail.tsx';
import { IouSheet, type IouFlow } from './iou-sheets.tsx';
import {
  groupPeople,
  openCount,
  overdueCount,
  soleOpen,
  type Person,
} from './ious-model.ts';
import { TabFailed } from './tab-failed.tsx';

const locale = 'en';

const columns: readonly RowColumn[] = [
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
  { width: '6rem', from: 'medium' },
];

function PersonRow({
  person,
  selected,
  onSelect,
}: {
  person: Person;
  selected: boolean;
  onSelect: () => void;
}) {
  const sole = soleOpen(person);
  return (
    <Row
      columns={columns}
      selected={selected}
      onPress={onSelect}
      cells={[
        <span key="name" className="font-sans">
          {person.name}
        </span>,
        <span key="tags" className="flex items-center gap-1">
          {person.owedToMe.length > 0 ? (
            <Tag>{t('budgetGoalsIous.ious.owesYouTag')}</Tag>
          ) : null}
          {person.owedByMe.length > 0 ? (
            <Tag>{t('budgetGoalsIous.ious.youOweTag')}</Tag>
          ) : null}
          {person.daysOverdue > 0 ? (
            <Tag tone="warning">
              {t('budgetGoalsIous.ious.overdueTag', {
                count: person.daysOverdue,
              })}
            </Tag>
          ) : null}
          {person.writeOffOffered ? (
            <Tag>{t('budgetGoalsIous.ious.writeOffTag')}</Tag>
          ) : null}
          {person.settled ? (
            <Tag tone="positive">{t('budgetGoalsIous.ious.settledTag')}</Tag>
          ) : null}
        </span>,
        <span key="figure" className="num block text-right">
          {sole !== null ? (
            <Amount amount={sole.outstanding} locale={locale} />
          ) : person.open.length > 1 ? (
            t('budgetGoalsIous.ious.openMany', { count: person.open.length })
          ) : null}
        </span>,
      ]}
    />
  );
}

// IOUs (docs/ui.md §6): the people list and, beside it from 1000 px or in a
// sheet, the open person's IOUs, payments and actions. Totals and every
// amount are the server's; a person's open IOUs are never added up here.
export function IousTab() {
  const ious = useQuery(allIousQuery);
  const wide = useFrameWidth() >= 1000;
  const [showSettled, setShowSettled] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [flow, setFlow] = useState<IouFlow | null>(null);

  const list = ious.data?.ious;
  const people = useMemo(
    () => (list === undefined ? undefined : groupPeople(list, showSettled)),
    [list, showSettled],
  );
  const person =
    selected === null || list === undefined
      ? undefined
      : groupPeople(list, true).find((p) => p.key === selected);

  const stats: Stat[] | undefined =
    ious.data === undefined || list === undefined
      ? undefined
      : [
          {
            label: t('budgetGoalsIous.ious.stats.owesYou'),
            figure: (
              <Amount amount={ious.data.totals.owedToMe} locale={locale} />
            ),
            sub: t('budgetGoalsIous.ious.stats.owesYouSub'),
            tone: 'primary',
          },
          {
            label: t('budgetGoalsIous.ious.stats.youOwe'),
            figure: (
              <Amount amount={ious.data.totals.owedByMe} locale={locale} />
            ),
            sub: t('budgetGoalsIous.ious.stats.youOweSub'),
          },
          {
            label: t('budgetGoalsIous.ious.stats.open'),
            figure: String(openCount(list)),
            sub: t('budgetGoalsIous.ious.stats.openSub'),
          },
          {
            label: t('budgetGoalsIous.ious.stats.overdue'),
            figure:
              overdueCount(list) === 0
                ? t('budgetGoalsIous.ious.stats.overdueNone')
                : String(overdueCount(list)),
            sub: t('budgetGoalsIous.ious.stats.overdueSub'),
          },
        ];

  let body;
  if (ious.isError) {
    body = (
      <TabFailed
        retry={() => {
          void ious.refetch();
        }}
      />
    );
  } else if (people === undefined) {
    body = <SkeletonTile />;
  } else if (people.length === 0) {
    body = (
      <EmptyState
        title={t('budgetGoalsIous.ious.empty')}
        hint={t('budgetGoalsIous.ious.emptyHint')}
      />
    );
  } else {
    body = (
      <div>
        {people.map((p) => (
          <PersonRow
            key={p.key}
            person={p}
            selected={p.key === selected}
            onSelect={() => {
              setSelected(p.key === selected ? null : p.key);
            }}
          />
        ))}
      </div>
    );
  }

  const detail =
    person === undefined ? null : (
      <PersonDetail person={person} onFlow={setFlow} />
    );

  return (
    <>
      {stats === undefined ? null : <Stats stats={stats} />}
      <Split
        list={
          <Tile
            title={t('budgetGoalsIous.ious.title')}
            bodyClassName="px-0 pb-0"
            actions={
              <>
                <BracketButton
                  aria-pressed={showSettled}
                  onPress={() => {
                    setShowSettled(!showSettled);
                  }}
                >
                  {showSettled
                    ? t('budgetGoalsIous.ious.hideSettled')
                    : t('budgetGoalsIous.ious.showSettled')}
                </BracketButton>
                <PrimaryButton
                  onPress={() => {
                    setFlow({ kind: 'loan' });
                  }}
                >
                  {t('budgetGoalsIous.ious.add')}
                </PrimaryButton>
              </>
            }
          >
            {body}
          </Tile>
        }
        detail={
          wide ? (
            <Tile
              title={person?.name ?? t('budgetGoalsIous.ious.detailTitle')}
              bodyClassName="px-0 pb-0"
            >
              {detail ?? (
                <EmptyState
                  title={t('budgetGoalsIous.ious.detailTitle')}
                  hint={t('budgetGoalsIous.ious.pickOne')}
                />
              )}
            </Tile>
          ) : null
        }
      />
      {wide ? null : (
        <Sheet
          isOpen={person !== undefined}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          title={person?.name ?? t('budgetGoalsIous.ious.detailTitle')}
          closeLabel={t('budgetGoalsIous.ious.closeDetail')}
        >
          {detail}
        </Sheet>
      )}
      <IouSheet
        flow={flow}
        onClose={() => {
          setFlow(null);
        }}
      />
    </>
  );
}
