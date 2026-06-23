'use client';

import { useEffect, useState } from 'react';
import type { ImageCatalogItem } from '@/components/flow-builder/flow-types';
import {
  fetchLegacySnapshot,
  legacyClearFigureSelection,
  legacySelectAllFigures,
  legacyToggleFigureSelection,
} from '@/lib/legacy/bridge';
import { useFlowStore } from '@/store/useFlowStore';

function mergeFigureItems(snap: NonNullable<ReturnType<typeof fetchLegacySnapshot>>): ImageCatalogItem[] {
  const media = snap.mediaItems ?? [];
  const catalog = snap.imageCatalog ?? [];
  const seen = new Set<string>();
  const merged: ImageCatalogItem[] = [];
  for (const item of [...media, ...catalog]) {
    if (!item?.imageId || seen.has(item.imageId)) continue;
    seen.add(item.imageId);
    merged.push(item);
  }
  return merged;
}

function downloadImage(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w\-]+/g, '_').slice(0, 40)}.png`;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function FigurePicker() {
  const selectedFigures = useFlowStore((s) => s.selectedFigures);
  const setSelectedFigures = useFlowStore((s) => s.setSelectedFigures);
  const [items, setItems] = useState<ImageCatalogItem[]>([]);

  useEffect(() => {
    const refresh = () => {
      const snap = fetchLegacySnapshot();
      if (!snap) return;
      setItems(mergeFigureItems(snap));
      setSelectedFigures(snap.selectedFigures ?? []);
    };
    refresh();
    const id = window.setInterval(refresh, 2000);
    return () => window.clearInterval(id);
  }, [setSelectedFigures]);

  const toggle = (imageId: string) => {
    legacyToggleFigureSelection(imageId);
    const snap = fetchLegacySnapshot();
    if (snap) setSelectedFigures(snap.selectedFigures ?? []);
  };

  if (!items.length) {
    return (
      <div className="flow-figure-empty">
        <span className="text-3xl">🖼</span>
        <p>Nenhuma figura ainda.</p>
        <p className="text-[15px] text-white/45">
          Recorte no passo Material ou gere uma imagem com IA abaixo.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className="flow-chip-btn" onClick={() => {
          legacySelectAllFigures();
          const snap = fetchLegacySnapshot();
          if (snap) setSelectedFigures(snap.selectedFigures ?? []);
        }}>
          Selecionar todas
        </button>
        <button type="button" className="flow-chip-btn" onClick={() => {
          legacyClearFigureSelection();
          setSelectedFigures([]);
        }}>
          Limpar seleção
        </button>
        <span className="flow-pill flow-pill-accent ml-auto">
          {selectedFigures.length} selecionada(s)
        </span>
      </div>

      <div className="flow-figure-grid">
        {items.map((img) => {
          const selected = selectedFigures.includes(img.imageId);
          return (
            <article
              key={img.imageId}
              className={`flow-figure-card ${selected ? 'is-selected' : ''}`}
            >
              <button
                type="button"
                className="flow-figure-select"
                onClick={() => toggle(img.imageId)}
                aria-pressed={selected}
              >
                <div className="flow-figure-thumb">
                  {img.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img.previewUrl} alt="" loading="lazy" />
                  ) : (
                    <span>🖼</span>
                  )}
                  {selected && <span className="flow-figure-check">✓</span>}
                </div>
                <p className="flow-figure-title">{img.title}</p>
                {img.pageNumber ? (
                  <p className="flow-figure-page">Página {img.pageNumber}</p>
                ) : null}
              </button>
              {img.previewUrl && (
                <button
                  type="button"
                  className="flow-figure-dl"
                  title="Baixar imagem"
                  onClick={() => downloadImage(img.previewUrl, img.title)}
                >
                  ⬇
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
