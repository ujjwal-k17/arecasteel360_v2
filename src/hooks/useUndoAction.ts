import { useRef, useCallback } from 'react';
import { toast } from 'sonner';

interface UndoableAction {
  execute: () => Promise<void>;
  undo: () => Promise<void>;
  successMessage: string;
  undoMessage: string;
}

export function useUndoAction() {
  const timeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const performAction = useCallback(async (action: UndoableAction) => {
    try {
      await action.execute();

      const actionId = crypto.randomUUID();

      toast(action.successMessage, {
        duration: 10000,
        action: {
          label: 'Undo',
          onClick: async () => {
            const timeout = timeoutRef.current.get(actionId);
            if (timeout) clearTimeout(timeout);
            timeoutRef.current.delete(actionId);
            try {
              await action.undo();
              toast.success(action.undoMessage);
            } catch {
              toast.error('Failed to undo action');
            }
          },
        },
      });

      // Clean up reference after 10 seconds
      const timeout = setTimeout(() => {
        timeoutRef.current.delete(actionId);
      }, 10000);
      timeoutRef.current.set(actionId, timeout);

    } catch (err: any) {
      toast.error(err.message || 'Action failed');
      throw err;
    }
  }, []);

  return { performAction };
}
