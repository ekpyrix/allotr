import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import type { AccountView } from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import { call } from '@/lib/api';
import { endpoints } from '@/lib/endpoints';
import { t } from '@/messages/t';
import { TextField } from '../transactions/detail/fields.tsx';

const MAX_NAME = 100;

/** Renames one account; the server trims the name and refuses duplicates. */
export function RenameSheet({
  account,
  onClose,
}: {
  account: AccountView;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(account.name);
  const [error, setError] = useState<string | undefined>();
  const save = useMutation({
    mutationFn: (value: string) =>
      call(endpoints.updateAccount, {
        params: { id: account.id },
        body: { name: value },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onClose();
    },
  });

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const value = name.trim();
    if (value === '') {
      setError(t('accountsScreen.rename.nameRequired'));
      return;
    }
    if (value.length > MAX_NAME) {
      setError(t('accountsScreen.rename.nameLong'));
      return;
    }
    setError(undefined);
    if (value === account.name) {
      onClose();
      return;
    }
    save.mutate(value);
  };

  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('accountsScreen.rename.title', { name: account.name })}
      closeLabel={t('quickEntry.close')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <TextField
          label={t('accountsScreen.rename.name')}
          value={name}
          onChange={setName}
          error={error}
          autoFocus
        />
        {save.isError ? (
          <p role="alert" className="text-small text-negative">
            {t('accountsScreen.rename.failed')}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <BracketButton onPress={onClose}>
            {t('accountsScreen.cancel')}
          </BracketButton>
          <PrimaryButton type="submit" isDisabled={save.isPending}>
            {save.isPending
              ? t('accountsScreen.rename.saving')
              : t('accountsScreen.rename.save')}
          </PrimaryButton>
        </div>
      </form>
    </Sheet>
  );
}
