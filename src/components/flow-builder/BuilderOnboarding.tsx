'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'pf-builder-onboarding-v1';

export function BuilderOnboarding() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return;
      setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div className="flow-onboarding" role="region" aria-label="Como usar o Montar">
      <div className="flow-onboarding-inner">
        <p className="flow-onboarding-kicker">Primeira vez aqui?</p>
        <p className="flow-onboarding-text">
          Siga as etapas: <strong>1. Dados</strong> → <strong>2. Fonte</strong> →{' '}
          <strong>3. Cabeçalho</strong> → <strong>4. Figuras</strong> → <strong>5. Gerar</strong>.
          Toque em cada bloco ou use a barra de etapas embaixo.
        </p>
        <button type="button" className="flow-onboarding-btn" onClick={dismiss}>
          Entendi
        </button>
      </div>
    </div>
  );
}
