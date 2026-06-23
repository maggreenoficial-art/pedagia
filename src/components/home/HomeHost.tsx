'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HomePage } from '@/components/home/HomePage';

function isHomeVisible(): boolean {
  const el = document.getElementById('view-home');
  if (!el) return false;
  return el.style.display !== 'none';
}

export function HomeHost({ enabled }: { enabled: boolean }) {
  const [show, setShow] = useState(false);
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const sync = () => {
      const visible = isHomeVisible();
      setShow(visible);
      if (visible) setMountEl(document.getElementById('view-home'));
    };

    sync();
    window.addEventListener('pedagia:viewchange', sync);
    const target = document.getElementById('view-home');
    const obs = target && new MutationObserver(sync);
    if (target && obs) obs.observe(target, { attributes: true, attributeFilter: ['style'] });

    return () => {
      window.removeEventListener('pedagia:viewchange', sync);
      obs?.disconnect();
    };
  }, [enabled]);

  if (!show || !mountEl) return null;
  return createPortal(<HomePage />, mountEl);
}
