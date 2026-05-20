'use client';

import { useEffect, useRef, useState } from 'react';
import { LEGACY_MARKUP } from '@/components/legacy/markup';
import { bootPedagiaLegacy } from '@/lib/legacy/runtime';
import { PedagiaCore } from '@/lib/pedagia-core';
import type { PedagiaCoreApi } from '@/lib/pedagia-core';

declare global {
  interface Window {
    pdfjsLib?: { GlobalWorkerOptions: { workerSrc: string } };
    PedagiaCore?: PedagiaCoreApi;
    closeImageNameModal?: () => void;
    confirmImageCatalogEntry?: () => void;
    openCropBuilder?: (pageNum: number) => void;
    closeCropBuilder?: () => void;
    confirmCropSelection?: () => void;
    resetCropSelection?: () => void;
  }
}

export default function PedagiaShell() {
  const booted = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    const w = window as unknown as Record<string, { GlobalWorkerOptions: { workerSrc: string } }>;
    const pdfjsLib = w['pdfjs-dist/build/pdf'] || w.pdfjsLib;
    if (pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    window.PedagiaCore = PedagiaCore;

    bootPedagiaLegacy()
      .then(() => setReady(true))
      .catch((err) => {
        console.error('PedagIA boot:', err);
        setReady(true);
      });

    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      } else {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister());
        });
      }
    }
  }, []);

  return (
    <>
      {!ready && (
        <div
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fff',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontWeight: 700,
            fontSize: 15,
            color: '#111',
          }}
        >
          Carregando PedagIA…
        </div>
      )}
      <div id="pedagia-root" dangerouslySetInnerHTML={{ __html: LEGACY_MARKUP }} />
      <div id="toast" className="toast" aria-live="polite" />
      <div id="img-name-modal" className="img-modal" style={{ display: 'none' }} aria-hidden>
        <div
          className="img-modal-back"
          role="presentation"
          onClick={() => window.closeImageNameModal?.()}
        />
        <div className="img-modal-box">
          <div className="sl" style={{ marginBottom: 8 }}>Nomear imagem</div>
          <img id="img-modal-preview" alt="" />
          <div className="field" style={{ marginBottom: 10 }}>
            <label className="fl" htmlFor="img-modal-title">Nome (para identificar na prova)</label>
            <input type="text" id="img-modal-title" placeholder="Ex: Gráfico — desmatamento Amazônia" />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label className="fl" htmlFor="img-modal-source">Fonte (como no livro — não invente)</label>
            <textarea id="img-modal-source" rows={3} placeholder="Fonte: IBGE, 2022. Adaptado." />
          </div>
          <p id="img-modal-desc" style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 12, lineHeight: 1.4 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-ir" style={{ flex: 1 }} onClick={() => window.confirmImageCatalogEntry?.()}>
              Salvar na nuvem
            </button>
            <button
              type="button"
              className="btn-ir"
              style={{ background: 'var(--s3)', color: 'var(--t2)' }}
              onClick={() => window.closeImageNameModal?.()}
            >
              Depois
            </button>
          </div>
        </div>
      </div>
      <div id="img-crop-modal" className="img-modal crop-modal" style={{ display: 'none' }} aria-hidden>
        <div className="img-modal-back" role="presentation" onClick={() => window.closeCropBuilder?.()} />
        <div className="img-modal-box crop-modal-box">
          <div className="sl" style={{ marginBottom: 6 }}>
            Recortar figura — página <span id="crop-page-num">?</span>
          </div>
          <p className="crop-modal-hint">
            Arraste na página para selecionar o mapa, gráfico, tabela ou foto. Inclua a faixa de título e o bloco
            Fonte, se estiverem na figura.
          </p>
          <div id="crop-stage-wrap" className="crop-stage-wrap">
            <canvas id="crop-canvas" />
          </div>
          <div className="crop-modal-actions">
            <button type="button" className="btn-ir" style={{ flex: 1 }} onClick={() => window.confirmCropSelection?.()}>
              Usar este recorte
            </button>
            <button
              type="button"
              className="btn-ir crop-btn-secondary"
              onClick={() => window.resetCropSelection?.()}
            >
              Limpar
            </button>
            <button
              type="button"
              className="btn-ir crop-btn-secondary"
              onClick={() => window.closeCropBuilder?.()}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
