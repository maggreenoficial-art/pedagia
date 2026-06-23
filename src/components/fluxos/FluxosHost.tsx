'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FluxosPage } from '@/components/fluxos/FluxosPage';

function isFluxosVisible(): boolean {
  const el = document.getElementById('view-fluxos');
  if (!el) return false;
  return el.style.display !== 'none';
}

export function FluxosHost({ enabled }: { enabled: boolean }) {
  const [show, setShow] = useState(false);
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const ensureView = () => {
      const root = document.getElementById('pedagia-root');
      if (!root || document.getElementById('view-fluxos')) return;
      const wrap = document.getElementById('main-wrap');
      const fluxos = document.createElement('div');
      fluxos.id = 'view-fluxos';
      fluxos.style.display = 'none';
      if (wrap) wrap.insertBefore(fluxos, wrap.firstChild?.nextSibling || null);
      else root.appendChild(fluxos);
    };

    ensureView();

    const sync = () => {
      ensureView();
      const visible = isFluxosVisible();
      setShow(visible);
      if (visible) setMountEl(document.getElementById('view-fluxos'));
    };

    sync();
    window.addEventListener('pedagia:viewchange', sync);
    const target = document.getElementById('view-fluxos');
    const obs = target && new MutationObserver(sync);
    if (target && obs) obs.observe(target, { attributes: true, attributeFilter: ['style'] });

    return () => {
      window.removeEventListener('pedagia:viewchange', sync);
      obs?.disconnect();
    };
  }, [enabled]);

  if (!show || !mountEl) return null;
  return createPortal(<FluxosPage />, mountEl);
}
