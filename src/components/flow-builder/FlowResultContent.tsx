'use client';

import { useCallback, useEffect, useState } from 'react';
import { FlowBtnAccent, FlowBtnPrimary, FlowBtnSecondary, flowTextareaCls } from '@/components/flow-builder/flow-ui';
import { PfIcon } from '@/lib/icons';

declare global {
  interface Window {
    refreshExamPreview?: () => Promise<void>;
    exportarDocx?: () => void;
    exportarPdf?: () => void;
    exportarGabaritoHtml?: () => void;
    saveProvaManual?: () => void;
    onProvaTextEdit?: () => void;
  }
}

type ResultTab = 'visual' | 'texto' | 'formato';

export function FlowResultContent({
  active,
  onDone,
}: {
  active: boolean;
  /** Fechar sheet ou modal */
  onDone?: () => void;
}) {
  const [tab, setTab] = useState<ResultTab>('visual');
  const [provaText, setProvaText] = useState('');
  const [gabText, setGabText] = useState('');
  const [pageSize, setPageSize] = useState<'a4' | 'letter'>('a4');
  const [marginMm, setMarginMm] = useState(18);

  const syncFromDom = useCallback(() => {
    const pt = document.getElementById('prova-text') as HTMLTextAreaElement | null;
    const gt = document.getElementById('gab-text') as HTMLTextAreaElement | null;
    if (pt?.value) setProvaText(pt.value);
    if (gt?.value) setGabText(gt.value);
  }, []);

  useEffect(() => {
    if (!active) return;
    syncFromDom();
    setTab('visual');
    const t = setTimeout(() => void window.refreshExamPreview?.(), 80);
    return () => clearTimeout(t);
  }, [active, syncFromDom]);

  const applyText = (field: 'prova' | 'gab', value: string) => {
    const id = field === 'prova' ? 'prova-text' : 'gab-text';
    const el = document.getElementById(id) as HTMLTextAreaElement | null;
    if (el) el.value = value;
    window.onProvaTextEdit?.();
    if (tab === 'visual') void window.refreshExamPreview?.();
  };

  const printPreview = () => {
    const iframe = document.getElementById('flow-inline-preview-iframe') as HTMLIFrameElement | null;
    iframe?.contentWindow?.print();
  };

  if (!active) return null;

  return (
    <div className="flow-result-panel">
      <div className="flow-result-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={tab === 'visual' ? 'on' : ''}
          onClick={() => {
            setTab('visual');
            void window.refreshExamPreview?.();
          }}
        >
          <PfIcon name="prova" size={16} /> Visual fiel
        </button>
        <button type="button" role="tab" className={tab === 'texto' ? 'on' : ''} onClick={() => setTab('texto')}>
          <PfIcon name="config" size={16} /> Texto
        </button>
        <button type="button" role="tab" className={tab === 'formato' ? 'on' : ''} onClick={() => setTab('formato')}>
          <PfIcon name="header" size={16} /> Formato da folha
        </button>
      </div>

      <div className="flow-result-sheet-body flow-result-sheet-body--panel">
        {tab === 'visual' && (
          <div className="flow-result-visual">
            <div className="flow-result-visual-toolbar">
              <span className="text-[13px] text-white/50">Preview igual ao PDF final (com imagens)</span>
              <span id="flow-inline-preview-status" className="exam-preview-status" />
            </div>
            <iframe
              id="flow-inline-preview-iframe"
              className="flow-result-preview-frame"
              title="Preview fiel da prova"
            />
            <p className="flow-result-hint">
              Use a aba <strong>Texto</strong> para ajustar enunciados; o preview atualiza automaticamente.
            </p>
          </div>
        )}

        {tab === 'texto' && (
          <div className="flow-result-text-grid">
            <label className="block">
              <span className="flow-field-label mb-2 block">Prova</span>
              <textarea
                className={`${flowTextareaCls} flow-result-textarea`}
                value={provaText}
                onChange={(e) => {
                  setProvaText(e.target.value);
                  applyText('prova', e.target.value);
                }}
                spellCheck={false}
              />
            </label>
            <label className="block">
              <span className="flow-field-label mb-2 block">Gabarito</span>
              <textarea
                className={`${flowTextareaCls} flow-result-textarea flow-result-textarea--sm`}
                value={gabText}
                onChange={(e) => {
                  setGabText(e.target.value);
                  applyText('gab', e.target.value);
                }}
                spellCheck={false}
              />
            </label>
          </div>
        )}

        {tab === 'formato' && (
          <div className="flow-result-format">
            <p className="flow-panel-lead mb-4">
              Ajustes básicos de página para impressão e exportação PDF.
            </p>
            <label className="field mb-4 block">
              <span className="flow-field-label mb-2 block">Tamanho da folha</span>
              <select
                className="flow-select w-full"
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as 'a4' | 'letter')}
              >
                <option value="a4">A4 (padrão Brasil)</option>
                <option value="letter">Carta (Letter)</option>
              </select>
            </label>
            <label className="field mb-4 block">
              <span className="flow-field-label mb-2 block">Margem (mm)</span>
              <input
                type="number"
                min={10}
                max={30}
                className="flow-input w-full"
                value={marginMm}
                onChange={(e) => setMarginMm(parseInt(e.target.value, 10) || 18)}
              />
            </label>
            <p className="text-[14px] text-white/45">
              Edição de imagens embutidas e layout avançado chegam na próxima versão. Por ora, troque figuras no
              passo Fonte / Figuras e regenere.
            </p>
          </div>
        )}
      </div>

      <footer className="flow-result-sheet-footer flow-result-sheet-footer--panel">
        <FlowBtnSecondary onClick={printPreview}>Imprimir</FlowBtnSecondary>
        <FlowBtnSecondary onClick={() => window.exportarPdf?.()}>PDF</FlowBtnSecondary>
        <FlowBtnSecondary onClick={() => window.exportarDocx?.()}>Word</FlowBtnSecondary>
        <FlowBtnAccent onClick={() => void window.saveProvaManual?.()}>Salvar</FlowBtnAccent>
        {onDone && <FlowBtnPrimary onClick={onDone}>Continuar no fluxo</FlowBtnPrimary>}
      </footer>
    </div>
  );
}
