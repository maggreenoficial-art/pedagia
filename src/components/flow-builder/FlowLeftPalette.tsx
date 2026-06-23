'use client';

import { FLOW_DND_MIME, NODE_PALETTE } from '@/components/flow-builder/palette-config';
import type { FlowNodeKind } from '@/components/flow-builder/flow-types';
import { useIsMobile } from '@/components/flow-builder/useIsMobile';
import { PfIcon } from '@/lib/icons';
import { useFlowStore } from '@/store/useFlowStore';

export function FlowLeftPalette() {
  const isMobile = useIsMobile();
  const setActiveNodeId = useFlowStore((s) => s.setActiveNodeId);
  const activeNodeId = useFlowStore((s) => s.activeNodeId);
  const nodes = useFlowStore((s) => s.nodes);

  const openStep = (kind: FlowNodeKind) => {
    const existing = [...nodes].reverse().find((n) => n.data.kind === kind);
    if (existing) setActiveNodeId(existing.id);
  };

  return (
    <aside
      className={`flow-palette flex shrink-0 flex-col border-white/10 bg-[var(--flow-surface)] p-5 md:w-[280px] md:border-r ${isMobile ? 'flow-palette--mobile' : ''}`}
      aria-label="Etapas do fluxo"
    >
      <p className="flow-palette-label mb-3 text-[13px] font-extrabold uppercase tracking-widest text-white/40 md:mb-4">
        {isMobile ? 'Etapas — toque para abrir' : 'Etapas'}
      </p>

      <ul className="flow-palette-list flex flex-col gap-3">
        {NODE_PALETTE.map((item) => {
          const active = nodes.some((n) => n.id === activeNodeId && n.data.kind === item.kind);
          const draggable = item.draggable !== false && !isMobile;
          return (
            <li key={item.kind} className="flow-palette-item">
              <button
                type="button"
                draggable={draggable}
                onDragStart={(e) => {
                  if (!draggable) return;
                  e.dataTransfer.setData(FLOW_DND_MIME, item.kind);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => openStep(item.kind)}
                className={`flow-palette-btn flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors md:items-start ${
                  isMobile ? 'cursor-pointer active:scale-[0.98]' : 'cursor-grab active:cursor-grabbing'
                } ${
                  active
                    ? 'border-[var(--flow-accent)]/45 bg-[var(--flow-accent-soft)]'
                    : 'border-white/8 bg-[var(--flow-surface-2)] hover:border-[var(--flow-accent)]/30'
                }`}
              >
                <span className="flow-palette-icon flex shrink-0 items-center justify-center text-[var(--flow-accent)]">
                  <PfIcon name={item.icon} size={22} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-extrabold text-white">{item.label}</span>
                  <span className="flow-palette-hint block text-[13px] leading-snug text-white/45">
                    {item.hint}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {!isMobile && (
        <p className="mt-auto pt-8 text-[14px] leading-relaxed text-white/35">
          Clique em um bloco no fluxo para abrir a caixa de trabalho. Arraste para adicionar mais
          etapas.
        </p>
      )}
    </aside>
  );
}
