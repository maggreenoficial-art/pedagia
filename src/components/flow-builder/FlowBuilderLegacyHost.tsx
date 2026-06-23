'use client';

import { useEffect } from 'react';
import { useFlowStore } from '@/store/useFlowStore';

/** Campos ocultos + listener global para montagem inline (sempre montado no builder). */
export function FlowBuilderLegacyHost() {
  useEffect(() => {
    const onResult = () => {
      const store = useFlowStore.getState();
      store.onMaterialMounted();
    };
    window.addEventListener('pedagia:inline-result', onResult);
    return () => window.removeEventListener('pedagia:inline-result', onResult);
  }, []);

  return (
    <div className="pf-hidden" aria-hidden>
      <textarea id="prova-text" defaultValue="" />
      <textarea id="gab-text" defaultValue="" />
      <iframe id="exam-preview-iframe" title="" />
    </div>
  );
}
