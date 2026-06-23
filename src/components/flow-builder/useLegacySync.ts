'use client';

import { useEffect } from 'react';
import { fetchLegacySnapshot } from '@/lib/legacy/bridge';
import { useFlowStore } from '@/store/useFlowStore';

/** Atualiza o store enquanto o modal está aberto (pool, mídias, etc.). */
export function useLegacySync(enabled: boolean, ms = 2500) {
  const hydrateFromLegacy = useFlowStore((s) => s.hydrateFromLegacy);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const snap = fetchLegacySnapshot();
      if (snap) hydrateFromLegacy(snap);
    };
    tick();
    const id = window.setInterval(tick, ms);
    return () => window.clearInterval(id);
  }, [enabled, ms, hydrateFromLegacy]);
}
