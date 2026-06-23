'use client';

import { FlowHeaderManager } from '@/components/flow-builder/FlowHeaderManager';
import { useFlowStore } from '@/store/useFlowStore';

export function HeaderPanel() {
  const activeHeaderId = useFlowStore((s) => s.activeHeaderId);

  return (
    <div className="flow-panel">
      <p className="flow-panel-lead">
        Escolha ou crie o cabeçalho da escola — tudo dentro do Builder, sem abrir outra tela.
      </p>

      <div className="flow-header-preview mb-6 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
        <span className="text-4xl">🏫</span>
        <p className="mt-3 text-[17px] font-bold text-white/70">
          {activeHeaderId ? 'Cabeçalho selecionado' : 'Nenhum cabeçalho selecionado'}
        </p>
      </div>

      <FlowHeaderManager />
    </div>
  );
}
