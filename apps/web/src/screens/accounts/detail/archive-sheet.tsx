import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { AccountView } from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import {
  archiveWarning,
  type ArchiveWarning,
} from '@/features/accounts/archive-impact';
import { transferTargets } from '@/features/accounts/groups';
import { formatMoney } from '@/lib/format-money';
import {
  allAccountsQuery,
  archiveAccount,
  archiveImpactQuery,
  entryQueryKeys,
  type Settle,
} from '@/lib/ledger';
import { t } from '@/messages/t';
import { ChoiceField } from '@/screens/transactions/detail/fields.tsx';

const locale = 'en';
type Method = 'transfer' | 'write_off';

/**
 * Archives an account. A balance is cleared first, in the same request, by
 * transferring it or writing it off; the server works out how that changes
 * today's figure and the sheet only shows it.
 */
export function ArchiveSheet({
  account,
  open,
  onClose,
}: {
  account: AccountView;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const accounts = useQuery(allAccountsQuery).data?.accounts;
  const held = account.balance.amountMinor !== 0;
  const impact = useQuery({ ...archiveImpactQuery(account.id), enabled: held });
  const targets =
    accounts === undefined ? [] : transferTargets(account, accounts);

  const [picked, setPicked] = useState<Method | undefined>();
  const [target, setTarget] = useState('');
  const method: Method =
    picked ?? (targets.length > 0 ? 'transfer' : 'write_off');
  const toAccountId = target === '' ? (targets[0]?.id ?? '') : target;

  const settle: Settle | undefined = !held
    ? undefined
    : method === 'transfer'
      ? { method: 'transfer', toAccountId }
      : { method: 'write_off' };

  const archive = useMutation({
    mutationFn: () => archiveAccount(account.id, settle),
    onSuccess: () => {
      for (const queryKey of entryQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
      onClose();
    },
  });

  const amount = formatMoney(account.balance, 'symbol', locale);
  const warning =
    impact.data === undefined || accounts === undefined
      ? null
      : archiveWarning(impact.data, account, settle, accounts);
  const blocked =
    held &&
    (impact.data === undefined ||
      (method === 'transfer' && toAccountId === ''));

  return (
    <Sheet
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('accounts.archiveFlow.title', { name: account.name })}
      closeLabel={t('accounts.close')}
    >
      <div className="flex flex-col gap-3 p-3">
        <p className="font-sans text-small text-text-muted">
          {held
            ? t('accounts.archiveFlow.balance', { amount })
            : t('accounts.archiveFlow.empty')}
        </p>

        {held ? (
          <>
            <ChoiceField
              label={t('accounts.archiveFlow.how')}
              value={method}
              choices={[
                ...(targets.length > 0
                  ? [
                      {
                        id: 'transfer',
                        label: t('accounts.archiveFlow.transfer'),
                      },
                    ]
                  : []),
                { id: 'write_off', label: t('accounts.archiveFlow.writeOff') },
              ]}
              placeholder={t('accounts.archiveFlow.how')}
              onChange={(id) => {
                setPicked(id === 'transfer' ? 'transfer' : 'write_off');
              }}
            />
            {targets.length === 0 ? (
              <p className="text-small text-text-muted">
                {t('accounts.archiveFlow.noTargets', {
                  currency: account.currency,
                })}
              </p>
            ) : null}
            {method === 'transfer' ? (
              <ChoiceField
                label={t('accounts.archiveFlow.transferTo')}
                value={toAccountId}
                choices={targets.map((a) => ({ id: a.id, label: a.name }))}
                placeholder={t('accountDetail.archiveSheet.noTargetChosen')}
                onChange={setTarget}
              />
            ) : (
              <p className="font-sans text-small text-text-muted">
                {t('accounts.archiveFlow.writeOffHint', { amount })}
              </p>
            )}
            <Impact
              loading={impact.isPending}
              failed={impact.isError}
              warning={warning}
              amount={amount}
            />
          </>
        ) : null}

        {archive.isError ? (
          <p role="alert" className="text-small text-negative">
            {t('accountDetail.archiveSheet.failed')}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <BracketButton onPress={onClose}>
            {t('accounts.cancel')}
          </BracketButton>
          <PrimaryButton
            isDisabled={archive.isPending || blocked}
            onPress={() => {
              archive.mutate();
            }}
          >
            {archive.isPending
              ? t('accounts.archiveFlow.saving')
              : !held
                ? t('accounts.archiveFlow.confirm')
                : method === 'transfer'
                  ? t('accounts.archiveFlow.confirmTransfer')
                  : t('accounts.archiveFlow.confirmWriteOff')}
          </PrimaryButton>
        </div>
      </div>
    </Sheet>
  );
}

/** What the chosen way does to today's figure, from the server. */
function Impact({
  loading,
  failed,
  warning,
  amount,
}: {
  loading: boolean;
  failed: boolean;
  warning: ArchiveWarning | null;
  amount: string;
}) {
  const money = (m: Parameters<typeof formatMoney>[0]) =>
    formatMoney(m, 'symbol', locale);
  if (loading)
    return (
      <p role="status" className="text-small text-text-muted">
        {t('accounts.archiveFlow.impact.loading')}
      </p>
    );
  if (failed)
    return (
      <p role="alert" className="text-small text-negative">
        {t('accounts.archiveFlow.impact.failed')}
      </p>
    );
  if (warning === null) return null;
  const drop = money(warning.drop);
  const text =
    warning.kind === 'write_off'
      ? t('accounts.archiveFlow.impact.writeOff', { drop })
      : warning.kind === 'savings'
        ? t('accounts.archiveFlow.impact.savings', {
            amount,
            target: warning.target.name,
            drop,
          })
        : t('accounts.archiveFlow.impact.transfer', { drop });
  return (
    <div
      role="status"
      className="flex flex-col gap-1 border-l-[3px] border-l-warning pl-2 text-small"
    >
      <p className="font-sans">{text}</p>
      <p className="num text-text-muted">
        {t('accounts.archiveFlow.leftToday')} {money(warning.before)}{' '}
        {t('accounts.archiveFlow.becomes')} {money(warning.after)}
      </p>
    </div>
  );
}
