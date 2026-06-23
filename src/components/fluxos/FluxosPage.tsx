'use client';

import { useCallback, useEffect, useState } from 'react';
import { PfIcon } from '@/lib/icons';
import { AppBackButton } from '@/components/nav/AppBackButton';
import { legacyResumeBuilderFlow } from '@/lib/legacy/bridge';

declare global {
  interface Window {
    currentSession?: { access_token?: string };
    goTo?: (view: string) => void;
  }
}

export type SavedFlow = {
  id: string;
  materialId: string | null;
  title: string;
  bookFileName: string;
  totalPages: number;
  disciplina: string;
  serie: string;
  tipo: string;
  poolCount: number;
  pagesConfirmed: boolean;
  savedAt: string | number | null;
};

function authHeaders(): HeadersInit {
  const token = window.currentSession?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatWhen(savedAt: string | number | null): string {
  if (!savedAt) return 'Sem data';
  const d = new Date(savedAt);
  if (Number.isNaN(d.getTime())) return 'Sem data';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function FluxosPage() {
  const [flows, setFlows] = useState<SavedFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [resuming, setResuming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/flows', { headers: authHeaders() });
      if (res.status === 401) {
        window.goTo?.('auth');
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar fluxos');
      setFlows(Array.isArray(data) ? data : []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resume = async (flow: SavedFlow) => {
    setResuming(flow.id);
    setMsg('');
    try {
      await legacyResumeBuilderFlow(flow.materialId);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao retomar');
    } finally {
      setResuming(null);
    }
  };

  return (
    <div className="pf-home pf-fluxos">
      <div className="pf-fluxos-top">
        <AppBackButton label="Menu principal" />
      </div>
      <header className="pf-home-hero">
        <p className="pf-home-kicker">Biblioteca</p>
        <h1 className="pf-home-title">Meus fluxos</h1>
        <p className="pf-home-lead">
          Produções salvas no meio do caminho — retome de onde parou no Builder.
        </p>
      </header>

      <div className="pf-home-actions">
        <div className="pf-action-grid">
          <button type="button" className="pf-action-card" onClick={() => window.goTo?.('builder')}>
            <PfIcon name="builder" size={24} />
            <strong>Novo fluxo</strong>
            <span>Começar uma produção do zero</span>
          </button>
          <button type="button" className="pf-action-card" onClick={() => window.goTo?.('home')}>
            <PfIcon name="home" size={24} />
            <strong>Início</strong>
            <span>Voltar ao menu principal</span>
          </button>
        </div>
      </div>

      {msg && <p className="pf-home-toast mb-4">{msg}</p>}

      {loading ? (
        <p className="pf-home-muted">Carregando fluxos salvos…</p>
      ) : flows.length === 0 ? (
        <section className="card">
          <div className="card-body pf-fluxos-empty">
            <PfIcon name="builder" size={36} />
            <p className="pf-home-muted">Nenhum fluxo salvo ainda.</p>
            <p className="pf-home-muted text-sm">
              No Builder, use <strong>Salvar fluxo</strong> na barra superior para guardar o progresso.
            </p>
          </div>
        </section>
      ) : (
        <ul className="pf-fluxos-list">
          {flows.map((flow) => (
            <li key={flow.id} className="card pf-fluxos-card">
              <div className="card-body pf-fluxos-card-inner">
                <div className="min-w-0 flex-1">
                  <h2 className="pf-fluxos-title">{flow.title}</h2>
                  <p className="pf-home-muted">
                    {[flow.disciplina, flow.serie].filter(Boolean).join(' · ') ||
                      flow.bookFileName ||
                      'Material em edição'}
                  </p>
                  <div className="pf-fluxos-tags">
                    {flow.pagesConfirmed && <span className="pf-fluxos-tag pf-fluxos-tag--ok">Material OK</span>}
                    {flow.poolCount > 0 && (
                      <span className="pf-fluxos-tag">{flow.poolCount} item(ns) no pool</span>
                    )}
                    <span className="pf-fluxos-tag">Salvo {formatWhen(flow.savedAt)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-ir pf-fluxos-resume"
                  disabled={resuming === flow.id}
                  onClick={() => void resume(flow)}
                >
                  {resuming === flow.id ? 'Abrindo…' : 'Continuar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
