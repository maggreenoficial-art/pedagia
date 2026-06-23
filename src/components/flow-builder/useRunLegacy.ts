'use client';

import { useCallback, useState } from 'react';
import {
  fetchLegacySnapshot,
  isLegacyBooted,
  legacyToast,
  syncExamFieldsToLegacy,
} from '@/lib/legacy/bridge';
import { useFlowStore } from '@/store/useFlowStore';

export function useRunLegacy() {
  const exam = useFlowStore((s) => s.exam);
  const hydrateFromLegacy = useFlowStore((s) => s.hydrateFromLegacy);
  const refreshNodeStatuses = useFlowStore((s) => s.refreshNodeStatuses);
  const [busy, setBusy] = useState(false);

  const afterLegacyAction = useCallback(() => {
    const snap = fetchLegacySnapshot();
    if (snap) hydrateFromLegacy(snap);
    else refreshNodeStatuses();
  }, [hydrateFromLegacy, refreshNodeStatuses]);

  const runLegacy = useCallback(
    async (fn: () => Promise<void> | void) => {
      if (!isLegacyBooted()) {
        legacyToast('Sistema ainda carregando… Aguarde um instante.', 'err');
        return;
      }
      syncExamFieldsToLegacy(exam);
      setBusy(true);
      try {
        await fn();
        afterLegacyAction();
      } catch (e) {
        legacyToast(e instanceof Error ? e.message : 'Erro inesperado', 'err');
      } finally {
        setBusy(false);
      }
    },
    [exam, afterLegacyAction],
  );

  return { busy, runLegacy, afterLegacyAction };
}
