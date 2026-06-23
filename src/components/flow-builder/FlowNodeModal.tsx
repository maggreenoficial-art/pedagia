'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PfIcon } from '@/lib/icons';
import { paletteMeta } from '@/components/flow-builder/palette-config';
import { ConfigPanel } from '@/components/flow-builder/panels/ConfigPanel';
import { HeaderPanel } from '@/components/flow-builder/panels/HeaderPanel';
import { MaterialPanel } from '@/components/flow-builder/panels/MaterialPanel';
import { MediaPanel } from '@/components/flow-builder/panels/MediaPanel';
import { OutputPanel } from '@/components/flow-builder/panels/OutputPanel';
import { ResultPanel } from '@/components/flow-builder/panels/ResultPanel';
import type { FlowNodeKind } from '@/components/flow-builder/flow-types';
import { useFlowStore } from '@/store/useFlowStore';

function PanelForKind({ kind }: { kind: FlowNodeKind }) {
  switch (kind) {
    case 'config':
      return <ConfigPanel />;
    case 'material':
      return <MaterialPanel />;
    case 'headerEnrich':
      return <HeaderPanel />;
    case 'aiProcess':
      return <MediaPanel />;
    case 'output':
      return <OutputPanel />;
    case 'result':
      return <ResultPanel />;
    default:
      return null;
  }
}

export function FlowNodeModal() {
  const activeNodeId = useFlowStore((s) => s.activeNodeId);
  const nodes = useFlowStore((s) => s.nodes);
  const setActiveNodeId = useFlowStore((s) => s.setActiveNodeId);
  const confirmedNodeIds = useFlowStore((s) => s.confirmedNodeIds);
  const [mounted, setMounted] = useState(false);

  const activeNode = nodes.find((n) => n.id === activeNodeId);
  const kind = activeNode?.data?.kind as FlowNodeKind | undefined;
  const meta = kind ? paletteMeta(kind) : null;
  const stepConfirmed = activeNodeId ? confirmedNodeIds.includes(activeNodeId) : false;

  const close = useCallback(() => setActiveNodeId(null), [setActiveNodeId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!activeNodeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [activeNodeId, close]);

  if (!mounted || !activeNode || !kind || !meta) return null;

  return createPortal(
    <div
      className="flow-modal-backdrop flow-modal-backdrop--portal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="flow-modal-title"
      onClick={close}
    >
      <div className="flow-modal-box" onClick={(e) => e.stopPropagation()}>
        <header className="flow-modal-header">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flow-modal-icon" aria-hidden>
              {meta.icon ? <PfIcon name={meta.icon} size={28} /> : null}
            </span>
            <div className="min-w-0">
              <p className="flow-modal-kicker">{meta.hint}</p>
              <h2 id="flow-modal-title" className="flow-modal-title">
                {meta.label}
              </h2>
              {activeNode.data.summary && (
                <p className="flow-modal-summary">{activeNode.data.summary}</p>
              )}
            </div>
          </div>
          <button type="button" className="flow-modal-close" onClick={close} aria-label="Fechar">
            ✕
          </button>
        </header>

        {stepConfirmed && (
          <div className="flow-modal-confirmed">
            ✓ Etapa confirmada — você pode revisar a qualquer momento.
          </div>
        )}

        <div className="flow-modal-body">
          <PanelForKind kind={kind} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
