'use client';

import { useState } from 'react';
import {
  FlowBtnPrimary,
  FlowField,
  flowInputCls,
  flowTextareaCls,
} from '@/components/flow-builder/flow-ui';
import { useRunLegacy } from '@/components/flow-builder/useRunLegacy';
import { fetchLegacySnapshot, legacyFlowGenerateImage } from '@/lib/legacy/bridge';
import { useFlowStore } from '@/store/useFlowStore';
import { useOperationProgressStore } from '@/store/useOperationProgressStore';

export function FlowImageGen() {
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const { busy, runLegacy } = useRunLegacy();
  const setSelectedFigures = useFlowStore((s) => s.setSelectedFigures);
  const opProgress = useOperationProgressStore((s) => s.progress);
  const isGenerating = busy || (opProgress.active && opProgress.operation === 'image');

  const handleGenerate = () => {
    void runLegacy(async () => {
      const result = await legacyFlowGenerateImage({
        prompt,
        title: title || prompt.slice(0, 60),
        category: 'educativo',
        aspectRatio: '4:3',
      });
      if (result?.previewUrl) setPreview(result.previewUrl);
      const snap = fetchLegacySnapshot();
      if (snap) setSelectedFigures(snap.selectedFigures ?? []);
    });
  };

  return (
    <div className="flow-image-gen mt-8 rounded-2xl border border-white/10 bg-[#1e1e24]/80 p-5">
      <h3 className="mb-1 text-[18px] font-extrabold text-white">✨ Criar imagem com IA</h3>
      <p className="mb-4 text-[15px] text-white/50">
        Gere ilustrações, mapas ou diagramas e use na produção — a imagem já entra selecionada.
      </p>

      {isGenerating && (
        <div className="flow-image-gen-status mb-4" role="status" aria-live="polite">
          <span className="flow-op-progress-spinner flow-op-progress-spinner--sm" aria-hidden />
          <div>
            <p className="font-bold text-white">{opProgress.message || 'Gerando imagem com IA…'}</p>
            <p className="text-[13px] text-white/50">Aguarde — a prévia aparece ao concluir.</p>
          </div>
        </div>
      )}

      <FlowField label="O que você quer na imagem?">
        <textarea
          className={flowTextareaCls}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex.: Mapa do Brasil com biomas coloridos, estilo didático para 3º ano…"
          disabled={isGenerating}
        />
      </FlowField>

      <FlowField label="Título (opcional)">
        <input
          className={flowInputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: Biomas do Brasil"
          disabled={isGenerating}
        />
      </FlowField>

      <FlowBtnPrimary disabled={isGenerating || prompt.trim().length < 8} onClick={handleGenerate}>
        {isGenerating ? opProgress.message || 'Gerando imagem…' : '✨ Gerar e adicionar à seleção'}
      </FlowBtnPrimary>

      {preview && !isGenerating && (
        <div className="mt-5 overflow-hidden rounded-xl border border-[#FFD200]/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Prévia gerada" className="max-h-64 w-full object-contain bg-black/40" />
        </div>
      )}
    </div>
  );
}
