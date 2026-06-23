'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LEGACY_MARKUP } from '@/components/legacy/markup';
import { MontarFlowHost } from '@/components/flow-builder/MontarFlowHost';
import { BRAND_LOGO_FALLBACK, BRAND_LOGO_SRC } from '@/lib/brand';
import { HomeHost } from '@/components/home/HomeHost';
import { AuthHost } from '@/components/auth/AuthHost';
import { ResultHost } from '@/components/result/ResultHost';
import { LoadingHost } from '@/components/loading/LoadingHost';
import { FluxosHost } from '@/components/fluxos/FluxosHost';
import { LegacyNavPatch } from '@/components/nav/LegacyNavPatch';
import { bootPedagiaLegacy, reconcilePedagiaSessionUi } from '@/lib/legacy/runtime';
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

let legacyBootStarted = false;

export default function PedagiaShell() {
  const [ready, setReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const markupInjected = useRef(false);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || markupInjected.current) return;
    el.innerHTML = LEGACY_MARKUP;
    markupInjected.current = true;
  }, []);

  useEffect(() => {
    if (legacyBootStarted) return;
    legacyBootStarted = true;

    const w = window as unknown as Record<string, { GlobalWorkerOptions: { workerSrc: string } }>;
    const pdfjsLib = w['pdfjs-dist/build/pdf'] || w.pdfjsLib;
    if (pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    window.PedagiaCore = PedagiaCore;

    const finishBoot = () => {
      reconcilePedagiaSessionUi();
      setReady(true);
    };

    bootPedagiaLegacy()
      .then(finishBoot)
      .catch((err) => {
        console.error('PedagIA boot:', err);
        finishBoot();
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

  useEffect(() => {
    if (!ready) return;
    reconcilePedagiaSessionUi();
  }, [ready]);

  return (
    <>
      {!ready && (
        <div
          aria-live="polite"
          className="pf-splash"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0A0A0A',
          }}
        >
          <img
            src={BRAND_LOGO_SRC}
            alt=""
            className="pf-splash-logo"
            width={120}
            height={75}
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              if (!img.src.includes(BRAND_LOGO_FALLBACK)) img.src = BRAND_LOGO_FALLBACK;
            }}
          />
          <p className="pf-splash-title">Professor Flux</p>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Carregando…</p>
        </div>
      )}
      <div id="pedagia-root" ref={rootRef} />
      {ready && <MontarFlowHost enabled={ready} />}
      {ready && <HomeHost enabled={ready} />}
      {ready && <AuthHost enabled={ready} />}
      {ready && <ResultHost enabled={ready} />}
      {ready && <LoadingHost enabled={ready} />}
      {ready && <FluxosHost enabled={ready} />}
      {ready && <LegacyNavPatch enabled={ready} />}
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
