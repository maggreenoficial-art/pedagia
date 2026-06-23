'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PfIcon } from '@/lib/icons';

declare global {
  interface Window {
    goTo?: (view: string) => void;
    rTab?: (tab: string) => void;
    exportarDocx?: () => void;
    exportarPdf?: () => void;
    exportarGabaritoHtml?: () => void;
    saveProvaManual?: () => void;
    onProvaTextEdit?: () => void;
    refreshExamPreview?: () => Promise<void>;
    scheduleExamPreview?: () => void;
  }
}

function isResultVisible(): boolean {
  const el = document.getElementById('view-result');
  if (!el) return false;
  return el.style.display !== 'none';
}

function readLegacyTextareas() {
  const prova = document.getElementById('prova-text') as HTMLTextAreaElement | null;
  const gab = document.getElementById('gab-text') as HTMLTextAreaElement | null;
  return {
    prova: prova?.value ?? '',
    gab: gab?.value ?? '',
  };
}

export function ResultHost({ enabled }: { enabled: boolean }) {
  const [show, setShow] = useState(false);
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);
  const [tab, setTab] = useState<'prova' | 'preview' | 'gab'>('prova');
  const [provaText, setProvaText] = useState('');
  const [gabText, setGabText] = useState('');
  const prepared = useRef(false);

  const refreshPreview = useCallback(() => {
    requestAnimationFrame(() => {
      if (tab === 'preview' || document.getElementById('exam-preview-iframe')) {
        void window.refreshExamPreview?.();
      } else {
        window.scheduleExamPreview?.();
      }
    });
  }, [tab]);

  const syncTextsFromDom = useCallback(() => {
    const { prova, gab } = readLegacyTextareas();
    if (prova) setProvaText(prova);
    if (gab) setGabText(gab);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const sync = () => {
      const visible = isResultVisible();
      setShow(visible);
      const el = document.getElementById('view-result');
      if (visible && el) {
        if (!prepared.current) {
          const saved = readLegacyTextareas();
          setProvaText(saved.prova);
          setGabText(saved.gab);
          el.innerHTML = '';
          el.classList.add('pf-result-react');
          prepared.current = true;
        } else {
          syncTextsFromDom();
        }
        setMountEl(el);
      }
    };

    sync();
    window.addEventListener('pedagia:viewchange', sync);
    const target = document.getElementById('view-result');
    const obs = target && new MutationObserver(sync);
    if (target && obs) obs.observe(target, { attributes: true, attributeFilter: ['style'] });

    return () => {
      window.removeEventListener('pedagia:viewchange', sync);
      obs?.disconnect();
    };
  }, [enabled, syncTextsFromDom]);

  useEffect(() => {
    if (!enabled) return;
    const onView = (ev: Event) => {
      const detail = (ev as CustomEvent<{ view?: string }>).detail;
      if (detail?.view !== 'result') return;
      syncTextsFromDom();
      setTab('preview');
      setTimeout(() => {
        void window.refreshExamPreview?.();
      }, 80);
    };
    window.addEventListener('pedagia:viewchange', onView);
    return () => window.removeEventListener('pedagia:viewchange', onView);
  }, [enabled, syncTextsFromDom]);

  useEffect(() => {
    if (!show || !mountEl) return;
    const pt = document.getElementById('prova-text') as HTMLTextAreaElement | null;
    const gt = document.getElementById('gab-text') as HTMLTextAreaElement | null;
    if (pt && provaText && pt.value !== provaText) pt.value = provaText;
    if (gt && gabText && gt.value !== gabText) gt.value = gabText;
    refreshPreview();
  }, [show, mountEl, provaText, gabText, refreshPreview]);

  const pickTab = (t: 'prova' | 'preview' | 'gab') => {
    setTab(t);
    if (t === 'preview') {
      setTimeout(() => void window.refreshExamPreview?.(), 0);
    }
  };

  if (!show || !mountEl) return null;

  return createPortal(
    <div className="pf-result-page">
      <div className="result-hdr">
        <button
          type="button"
          className="back-btn"
          onClick={() => window.goTo?.('home')}
          title="Voltar ao início"
          aria-label="Voltar ao início"
        >
          ←
        </button>
        <div className="result-title">Prova gerada</div>
        <div className="badge-saved" id="badge-saved">
          Salva
        </div>
      </div>

      <div className="rtabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'prova'}
          className={`rtab ${tab === 'prova' ? 'on' : ''}`}
          id="rtab-prova"
          onClick={() => pickTab('prova')}
        >
          Editar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'preview'}
          className={`rtab ${tab === 'preview' ? 'on' : ''}`}
          id="rtab-preview"
          onClick={() => pickTab('preview')}
        >
          Preview PDF
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'gab'}
          className={`rtab ${tab === 'gab' ? 'on' : ''}`}
          id="rtab-gab"
          onClick={() => pickTab('gab')}
        >
          Gabarito
        </button>
      </div>

      <textarea
        className="result-area"
        id="prova-text"
        spellCheck={false}
        value={provaText}
        onChange={(e) => {
          setProvaText(e.target.value);
          window.onProvaTextEdit?.();
        }}
        style={{ display: tab === 'prova' ? undefined : 'none' }}
      />

      <div
        id="exam-preview-panel"
        className={`exam-preview-panel ${tab === 'preview' ? 'show' : ''}`}
        style={{ display: tab === 'preview' ? undefined : 'none' }}
      >
        <div className="exam-preview-hdr">
          <span style={{ fontSize: 11, color: 'var(--t2)' }}>
            Visualização igual ao PDF final (com imagens)
          </span>
          <span id="preview-status" className="exam-preview-status" />
        </div>
        <iframe id="exam-preview-iframe" className="exam-preview-frame" title="Preview da prova" />
      </div>

      <textarea
        className="result-area"
        id="gab-text"
        spellCheck={false}
        value={gabText}
        onChange={(e) => setGabText(e.target.value)}
        style={{ display: tab === 'gab' ? undefined : 'none' }}
      />

      <div className="exp-row">
        <button type="button" className="exp-btn primary" onClick={() => window.exportarDocx?.()}>
          <PfIcon name="prova" size={18} /> Word
        </button>
        <button type="button" className="exp-btn" onClick={() => window.exportarPdf?.()}>
          PDF
        </button>
        <button type="button" className="exp-btn" onClick={() => window.exportarGabaritoHtml?.()}>
          Gabarito
        </button>
        <button type="button" className="exp-btn" id="btn-save-prova" onClick={() => window.saveProvaManual?.()}>
          Salvar
        </button>
      </div>
      <p className="exp-hint">
        Edite em <b>Editar</b> — o <b>Preview PDF</b> atualiza com as imagens. Exporte Word ou PDF quando
        estiver pronto.
      </p>
    </div>,
    mountEl,
  );
}
