'use client';

import { useState } from 'react';
import { FlowBtnAccent, FlowBtnPrimary } from '@/components/flow-builder/flow-ui';
import { LegacyEmbed } from '@/components/flow-builder/LegacyEmbed';

import { useLegacySync } from '@/components/flow-builder/useLegacySync';

import { useRunLegacy } from '@/components/flow-builder/useRunLegacy';

import {

  legacyGenerateQuestions,

  legacyMontarProva,

  legacySetInlineResult,

  legacySetPoolTab,

} from '@/lib/legacy/bridge';

import { useFlowStore } from '@/store/useFlowStore';
import { useOperationProgressStore } from '@/store/useOperationProgressStore';



export function OutputPanel() {

  const confirmed = useFlowStore((s) => s.builderPagesConfirmed);

  const builderPool = useFlowStore((s) => s.builderPool);

  const selectedFigures = useFlowStore((s) => s.selectedFigures);

  const exam = useFlowStore((s) => s.exam);

  const { busy, runLegacy } = useRunLegacy();
  const [generating, setGenerating] = useState(false);
  const opProgress = useOperationProgressStore((s) => s.progress);
  const isGenerating =
    generating || busy || (opProgress.active && opProgress.operation === 'questions');



  useLegacySync(true, 2000);



  const approved = builderPool.filter((q) => q.reviewStatus === 'approved').length;

  const figLabel = selectedFigures.length ? ` + ${selectedFigures.length} figura(s)` : '';



  const handleGenerate = () => {

    if (generating || busy) return;

    setGenerating(true);

    void runLegacy(async () => {

      await legacyGenerateQuestions();

    }).finally(() => {

      setGenerating(false);

    });

  };



  const handleMontar = (variant: 'turma' | 'adaptada') => {

    void runLegacy(async () => {

      legacySetInlineResult(true);

      await legacyMontarProva(variant);

    });

  };



  return (

    <div className="flow-panel">

      <p className="flow-panel-lead">

        A IA gera questões do material{figLabel}. Revise, aprove ou rejeite — depois monte o material. O

        resultado aparecerá no bloco <strong>Resultado</strong>, logo após este passo.

      </p>



      <div className="mb-5 flex flex-wrap gap-3">

        <span className="flow-pill">{builderPool.length} sugestões</span>

        <span className="flow-pill flow-pill-accent">{approved} aprovada(s)</span>

        {selectedFigures.length > 0 && (

          <span className="flow-pill">{selectedFigures.length} figura(s) na fila</span>

        )}

      </div>



      <div className="mb-5 flex flex-col gap-3">

        <FlowBtnPrimary disabled={isGenerating || !confirmed} onClick={handleGenerate}>

          {isGenerating
            ? opProgress.message || 'Gerando questões…'
            : `Gerar questões do material${figLabel} (${exam.numQ})`}

        </FlowBtnPrimary>



        {exam.wantAdapted && (

          <div className="flex gap-2">

            <button

              type="button"

              className="flow-chip-btn flex-1"

              onClick={() => runLegacy(async () => legacySetPoolTab('turma'))}

            >

              Ver turma

            </button>

            <button

              type="button"

              className="flow-chip-btn flow-chip-btn-accent flex-1"

              onClick={() => runLegacy(async () => legacySetPoolTab('adaptada'))}

            >

              Ver adaptada

            </button>

          </div>

        )}

      </div>



      <LegacyEmbed elementId="bd-pool-summary" refreshScope="output" className="mb-2" />

      <LegacyEmbed elementId="bd-pool" refreshScope="output" />



      <div className="mt-6 flex flex-col gap-3 sm:flex-row">

        <FlowBtnAccent disabled={busy || approved === 0} onClick={() => handleMontar('turma')}>

          Montar material (turma)

        </FlowBtnAccent>

        {exam.wantAdapted && (

          <FlowBtnAccent disabled={busy || approved === 0} onClick={() => handleMontar('adaptada')}>

            Montar versão adaptada

          </FlowBtnAccent>

        )}

      </div>

    </div>

  );

}

