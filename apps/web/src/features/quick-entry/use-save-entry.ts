import type { CreateTransactionBody } from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTransaction, entryQueryKeys } from '@/lib/ledger';

export function useSaveEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      body,
      idempotencyKey,
    }: {
      body: CreateTransactionBody;
      idempotencyKey: string;
    }) => createTransaction(body, idempotencyKey),
    // Not awaited: the dialog closes at once and the views refetch behind it.
    onSuccess: () => {
      for (const queryKey of entryQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
    },
  });
}
