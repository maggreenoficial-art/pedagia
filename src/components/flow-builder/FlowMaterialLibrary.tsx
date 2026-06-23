'use client';

import { useEffect, useRef, useState } from 'react';
import { useLegacySync } from '@/components/flow-builder/useLegacySync';
import { useRunLegacy } from '@/components/flow-builder/useRunLegacy';
import {
  fetchLegacySnapshot,
  legacyDeleteMaterial,
  legacyOnMaterialChange,
  legacyRefreshMaterials,
  legacyUploadBookPdf,
} from '@/lib/legacy/bridge';
import { useFlowStore } from '@/store/useFlowStore';

export function FlowMaterialLibrary() {
  const materialId = useFlowStore((s) => s.materialId);
  const hydrateFromLegacy = useFlowStore((s) => s.hydrateFromLegacy);
  const { busy, runLegacy } = useRunLegacy();
  const fileRef = useRef<HTMLInputElement>(null);
  const [materials, setMaterials] = useState<
    { id: string; fileName: string; totalPages: number }[]
  >([]);

  useLegacySync(true, 2000);

  useEffect(() => {
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshList = () => {
    const snap = fetchLegacySnapshot();
    if (snap) {
      setMaterials(snap.materialsList ?? []);
      hydrateFromLegacy(snap);
    }
  };

  const handleUpload = (file: File | undefined) => {
    if (!file) return;
    void runLegacy(async () => {
      await legacyUploadBookPdf(file);
      refreshList();
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSelect = (id: string) => {
    void runLegacy(async () => {
      await legacyOnMaterialChange(id);
      refreshList();
    });
  };

  const handleDelete = (id: string) => {
    void runLegacy(async () => {
      await legacyDeleteMaterial(id);
      refreshList();
    });
  };

  return (
    <div className="flow-mat-lib mb-6">
      <p className="flow-section-label">Sua biblioteca de PDFs</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          className="flow-chip-btn flow-chip-btn-accent"
          onClick={() => fileRef.current?.click()}
        >
          📤 Enviar novo PDF
        </button>
        <button
          type="button"
          disabled={busy}
          className="flow-chip-btn"
          onClick={() =>
            runLegacy(async () => {
              await legacyRefreshMaterials();
              refreshList();
            })
          }
        >
          ↻ Atualizar lista
        </button>
      </div>

      {!materials.length ? (
        <div className="flow-figure-empty">
          <p>Nenhum PDF na biblioteca.</p>
          <p className="text-[15px] text-white/45">Toque em «Enviar novo PDF» acima — tudo fica aqui no Builder.</p>
        </div>
      ) : (
        <ul className="flow-mat-list">
          {materials.map((m) => {
            const active = m.id === materialId;
            return (
              <li key={m.id} className={`flow-mat-item ${active ? 'is-active' : ''}`}>
                <button
                  type="button"
                  className="flow-mat-item-main"
                  onClick={() => handleSelect(m.id)}
                >
                  <span className="flow-mat-item-icon">📕</span>
                  <span className="min-w-0 text-left">
                    <strong className="block truncate text-[16px]">{m.fileName}</strong>
                    <span className="text-[14px] text-white/45">
                      {m.totalPages ? `${m.totalPages} páginas` : 'PDF na nuvem'}
                    </span>
                  </span>
                  {active && <span className="flow-mat-active-badge">Em uso</span>}
                </button>
                <button
                  type="button"
                  className="flow-mat-item-del"
                  title="Apagar PDF"
                  disabled={busy}
                  onClick={() => handleDelete(m.id)}
                >
                  🗑
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
