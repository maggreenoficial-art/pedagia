'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    currentSession?: { access_token?: string };
  }
}

/** Enriquece a tela de loading com mensagem de perfil de escrita quando ativo. */
export function LoadingHost({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    const enhance = async () => {
      const view = document.getElementById('view-loading');
      if (!view || view.style.display === 'none') return;

      const desc = document.getElementById('load-desc');
      if (!desc) return;

      try {
        const token = window.currentSession?.access_token;
        const headers: HeadersInit = token
          ? { Authorization: `Bearer ${token}` }
          : { 'Content-Type': 'application/json' };
        const res = await fetch('/api/professor-profile', { headers });
        if (!res.ok) return;
        const data = await res.json();
        if (data.profile?.writingProfile?.summary) {
          const base = desc.textContent || 'Gerando com IA…';
          if (!base.includes('seu estilo')) {
            desc.textContent = `${base} · Usando seu estilo de escrita`;
          }
        }
      } catch {
        /* offline */
      }
    };

    const onView = () => void enhance();
    window.addEventListener('pedagia:viewchange', onView);
    const target = document.getElementById('view-loading');
    const obs =
      target &&
      new MutationObserver(() => {
        void enhance();
      });
    if (target && obs) obs.observe(target, { attributes: true, attributeFilter: ['style'] });

    return () => {
      window.removeEventListener('pedagia:viewchange', onView);
      obs?.disconnect();
    };
  }, [enabled]);

  return null;
}
