'use client';

import { useEffect } from 'react';

/** Atualiza nav legada (top + bottom) — Fluxos no menu, remove Criador IA. */
export function LegacyNavPatch({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    const patch = () => {
      document.querySelectorAll('.bn-item[data-view="inteligente"], #np-ci').forEach((el) => {
        el.remove();
      });

      const bottomNav = document.getElementById('bottom-nav');
      if (bottomNav && !bottomNav.querySelector('[data-view="fluxos"]')) {
        const fluxosBtn = document.createElement('button');
        fluxosBtn.type = 'button';
        fluxosBtn.className = 'bn-item';
        fluxosBtn.dataset.view = 'fluxos';
        fluxosBtn.onclick = () => window.goTo?.('fluxos');
        fluxosBtn.innerHTML =
          '<span class="bn-icon" aria-hidden="true">📂</span><span class="bn-label">Fluxos</span>';

        const historyBtn = bottomNav.querySelector('[data-view="history"]');
        if (historyBtn) bottomNav.insertBefore(fluxosBtn, historyBtn);
        else bottomNav.appendChild(fluxosBtn);
      }

      const pills = document.querySelector('.navpills');
      if (pills && !document.getElementById('np-fluxos')) {
        const fluxosPill = document.createElement('button');
        fluxosPill.className = 'np';
        fluxosPill.id = 'np-fluxos';
        fluxosPill.dataset.view = 'fluxos';
        fluxosPill.onclick = () => window.goTo?.('fluxos');
        fluxosPill.textContent = '📂 Meus fluxos';

        const histPill = document.getElementById('np-hist');
        if (histPill) pills.insertBefore(fluxosPill, histPill);
        else pills.appendChild(fluxosPill);
      }
    };

    patch();
    window.addEventListener('pedagia:viewchange', patch);
    return () => window.removeEventListener('pedagia:viewchange', patch);
  }, [enabled]);

  return null;
}

declare global {
  interface Window {
    goTo?: (view: string) => void;
  }
}
