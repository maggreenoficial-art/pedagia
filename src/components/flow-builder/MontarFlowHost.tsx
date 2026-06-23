'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BuilderFlow } from '@/components/flow-builder/BuilderFlow';
import { fetchLegacySnapshot } from '@/lib/legacy/bridge';
import { useFlowStore } from '@/store/useFlowStore';

function isBuilderViewVisible(): boolean {
  const el = document.getElementById('view-builder');
  if (!el) return false;
  return el.style.display !== 'none';
}

/**
 * Monta o React Flow dentro de #view-builder quando o professor abre Montar/Flux.
 * A UI legada (.bd-page) fica oculta via CSS; o DOM bd-* permanece para a bridge.
 */
export function MontarFlowHost({ enabled }: { enabled: boolean }) {
  const [show, setShow] = useState(false);
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);
  const hydrateFromLegacy = useFlowStore((s) => s.hydrateFromLegacy);
  const refreshNodeStatuses = useFlowStore((s) => s.refreshNodeStatuses);

  useEffect(() => {
    if (!enabled) return;

    const sync = () => {
      const visible = isBuilderViewVisible();
      setShow(visible);
      if (visible) {
        setMountEl(document.getElementById('view-builder'));
        const snap = fetchLegacySnapshot();
        if (snap) hydrateFromLegacy(snap);
        else refreshNodeStatuses();
      }
    };

    sync();

    window.addEventListener('pedagia:viewchange', sync);
    window.addEventListener('pedagia:flow-resumed', sync);
    const target = document.getElementById('view-builder');
    const obs =
      target &&
      new MutationObserver(sync);

    if (target && obs) {
      obs.observe(target, { attributes: true, attributeFilter: ['style'] });
    }

    return () => {
      window.removeEventListener('pedagia:viewchange', sync);
      window.removeEventListener('pedagia:flow-resumed', sync);
      obs?.disconnect();
    };
  }, [enabled, hydrateFromLegacy, refreshNodeStatuses]);

  if (!show || !mountEl) return null;

  return createPortal(<BuilderFlow />, mountEl);
}
