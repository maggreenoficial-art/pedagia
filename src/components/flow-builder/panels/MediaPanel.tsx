'use client';

import { FigurePicker } from '@/components/flow-builder/FigurePicker';
import { FlowImageGen } from '@/components/flow-builder/FlowImageGen';
import { FlowBtnPrimary } from '@/components/flow-builder/flow-ui';
import { useLegacySync } from '@/components/flow-builder/useLegacySync';
import { useRunLegacy } from '@/components/flow-builder/useRunLegacy';
import { legacyToast } from '@/lib/legacy/bridge';
import { useFlowStore } from '@/store/useFlowStore';

export function MediaPanel() {
  const confirmed = useFlowStore((s) => s.builderPagesConfirmed);
  const selectedFigures = useFlowStore((s) => s.selectedFigures);
  const confirmActiveNodeStep = useFlowStore((s) => s.confirmActiveNodeStep);
  const { busy } = useRunLegacy();

  useLegacySync(true, 2000);

  const handleConfirm = () => {
    const result = confirmActiveNodeStep();
    if (!result.ok) {
      legacyToast(result.error, 'err');
      return;
    }
    legacyToast(
      selectedFigures.length
        ? `${selectedFigures.length} figura(s) pronta(s) para o passo Gerar.`
        : 'Etapa confirmada (sem figuras).',
      'ok',
    );
  };

  return (
    <div className="flow-panel">
      <p className="flow-panel-lead">
        Selecione as figuras, gráficos ou mapas que a IA deve usar. Os exercícios serão gerados
        automaticamente no passo <strong>Gerar e montar</strong> — você só revisa e aprova lá.
      </p>

      {!confirmed && (
        <div className="flow-status-warn mb-5">
          Confirme o material (passo Fonte) antes de selecionar figuras do PDF.
        </div>
      )}

      <FigurePicker />
      <FlowImageGen />

      <div className="mt-6">
        <FlowBtnPrimary disabled={busy} onClick={handleConfirm}>
          ✓ Confirmar figuras selecionadas ({selectedFigures.length})
        </FlowBtnPrimary>
      </div>
    </div>
  );
}
