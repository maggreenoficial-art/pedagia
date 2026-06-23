'use client';

import { useEffect, useState } from 'react';
import { FlowMaterialLibrary } from '@/components/flow-builder/FlowMaterialLibrary';
import { LegacyEmbed } from '@/components/flow-builder/LegacyEmbed';
import {
  FlowBtnAccent,
  FlowBtnPrimary,
  FlowBtnSecondary,
  FlowField,
  FlowTabs,
  flowInputCls,
  flowTextareaCls,
} from '@/components/flow-builder/flow-ui';
import { useLegacySync } from '@/components/flow-builder/useLegacySync';
import { useRunLegacy } from '@/components/flow-builder/useRunLegacy';
import {
  fetchLegacySnapshot,
  legacyApplyPagesRange,
  legacyConfirmPages,
  legacyLoadCropPages,
  legacyRefreshMaterials,
  legacyToast,
} from '@/lib/legacy/bridge';
import { useFlowStore } from '@/store/useFlowStore';
import { PfIcon } from '@/lib/icons';

export function MaterialPanel() {
  const exam = useFlowStore((s) => s.exam);
  const updateExamField = useFlowStore((s) => s.updateExamField);
  const materialId = useFlowStore((s) => s.materialId);
  const bookFileName = useFlowStore((s) => s.bookFileName);
  const bookTotalPages = useFlowStore((s) => s.bookTotalPages);
  const confirmed = useFlowStore((s) => s.builderPagesConfirmed);
  const confirmedPageList = useFlowStore((s) => s.confirmedPageList);
  const selectedPages = useFlowStore((s) => s.selectedPages);
  const confirmActiveNodeStep = useFlowStore((s) => s.confirmActiveNodeStep);
  const hydrateFromLegacy = useFlowStore((s) => s.hydrateFromLegacy);
  const { busy, runLegacy } = useRunLegacy();

  const [tab, setTab] = useState<'pdf' | 'crop' | 'texto'>('pdf');
  const [pagFrom, setPagFrom] = useState('1');
  const [pagTo, setPagTo] = useState('15');

  useLegacySync(true);

  useEffect(() => {
    void runLegacy(async () => {
      await legacyRefreshMaterials();
      const snap = fetchLegacySnapshot();
      if (!snap) return;
      hydrateFromLegacy(snap);
      if (snap.pagFrom) setPagFrom(snap.pagFrom);
      if (snap.pagTo) setPagTo(snap.pagTo);
      else if (snap.bookTotalPages) {
        setPagTo(String(Math.min(snap.bookTotalPages, 15)));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyPages = () => {
    void runLegacy(async () => {
      if (!materialId) {
        throw new Error('Selecione um PDF na biblioteca acima antes de marcar páginas.');
      }
      await legacyApplyPagesRange(pagFrom, pagTo);
      legacyToast(
        `${fetchLegacySnapshot()?.selectedPages?.length ?? 0} página(s) marcadas — confirme abaixo.`,
        'ok',
      );
    });
  };

  const handleConfirmPages = () => {
    void runLegacy(async () => {
      const hasTopicos = !!exam.topicos.trim();

      if (!hasTopicos) {
        if (!materialId) {
          throw new Error('Selecione um PDF na biblioteca ou use a aba «Conteúdo escrito».');
        }

        let snap = fetchLegacySnapshot();
        if (!(snap?.selectedPages?.length ?? 0)) {
          await legacyApplyPagesRange(pagFrom, pagTo);
          snap = fetchLegacySnapshot();
        }
        if (!(snap?.selectedPages?.length ?? 0)) {
          throw new Error(
            'Informe o intervalo (ex.: 1 a 15) e toque em «Marcar intervalo de páginas».',
          );
        }
      }

      await legacyConfirmPages();
      const snap = fetchLegacySnapshot();
      if (!snap?.builderPagesConfirmed) {
        throw new Error('Não foi possível confirmar. Verifique o PDF e as páginas.');
      }

      hydrateFromLegacy(snap);
      const result = confirmActiveNodeStep();
      if (!result.ok) throw new Error(result.error);
      legacyToast('Material confirmado para a IA.', 'ok');
    });
  };

  const handleLoadCrop = () => {
    void runLegacy(async () => {
      await legacyLoadCropPages();
    });
  };

  return (
    <div className="flow-panel">
      <p className="flow-panel-lead">
        Tudo acontece aqui: envie o PDF, marque páginas, recorte figuras ou escreva o conteúdo — sem
        sair do Builder.
      </p>

      <FlowTabs
        variant="segment"
        active={tab}
        onChange={(id) => {
          setTab(id as typeof tab);
          const snap = fetchLegacySnapshot();
          if (snap) hydrateFromLegacy(snap);
        }}
        tabs={[
          {
            id: 'pdf',
            label: (
              <>
                <PfIcon name="source" size={18} /> PDF e páginas
              </>
            ),
          },
          {
            id: 'crop',
            label: (
              <>
                <PfIcon name="media" size={18} /> Recortar figuras
              </>
            ),
            accent: true,
          },
          {
            id: 'texto',
            label: (
              <>
                <PfIcon name="config" size={18} /> Conteúdo escrito
              </>
            ),
          },
        ]}
      />

      {confirmed && (
        <div className="flow-status-ok mb-5">
          ✓ Material confirmado
          {confirmedPageList.length
            ? `: páginas ${confirmedPageList.join(', ')}`
            : ' (texto escrito)'}
        </div>
      )}

      {tab === 'pdf' && (
        <>
          <FlowMaterialLibrary />

          {bookFileName && (
            <p className="mb-4 text-[16px] text-white/60">
              PDF ativo: <strong className="text-white">{bookFileName}</strong>
              {bookTotalPages ? ` · ${bookTotalPages} páginas no total` : ''}
            </p>
          )}

          <p className="flow-section-label">Quais páginas usar?</p>
          <div className="mb-5 grid grid-cols-2 gap-4">
            <FlowField label="Página inicial">
              <input
                className={flowInputCls}
                inputMode="numeric"
                value={pagFrom}
                onChange={(e) => setPagFrom(e.target.value)}
              />
            </FlowField>
            <FlowField label="Página final">
              <input
                className={flowInputCls}
                inputMode="numeric"
                value={pagTo}
                onChange={(e) => setPagTo(e.target.value)}
              />
            </FlowField>
          </div>

          <div className="mb-5">
            <FlowBtnSecondary disabled={busy || !materialId} onClick={handleApplyPages}>
              Marcar intervalo de páginas
            </FlowBtnSecondary>
          </div>

          {selectedPages.length > 0 && !confirmed && (
            <p className="mb-3 text-[15px] text-[#f0b429]">
              {selectedPages.length} página(s) selecionada(s) — confirme abaixo.
            </p>
          )}

          <LegacyEmbed elementId="bd-page-chips" refreshScope="material" className="mb-5" />

          {!confirmed && (
            <FlowBtnPrimary disabled={busy} onClick={handleConfirmPages}>
              ✓ Confirmar material para a IA
            </FlowBtnPrimary>
          )}
        </>
      )}

      {tab === 'crop' && (
        <>
          <p className="mb-4 text-[16px] leading-relaxed text-white/60">
            Somente recorte de imagens do PDF. Marque as páginas na aba «PDF e páginas», carregue
            as miniaturas e recorte aqui. Para gerar exercícios com figuras, use o passo «Figuras e
            gráficos».
          </p>
          <FlowBtnAccent disabled={busy || !selectedPages.length} onClick={handleLoadCrop}>
            Carregar páginas para recorte
          </FlowBtnAccent>
          <div className="mt-5">
            <LegacyEmbed
              elementId="bd-crop-section"
              refreshScope="material"
              className="flow-crop-embed"
            />
          </div>
        </>
      )}

      {tab === 'texto' && (
        <>
          <FlowField
            label="Conteúdo / tópicos (sem PDF)"
            hint="Use quando não tiver livro digitalizado. A IA usará este texto como base."
          >
            <textarea
              className={flowTextareaCls}
              value={exam.topicos}
              onChange={(e) => updateExamField('topicos', e.target.value)}
              placeholder="Cole aqui o texto-base ou liste os tópicos…"
            />
          </FlowField>
          {!confirmed && (
            <FlowBtnPrimary disabled={busy || !exam.topicos.trim()} onClick={handleConfirmPages}>
              ✓ Confirmar conteúdo escrito
            </FlowBtnPrimary>
          )}
        </>
      )}
    </div>
  );
}
