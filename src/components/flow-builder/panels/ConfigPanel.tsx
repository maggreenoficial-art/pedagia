'use client';

import { DISCIPLINAS, SERIES } from '@/lib/curriculum-options';
import {
  FlowBtnPrimary,
  FlowField,
  flowSelectCls,
  flowTextareaCls,
} from '@/components/flow-builder/flow-ui';
import { PRODUCTION_TYPES } from '@/components/flow-builder/palette-config';
import type { ProductionKind } from '@/components/flow-builder/flow-types';
import { PfIcon } from '@/lib/icons';
import { legacyToast } from '@/lib/legacy/bridge';
import { useRunLegacy } from '@/components/flow-builder/useRunLegacy';
import { useFlowStore } from '@/store/useFlowStore';

export function ConfigPanel() {
  const exam = useFlowStore((s) => s.exam);
  const updateExamField = useFlowStore((s) => s.updateExamField);
  const confirmActiveNodeStep = useFlowStore((s) => s.confirmActiveNodeStep);
  const { busy } = useRunLegacy();

  const handleConfirm = () => {
    const result = confirmActiveNodeStep();
    if (!result.ok) {
      legacyToast(result.error, 'err');
      return;
    }
    legacyToast('Dados confirmados.', 'ok');
  };

  return (
    <div className="flow-panel">
      <p className="flow-panel-lead">
        Escolha o tipo de produção, disciplina e série. Isso orienta a IA e o cabeçalho da prova.
      </p>

      <p className="flow-section-label">O que você está criando?</p>
      <div className="flow-production-grid mb-6">
        {PRODUCTION_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`flow-production-card ${exam.productionKind === t.id ? 'is-active' : ''}`}
            onClick={() => updateExamField('productionKind', t.id as ProductionKind)}
          >
            <span className="flow-production-icon">
              <PfIcon name={t.icon} size={28} />
            </span>
            <strong>{t.label}</strong>
            <span>{t.desc}</span>
          </button>
        ))}
      </div>

      <div className="flow-panel-fields-2 mb-5">
        <FlowField label="Disciplina *">
          <select
            className={flowSelectCls}
            value={exam.disciplina}
            onChange={(e) => updateExamField('disciplina', e.target.value)}
          >
            <option value="">Selecione a disciplina…</option>
            {DISCIPLINAS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </FlowField>

        <FlowField label="Série / ano *">
          <select
            className={flowSelectCls}
            value={exam.serie}
            onChange={(e) => updateExamField('serie', e.target.value)}
          >
            <option value="">Selecione a série…</option>
            {SERIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FlowField>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FlowField label="Título / identificação">
          <input
            className={flowSelectCls}
            value={exam.tipo}
            onChange={(e) => updateExamField('tipo', e.target.value)}
            placeholder="Ex.: Prova bimestral 2"
          />
        </FlowField>
        <FlowField label="Valor / pontuação">
          <input
            className={flowSelectCls}
            value={exam.valor}
            onChange={(e) => updateExamField('valor', e.target.value)}
            placeholder="10,0"
          />
        </FlowField>
      </div>

      {(exam.productionKind === 'prova' ||
        exam.productionKind === 'atividade' ||
        exam.productionKind === 'avaliacao') && (
        <FlowField
          label="Quantidade de questões para a IA gerar"
          hint="Entre 3 e 30 — inclui questões do texto e das figuras selecionadas"
        >
          <input
            type="number"
            min={3}
            max={30}
            className={flowSelectCls}
            value={exam.numQ}
            onChange={(e) =>
              updateExamField('numQ', Math.min(30, Math.max(3, parseInt(e.target.value, 10) || 10)))
            }
          />
        </FlowField>
      )}

      <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <input
          type="checkbox"
          checked={exam.wantAdapted}
          onChange={(e) => updateExamField('wantAdapted', e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-[#FFB800]"
        />
        <span className="text-[16px] text-white/80">
          <strong className="block text-white">Versão adaptada (PAEE)</strong>
          Gera uma versão alternativa para alunos com necessidades específicas.
        </span>
      </label>

      {exam.wantAdapted && (
        <FlowField label="Notas de adaptação">
          <textarea
            className={flowTextareaCls}
            value={exam.adaptNotes}
            onChange={(e) => updateExamField('adaptNotes', e.target.value)}
            placeholder="Dislexia, TDAH, baixa visão, tempo estendido…"
          />
        </FlowField>
      )}

      <FlowBtnPrimary disabled={busy} onClick={handleConfirm}>
        Confirmar dados da produção
      </FlowBtnPrimary>
    </div>
  );
}
