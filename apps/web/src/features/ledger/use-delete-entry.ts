import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSnackbar } from '@/components/ui/snackbar';
import { ApiError } from '@/lib/api';
import {
  entryQueryKeys,
  restoreTransaction,
  revertTransaction,
  reverseTransaction,
} from '@/lib/ledger';
import { haptic } from '@/motion/haptics';
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';

// Deleting an entry posts its undo (FR-L4): nothing is removed from the
// ledger, but the entry drops out of every list. The snackbar's Undo
// restores it as a copy, so a slip is never permanent.

function useRefresh() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all(
        entryQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
    [queryClient],
  );
}

/** Restores a deleted entry and says so; returns the copy's id. */
export function useRestoreEntry() {
  const refresh = useRefresh();
  const snack = useSnackbar();
  return useMutation({
    mutationFn: async (input: { id: string; description: string }) =>
      (await restoreTransaction(input.id)).id,
    onSuccess: async (_copyId, { description }) => {
      await refresh();
      snack({ message: t('entries.restored', { entry: description }) });
    },
    onError: (error) => {
      snack({ message: errorMessage(error), tone: 'error' });
      haptic('error');
    },
  });
}

/**
 * Goes back to an earlier version of an edited entry and says so; returns
 * the id of the copy that now stands.
 */
export function useRevertEntry() {
  const refresh = useRefresh();
  const snack = useSnackbar();
  return useMutation({
    mutationFn: async (id: string) =>
      (await revertTransaction(id)).replacement.id,
    onSuccess: async () => {
      await refresh();
      snack({ message: t('ledger.entry.reverted') });
    },
    onError: (error) => {
      snack({ message: errorMessage(error), tone: 'error' });
      haptic('error');
    },
  });
}

/**
 * Deletes an entry, then offers Undo in the snackbar. `description` names
 * the entry in both messages.
 */
export function useDeleteEntry(onDeleted?: () => void) {
  const refresh = useRefresh();
  const snack = useSnackbar();
  const restore = useRestoreEntry();
  return useMutation({
    mutationFn: async (input: { id: string; description: string }) => {
      try {
        await reverseTransaction(input.id);
      } catch (error) {
        // Deleted elsewhere in the meantime: what was asked is done.
        if (
          error instanceof ApiError &&
          error.problem.code === 'already_reversed'
        )
          return;
        throw error;
      }
    },
    // Awaited, so the row is gone before focus and the message move on.
    onSuccess: async (_, input) => {
      await refresh();
      onDeleted?.();
      snack({
        message: t('entries.deleted', { entry: input.description }),
        action: {
          label: t('entries.restore'),
          onAction: () => {
            restore.mutate(input);
          },
        },
      });
    },
  });
}
