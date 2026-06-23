'use client';

import { useEffect, useState } from 'react';
import {
  FlowBtnPrimary,
  FlowBtnSecondary,
  FlowField,
  flowInputCls,
  flowSelectCls,
} from '@/components/flow-builder/flow-ui';
import { useLegacySync } from '@/components/flow-builder/useLegacySync';
import { useRunLegacy } from '@/components/flow-builder/useRunLegacy';
import {
  fetchLegacySnapshot,
  legacyDeleteHeader,
  legacyOnHeaderChange,
  legacySaveManualHeader,
} from '@/lib/legacy/bridge';
import { useFlowStore } from '@/store/useFlowStore';

export function FlowHeaderManager() {
  const activeHeaderId = useFlowStore((s) => s.activeHeaderId);
  const setActiveHeaderId = useFlowStore((s) => s.setActiveHeaderId);
  const hydrateFromLegacy = useFlowStore((s) => s.hydrateFromLegacy);
  const { busy, runLegacy } = useRunLegacy();
  const [headers, setHeaders] = useState<{ id: string; name: string }[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [escola, setEscola] = useState('');
  const [prof, setProf] = useState('');

  useLegacySync(true, 2500);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = () => {
    const snap = fetchLegacySnapshot();
    if (!snap) return;
    setHeaders(snap.headers ?? []);
    if (snap.activeHeaderId) setActiveHeaderId(snap.activeHeaderId);
    hydrateFromLegacy(snap);
  };

  const handleSelect = (id: string) => {
    setActiveHeaderId(id || null);
    if (!id) return;
    void runLegacy(async () => {
      await legacyOnHeaderChange(id);
      refresh();
    });
  };

  const handleDelete = (id: string, label: string) => {
    void runLegacy(async () => {
      await legacyDeleteHeader(id);
      refresh();
    });
  };

  const handleSaveNew = () => {
    void runLegacy(async () => {
      await legacySaveManualHeader({ name, escola, prof });
      setName('');
      setEscola('');
      setProf('');
      setShowNew(false);
      refresh();
    });
  };

  return (
    <div className="flow-header-mgr">
      <FlowField label="Cabeçalho em uso">
        <select
          className={flowSelectCls}
          value={activeHeaderId ?? ''}
          onChange={(e) => handleSelect(e.target.value)}
        >
          <option value="">— Nenhum cabeçalho —</option>
          {headers.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </FlowField>

      {headers.length > 0 && (
        <ul className="flow-mat-list mb-5">
          {headers.map((h) => (
            <li key={h.id} className={`flow-mat-item ${h.id === activeHeaderId ? 'is-active' : ''}`}>
              <button type="button" className="flow-mat-item-main" onClick={() => handleSelect(h.id)}>
                <span className="flow-mat-item-icon">🏫</span>
                <strong className="truncate text-[16px]">{h.name}</strong>
              </button>
              <button
                type="button"
                className="flow-mat-item-del"
                disabled={busy}
                onClick={() => handleDelete(h.id, h.name)}
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}

      {!showNew ? (
        <FlowBtnSecondary disabled={busy} onClick={() => setShowNew(true)}>
          + Criar cabeçalho aqui
        </FlowBtnSecondary>
      ) : (
        <div className="flow-header-new rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="mb-4 text-[16px] font-bold text-white">Novo cabeçalho</p>
          <FlowField label="Nome do cabeçalho">
            <input
              className={flowInputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: EM Prof. Silva — Provas"
            />
          </FlowField>
          <FlowField label="Escola">
            <input
              className={flowInputCls}
              value={escola}
              onChange={(e) => setEscola(e.target.value)}
              placeholder="Nome da escola"
            />
          </FlowField>
          <FlowField label="Professor(a)">
            <input
              className={flowInputCls}
              value={prof}
              onChange={(e) => setProf(e.target.value)}
              placeholder="Seu nome"
            />
          </FlowField>
          <div className="flex flex-col gap-2 sm:flex-row">
            <FlowBtnPrimary disabled={busy || (!name.trim() && !escola.trim())} onClick={handleSaveNew}>
              💾 Salvar cabeçalho
            </FlowBtnPrimary>
            <FlowBtnSecondary disabled={busy} onClick={() => setShowNew(false)}>
              Cancelar
            </FlowBtnSecondary>
          </div>
        </div>
      )}
    </div>
  );
}
