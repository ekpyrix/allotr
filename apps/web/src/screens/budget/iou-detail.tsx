import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IouSettlementView, IouView } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { BracketButton, Tag } from '@/components/buttons';
import { formatDay } from '@/features/today/format';
import { iouQueryKeys } from '@/lib/ious';
import { formatMoney } from '@/lib/format-money';
import { reverseTransaction } from '@/lib/ledger';
import { describeProblem } from '@/lib/problem';
import { t } from '@/messages/t';
import type { IouFlow } from './iou-sheets.tsx';
import type { Person } from './ious-model.ts';

const locale = 'en';

function kindLabel(settlement: IouSettlementView, iou: IouView): string {
  return settlement.kind === 'write-off'
    ? t('budgetGoalsIous.ious.writtenOff')
    : iou.direction === 'owed-to-me'
      ? t('budgetGoalsIous.ious.repaid')
      : t('budgetGoalsIous.ious.paidBack');
}

/** A person's IOUs: each with its payments, and the ways to settle it. */
export function PersonDetail({
  person,
  onFlow,
}: {
  person: Person;
  onFlow: (flow: IouFlow) => void;
}) {
  return (
    <div>
      {person.ious.map((iou) => (
        <IouBlock key={iou.id} iou={iou} onFlow={onFlow} />
      ))}
    </div>
  );
}

function IouBlock({
  iou,
  onFlow,
}: {
  iou: IouView;
  onFlow: (flow: IouFlow) => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: reverseTransaction,
    onSuccess: () => {
      for (const queryKey of iouQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
    },
  });
  const toMe = iou.direction === 'owed-to-me';
  const payments = iou.settlements.filter((s) => !s.undone);
  const amount = formatMoney(iou.amount, 'symbol', locale);
  const date = formatDay(iou.recordedOn, locale);
  const name = iou.person;
  const act = (action: string) =>
    t('budgetGoalsIous.ious.actionFor', { action, person: name });
  return (
    <section
      aria-label={`${name} ${toMe ? t('budgetGoalsIous.ious.owesYouTag') : t('budgetGoalsIous.ious.youOweTag')} ${date}`}
      className="border-b"
    >
      <div className="flex items-center gap-2 px-3 pt-2">
        <Tag>
          {toMe
            ? t('budgetGoalsIous.ious.owesYouTag')
            : t('budgetGoalsIous.ious.youOweTag')}
        </Tag>
        {iou.settled ? (
          <Tag tone="positive">{t('budgetGoalsIous.ious.settledTag')}</Tag>
        ) : null}
        {iou.overdue ? (
          <Tag tone="warning">
            {t('budgetGoalsIous.ious.overdueTag', { count: iou.daysOverdue })}
          </Tag>
        ) : null}
        <span className="ml-auto text-stat-sub font-semibold">
          <Amount amount={iou.outstanding} locale={locale} />
        </span>
      </div>
      <p className="num px-3 text-small text-text-muted">
        {(toMe
          ? t('budgetGoalsIous.ious.lent', { amount, date })
          : t('budgetGoalsIous.ious.borrowed', { amount, date })) +
          ' · ' +
          (iou.dueOn === null
            ? t('budgetGoalsIous.ious.noDue')
            : t('budgetGoalsIous.ious.dueOn', {
                date: formatDay(iou.dueOn, locale),
              }))}
      </p>
      <h3 className="px-3 pt-1 text-small text-text-muted">
        {t('budgetGoalsIous.ious.history')}
      </h3>
      {payments.length === 0 ? (
        <p className="px-3 font-sans text-small">
          {t('budgetGoalsIous.ious.noPayments')}
        </p>
      ) : (
        <ul>
          {payments.map((s) => {
            const kind = kindLabel(s, iou);
            const shown = formatMoney(s.amount, 'symbol', locale);
            const when = formatDay(s.on, locale);
            return (
              <li
                key={s.id}
                className="flex min-h-row items-center gap-2 px-3 text-small"
              >
                <span className="num text-text-muted">{when}</span>
                <span className="min-w-0 flex-1 truncate font-sans">
                  {kind}
                </span>
                <span className="num">{shown}</span>
                <BracketButton
                  tone="destructive"
                  aria-label={t('budgetGoalsIous.ious.deletePayment', {
                    kind: kind.toLowerCase(),
                    amount: shown,
                    date: when,
                  })}
                  isDisabled={remove.isPending}
                  onPress={() => {
                    remove.mutate(s.transactionId);
                  }}
                >
                  {t('budgetGoalsIous.ious.delete')}
                </BracketButton>
              </li>
            );
          })}
        </ul>
      )}
      {remove.isError ? (
        <p role="alert" className="px-3 text-small text-negative">
          {describeProblem(remove.error).message}
        </p>
      ) : null}
      {iou.settled ? null : (
        <div className="flex flex-wrap items-center gap-1 px-3 py-1.5">
          <BracketButton
            aria-label={act(
              toMe
                ? t('budgetGoalsIous.ious.repay')
                : t('budgetGoalsIous.ious.payBack'),
            )}
            onPress={() => {
              onFlow({ kind: 'repay', iou });
            }}
          >
            {toMe
              ? t('budgetGoalsIous.ious.repay')
              : t('budgetGoalsIous.ious.payBack')}
          </BracketButton>
          <BracketButton
            aria-label={act(t('budgetGoalsIous.ious.dueDate'))}
            onPress={() => {
              onFlow({ kind: 'due', iou });
            }}
          >
            {t('budgetGoalsIous.ious.dueDate')}
          </BracketButton>
          {toMe ? (
            <BracketButton
              tone="destructive"
              aria-label={act(t('budgetGoalsIous.ious.writeOff'))}
              onPress={() => {
                onFlow({ kind: 'writeoff', iou });
              }}
            >
              {t('budgetGoalsIous.ious.writeOff')}
            </BracketButton>
          ) : null}
        </div>
      )}
    </section>
  );
}
