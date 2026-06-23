import { create } from 'zustand';

export type OperationKind = 'questions' | 'image';

export type OperationProgressState = {
  active: boolean;
  operation: OperationKind | null;
  phase: string;
  message: string;
  current: number;
  total: number;
  percent: number | null;
  startedAt: number;
};

const IDLE: OperationProgressState = {
  active: false,
  operation: null,
  phase: '',
  message: '',
  current: 0,
  total: 0,
  percent: null,
  startedAt: 0,
};

export function estimateEtaSeconds(state: OperationProgressState): number | null {
  if (!state.active || !state.startedAt) return null;
  const elapsed = (Date.now() - state.startedAt) / 1000;
  if (state.percent != null && state.percent > 2 && state.percent < 98) {
    return Math.max(1, Math.round((elapsed / state.percent) * (100 - state.percent)));
  }
  if (state.total > 0 && state.current > 0 && state.current < state.total) {
    const perUnit = elapsed / state.current;
    return Math.max(1, Math.round(perUnit * (state.total - state.current)));
  }
  return null;
}

export const useOperationProgressStore = create<{
  progress: OperationProgressState;
  applyEvent: (detail: Partial<OperationProgressState> & { active?: boolean }) => void;
  clear: () => void;
}>((set) => ({
  progress: IDLE,
  applyEvent: (detail) => {
    if (detail.active === false) {
      set({ progress: IDLE });
      return;
    }
    set((s) => ({
      progress: {
        ...s.progress,
        active: true,
        operation: detail.operation ?? s.progress.operation,
        phase: detail.phase ?? s.progress.phase,
        message: detail.message ?? s.progress.message,
        current: detail.current ?? s.progress.current,
        total: detail.total ?? s.progress.total,
        percent: detail.percent !== undefined ? detail.percent : s.progress.percent,
        startedAt: detail.startedAt ?? (s.progress.startedAt || Date.now()),
      },
    }));
  },
  clear: () => set({ progress: IDLE }),
}));
