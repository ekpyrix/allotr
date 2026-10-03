import type { CreateIouBody } from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { entryQueryKeys } from '@/lib/ledger';
import { createIou, iouQueryKeys } from '@/lib/ious';

/** Records a split bill; a repeated key returns the entry it first made. */
export function useSplitSave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, key }: { body: CreateIouBody; key: string }) =>
      createIou(body, key),
    onSuccess: () => {
      for (const queryKey of [...entryQueryKeys, ...iouQueryKeys])
        void queryClient.invalidateQueries({ queryKey });
    },
  });
}
