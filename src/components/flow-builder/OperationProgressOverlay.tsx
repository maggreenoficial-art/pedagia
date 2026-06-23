'use client';

import { useEffect, useState } from 'react';
import { PfIcon } from '@/lib/icons';
import {
  estimateEtaSeconds,
  useOperationProgressStore,
} from '@/store/useOperationProgressStore';

function formatClock(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}min ${s}s` : `${m}min`;
}

export function OperationProgressOverlay() {
  const progress = useOperationProgressStore((s) => s.progress);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!progress.active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [progress.active]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        active?: boolean;
        operation?: 'questions' | 'image';
        phase?: string;
        message?: string;
        current?: number;
        total?: number;
        percent?: number | null;
        startedAt?: number;
      };
      useOperationProgressStore.getState().applyEvent(detail);
    };
    window.addEventListener('pedagia:operation-progress', handler);
    return () => window.removeEventListener('pedagia:operation-progress', handler);
  }, []);

  if (!progress.active) return null;

  void tick;
  const elapsed = progress.startedAt ? Math.max(0, Math.round((Date.now() - progress.startedAt) / 1000)) : 0;
  const eta = estimateEtaSeconds(progress);
  const barPercent =
    progress.percent ??
    (progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : null);

  const title =
    progress.operation === 'image' ? 'Criando imagem com IA' : 'Gerando questões do material';

  return (
    <div className="flow-op-progress" role="status" aria-live="polite" aria-busy="true">
      <div className="flow-op-progress-inner">
        <div className="flow-op-progress-head">
          <span className="flow-op-progress-spinner" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="flow-op-progress-title">{title}</p>
            <p className="flow-op-progress-msg">{progress.message || 'Processando…'}</p>
          </div>
          <PfIcon
            name={progress.operation === 'image' ? 'visual' : 'output'}
            size={28}
            className="shrink-0 text-[var(--flow-accent)]"
          />
        </div>

        <div className="flow-op-progress-bar-wrap">
          <div
            className={`flow-op-progress-bar${barPercent == null ? ' flow-op-progress-bar--pulse' : ''}`}
            style={barPercent != null ? { width: `${Math.min(100, Math.max(4, barPercent))}%` } : undefined}
          />
        </div>

        <div className="flow-op-progress-meta">
          <span>Tempo: {formatClock(elapsed)}</span>
          {eta != null && <span>Estimativa: ~{formatClock(eta)} restantes</span>}
          {progress.total > 0 && (
            <span>
              {progress.current}/{progress.total}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
