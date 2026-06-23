'use client';

import { FlowResultContent } from '@/components/flow-builder/FlowResultContent';
import { useFlowStore } from '@/store/useFlowStore';

export function ResultPanel() {
  const resultReady = useFlowStore((s) => s.resultReady);
  const setActiveNodeId = useFlowStore((s) => s.setActiveNodeId);

  if (!resultReady) {
    return (
      <div className="flow-panel">
        <p className="flow-panel-lead">
          O material montado aparecerá aqui depois que você clicar em <strong>Montar material</strong> no passo
          anterior (Gerar e montar).
        </p>
        <p className="text-[14px] text-white/45">
          Revise e aprove as questões no pool antes de montar.
        </p>
      </div>
    );
  }

  return (
    <div className="flow-panel flow-panel--result">
      <p className="flow-panel-lead mb-4">
        Material pronto para revisão, impressão e exportação. Ajuste o texto se precisar e salve na sua biblioteca.
      </p>
      <FlowResultContent active={resultReady} onDone={() => setActiveNodeId(null)} />
    </div>
  );
}
