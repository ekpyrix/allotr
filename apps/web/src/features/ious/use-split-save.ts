import type { ConvertToIouBody, CreateIouBody } from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { entryQueryKeys } from '@/lib/ledger';
import { convertToIou, createIou, iouQueryKeys } from '@/lib/ious';

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

/** Splits a logged expense; a repeated key returns what it first made. */
export function useConvertSave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
      key,
    }: {
      id: string;
      body: ConvertToIouBody;
      key: string;
    }) => convertToIou(id, body, key),
    onSuccess: () => {
      for (const queryKey of [...entryQueryKeys, ...iouQueryKeys])
        void queryClient.invalidateQueries({ queryKey });
    },
  });
}
