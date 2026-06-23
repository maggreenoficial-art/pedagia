'use client';

import { useCallback, useEffect, useState } from 'react';
import { BRAND_LOGO_FALLBACK, BRAND_LOGO_SRC } from '@/lib/brand';
import { useIsMobile } from '@/components/flow-builder/useIsMobile';
import { NODE_PALETTE, PRODUCTION_TYPES } from '@/components/flow-builder/palette-config';
import { useFlowStore } from '@/store/useFlowStore';
import { AppBackButton } from '@/components/nav/AppBackButton';
import { Check, Pencil, Save } from 'lucide-react';

function formatSavedAt(ts: number | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function FlowTopBar() {
  const isMobile = useIsMobile();
  const bookFileName = useFlowStore((s) => s.bookFileName);
  const flowTitle = useFlowStore((s) => s.flowTitle);
  const flowSavedAt = useFlowStore((s) => s.flowSavedAt);
  const flowSaving = useFlowStore((s) => s.flowSaving);
  const setFlowTitle = useFlowStore((s) => s.setFlowTitle);
  const saveFlow = useFlowStore((s) => s.saveFlow);
  const exam = useFlowStore((s) => s.exam);
  const poolLen = useFlowStore((s) => s.builderPool.length);
  const confirmed = useFlowStore((s) => s.builderPagesConfirmed);
  const confirmedNodeIds = useFlowStore((s) => s.confirmedNodeIds);
  const resultReady = useFlowStore((s) => s.resultReady);
  const nodes = useFlowStore((s) => s.nodes);
  const prodLabel =
    PRODUCTION_TYPES.find((p) => p.id === exam.productionKind)?.label || exam.tipo;

  const displayTitle = flowTitle.trim() || bookFileName || `Nova ${prodLabel.toLowerCase()}`;
  const subtitle =
    exam.disciplina && exam.serie
      ? `${prodLabel} · ${exam.disciplina} · ${exam.serie}`
      : bookFileName && flowTitle.trim()
        ? bookFileName
        : null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayTitle);

  useEffect(() => {
    if (!editing) setDraft(displayTitle);
  }, [displayTitle, editing]);

  useEffect(() => {
    const onSaved = (e: Event) => {
      const savedAt = (e as CustomEvent).detail?.savedAt as number | undefined;
      if (savedAt) useFlowStore.setState({ flowSavedAt: savedAt });
    };
    window.addEventListener('pedagia:flow-saved', onSaved);
    return () => window.removeEventListener('pedagia:flow-saved', onSaved);
  }, []);

  const stepDone = (kind: (typeof NODE_PALETTE)[number]['kind']) => {
    const node = nodes.find((n) => n.data.kind === kind);
    if (kind === 'result') return resultReady || (node ? confirmedNodeIds.includes(node.id) : false);
    return node ? confirmedNodeIds.includes(node.id) : false;
  };

  const doneSteps = NODE_PALETTE.filter((item) => stepDone(item.kind)).length;
  const savedLabel = formatSavedAt(flowSavedAt);

  const commitTitle = useCallback(() => {
    setFlowTitle(draft.trim());
    setEditing(false);
  }, [draft, setFlowTitle]);

  return (
    <header
      className={`flow-topbar flex shrink-0 flex-col border-b border-[var(--flow-border)] px-3 py-1.5 md:gap-3 md:px-6 md:py-4`}
    >
      <div className={`flex w-full items-center gap-3 ${isMobile ? '' : 'justify-between gap-4'}`}>
        <AppBackButton label={isMobile ? 'Início' : 'Menu principal'} className="flow-topbar-back shrink-0" />

        <div className={`flex min-w-0 flex-1 items-center gap-3 ${isMobile ? '' : 'gap-4'}`}>
          <img
            src={BRAND_LOGO_SRC}
            alt="Professor Flux"
            className={`flow-topbar-logo shrink-0 object-contain ${isMobile ? 'h-9 w-9' : 'h-11 md:h-12'}`}
            width={isMobile ? 36 : 72}
            height={isMobile ? 36 : 72}
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.src.includes(BRAND_LOGO_FALLBACK)) img.src = BRAND_LOGO_FALLBACK;
            }}
          />
          <div className={`min-w-0 flex-1 ${isMobile ? '' : 'border-l border-white/10 pl-4'}`}>
            {!isMobile && (
              <p className="font-[family-name:var(--f-display)] text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--flow-accent)]">
                Professor Flux · Builder
              </p>
            )}
            <div className="flow-topbar-title-row">
              {editing ? (
                <input
                  className="flow-topbar-title-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTitle();
                    if (e.key === 'Escape') setEditing(false);
                  }}
                  autoFocus
                  aria-label="Nome do fluxo"
                />
              ) : (
                <h1 className="flow-topbar-title truncate">{displayTitle}</h1>
              )}
              <button
                type="button"
                className="flow-topbar-icon-btn"
                onClick={() => (editing ? commitTitle() : setEditing(true))}
                aria-label={editing ? 'Confirmar nome' : 'Editar nome do fluxo'}
              >
                {editing ? <Check size={18} /> : <Pencil size={16} />}
              </button>
              <button
                type="button"
                className="flow-topbar-save-btn"
                disabled={flowSaving}
                onClick={() => void saveFlow()}
                title="Salvar fluxo para continuar depois"
              >
                <Save size={16} aria-hidden />
                <span>{flowSaving ? 'Salvando…' : 'Salvar fluxo'}</span>
              </button>
            </div>
            {!isMobile && subtitle && (
              <p className="truncate text-[14px] text-white/50">{subtitle}</p>
            )}
            {savedLabel && (
              <p className="flow-topbar-saved-hint">Salvo em {savedLabel}</p>
            )}
          </div>
        </div>

        <div className={`flex shrink-0 ${isMobile ? 'flex-col items-end gap-1' : 'gap-2 md:gap-3'}`}>
          <span
            className={`inline-flex items-center gap-1 rounded-full border font-bold ${
              isMobile
                ? 'border-white/10 bg-[var(--flow-surface-2)] px-2 py-0.5 text-[10px] text-white/75'
                : 'border-white/10 bg-[var(--flow-surface-2)] px-3 py-1.5 text-[12px] text-white/75 md:px-4 md:py-2 md:text-[14px]'
            }`}
          >
            {confirmed ? (
              <>
                <Check size={12} aria-hidden /> OK
              </>
            ) : (
              'Pend.'
            )}
          </span>
          <span
            className={`rounded-full border border-[var(--flow-accent)]/35 bg-[var(--flow-accent-soft)] font-bold text-[var(--flow-accent)] ${
              isMobile ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1.5 text-[12px] md:px-4 md:py-2 md:text-[14px]'
            }`}
            title="Itens no pool"
          >
            {poolLen} itens
          </span>
        </div>
      </div>

      <div
        className={`flow-step-progress flex w-full items-center gap-1 ${isMobile ? 'flow-step-progress--compact' : ''}`}
        role="progressbar"
        aria-valuenow={doneSteps}
        aria-valuemin={0}
        aria-valuemax={NODE_PALETTE.length}
        aria-label={`${doneSteps} de ${NODE_PALETTE.length} etapas confirmadas`}
      >
        {NODE_PALETTE.map((item, i) => {
          const done = stepDone(item.kind);
          return (
            <div key={item.kind} className="flow-step-progress-item flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className={`flow-step-dot h-1.5 w-full rounded-full ${done ? 'flow-step-dot--done' : 'flow-step-dot--idle'}`}
              />
              {!isMobile && (
                <span className={`truncate text-[10px] font-bold ${done ? 'text-[var(--flow-accent)]' : 'text-white/35'}`}>
                  {i + 1}. {item.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </header>
  );
}

declare global {
  interface Window {
    goTo?: (view: string) => void;
  }
}
