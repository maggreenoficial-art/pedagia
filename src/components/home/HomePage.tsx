'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BRAND_LOGO_FALLBACK, BRAND_LOGO_SRC } from '@/lib/brand';
import type { TeacherProfile, TeacherSampleExam } from '@/lib/teacher-profile/types';
import { EMPTY_TEACHER_PROFILE } from '@/lib/teacher-profile/types';
import { sanitizeTeacherProfile } from '@/lib/teacher-profile/sanitize';
import { PfIcon, type IconName } from '@/lib/icons';

declare global {
  interface Window {
    currentSession?: { access_token?: string };
    goTo?: (view: string) => void;
    resumeDraftProva?: () => void;
    st?: { hasDraftProva?: boolean; draftPreview?: string };
  }
}

function authHeaders(): HeadersInit {
  const token = window.currentSession?.access_token;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
    const mammoth = await import('mammoth');
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    const text = (result.value || '').replace(/\s+\n/g, '\n').trim();
    if (text.length < 80) throw new Error(`Texto curto demais em ${file.name}. Use um .docx com mais conteúdo.`);
    return text.slice(0, 50000);
  }
  if (name.endsWith('.txt') || file.type.startsWith('text/')) {
    return (await file.text()).slice(0, 50000);
  }
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const pdfjsLib = (window as unknown as Record<string, unknown>)['pdfjs-dist/build/pdf'] as
      | { getDocument: (p: { data: ArrayBuffer }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string }[] }> }> }> } }
      | undefined;
    if (!pdfjsLib) throw new Error('PDF.js ainda carregando. Aguarde e tente de novo.');
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const maxPages = Math.min(pdf.numPages, 8);
    const chunks: string[] = [];
    for (let p = 1; p <= maxPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      chunks.push(content.items.map((i) => i.str || '').join(' '));
    }
    return chunks.join('\n\n').slice(0, 50000);
  }
  throw new Error(`Formato não suportado: ${file.name}. Use Word (.docx), PDF ou .txt`);
}

const QUICK_ACTIONS: { view: string; icon: IconName; label: string; desc: string }[] = [
  { view: 'builder', icon: 'builder', label: 'Montar', desc: 'Fluxo visual para provas e atividades' },
  { view: 'fluxos', icon: 'fluxos', label: 'Meus fluxos', desc: 'Continuar produções salvas' },
  { view: 'material', icon: 'material', label: 'Material', desc: 'PDFs, páginas e recortes' },
  { view: 'midias', icon: 'midias', label: 'Minhas mídias', desc: 'Figuras e imagens na nuvem' },
  { view: 'history', icon: 'history', label: 'Minhas provas', desc: 'Histórico e exportação Word/PDF' },
];

export function HomePage() {
  const [profile, setProfile] = useState<TeacherProfile>(EMPTY_TEACHER_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/professor-profile', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile || EMPTY_TEACHER_PROFILE);
      }
    } catch {
      /* offline / sem token */
    }
    setHasDraft(!!window.st?.hasDraftProva);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProfile = async (next: TeacherProfile): Promise<boolean> => {
    setSaving(true);
    setMsg('');
    try {
      if (!window.currentSession?.access_token) {
        throw new Error('Faça login para salvar seu perfil na nuvem.');
      }
      const res = await fetch('/api/professor-profile', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(sanitizeTeacherProfile(next)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar perfil');
      setProfile(data.profile);
      setMsg('Perfil salvo.');
      try {
        window.dispatchEvent(new CustomEvent('pedagia:profile-updated'));
      } catch {
        /* ignore */
      }
      return true;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setMsg('Lendo provas de exemplo…');
    const added: TeacherSampleExam[] = [];
    for (const file of Array.from(files).slice(0, 5)) {
      try {
        const text = await extractTextFromFile(file);
        if (text.trim().length < 80) {
          setMsg(`Texto curto demais em ${file.name}. Use prova com mais conteúdo.`);
          continue;
        }
        added.push({
          id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          fileName: file.name,
          textPreview: text,
          uploadedAt: new Date().toISOString(),
        });
      } catch (e) {
        setMsg(e instanceof Error ? e.message : 'Erro ao ler arquivo');
      }
    }
    if (added.length) {
      const next = { ...profile, sampleExams: [...profile.sampleExams, ...added].slice(-8) };
      setProfile(next);
      const ok = await saveProfile(next);
      if (ok) {
        setMsg(
          `${added.length} prova(s) Word/PDF adicionada(s). A IA usará seu estilo ao gerar no fluxo.`,
        );
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const analyzeStyle = async () => {
    const samples = profile.sampleExams
      .map((s) => s.textPreview?.trim())
      .filter((t) => t && t.length >= 40);
    if (!samples.length) {
      setMsg('Envie ao menos uma prova em Word (.docx) antes de analisar.');
      return;
    }
    if (!window.currentSession?.access_token) {
      setMsg('Faça login para analisar seu perfil de escrita.');
      return;
    }
    setAnalyzing(true);
    setMsg('');
    try {
      const res = await fetch('/api/professor-profile/analyze', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          samples,
          displayName: profile.displayName,
          subjects: profile.subjects,
          bio: profile.bio,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro na análise');
      setProfile(data.profile);
      setMsg('Perfil de escrita gerado! Todas as gerações usarão seu tom.');
      try {
        window.dispatchEvent(new CustomEvent('pedagia:profile-updated'));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro na análise');
    } finally {
      setAnalyzing(false);
    }
  };

  const go = (view: string) => window.goTo?.(view);

  const greeting = profile.displayName?.trim() || 'Professor(a)';

  return (
    <div className="pf-home">
      <header className="pf-home-hero">
        <img
          {...{ src: BRAND_LOGO_SRC, alt: 'Professor Flux' }}
          className="pf-home-logo"
          width={88}
          height={88}
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            if (!img.src.includes(BRAND_LOGO_FALLBACK)) img.src = BRAND_LOGO_FALLBACK;
          }}
        />
        <div>
          <p className="pf-home-kicker">Bem-vindo de volta</p>
          <h1 className="pf-home-title">{greeting}</h1>
          {profile.writingProfile?.summary && (
            <div className="pf-profile-chip" role="status">
              <PfIcon name="sparkles" size={16} />
              <span>Perfil de escrita ativo — a IA usa seu tom</span>
            </div>
          )}
          <p className="pf-home-lead">
            Configure seu perfil pedagógico para a IA reconhecer seu tom de escrita em provas,
            atividades e avaliações.
          </p>
        </div>
      </header>

      {hasDraft && (
        <div className="pf-home-draft card">
          <div className="card-body">
            <p className="pf-home-draft-title">Prova em andamento</p>
            <p className="pf-home-draft-desc">Você tem uma prova gerada não finalizada.</p>
            <button type="button" className="btn-ir" onClick={() => window.resumeDraftProva?.()}>
              Continuar prova
            </button>
          </div>
        </div>
      )}

      <div className="pf-home-grid">
        <section className="card pf-home-profile">
          <div className="card-body">
            <p className="sl">Seu perfil</p>
            {loading ? (
              <p className="pf-home-muted">Carregando…</p>
            ) : (
              <>
                <label className="field">
                  <span className="fl">Como você se chama?</span>
                  <input
                    type="text"
                    value={profile.displayName}
                    onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                    placeholder="Ex.: Prof. Maria Silva"
                  />
                </label>
                <label className="field">
                  <span className="fl">O que você leciona?</span>
                  <input
                    type="text"
                    value={profile.subjects}
                    onChange={(e) => setProfile({ ...profile, subjects: e.target.value })}
                    placeholder="Ex.: Geografia · História · 6º ao 9º ano"
                  />
                </label>
                <label className="field">
                  <span className="fl">Apresentação (opcional)</span>
                  <textarea
                    value={profile.bio}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    placeholder="Conte um pouco como você costuma avaliar seus alunos…"
                    rows={3}
                  />
                </label>
                <button
                  type="button"
                  className="btn-ir"
                  disabled={saving}
                  onClick={() => void saveProfile(profile)}
                >
                  {saving ? 'Salvando…' : 'Salvar perfil'}
                </button>
              </>
            )}
          </div>
        </section>

        <section className="card pf-home-samples">
          <div className="card-body">
            <p className="sl">Provas de exemplo</p>
            <p className="pf-home-muted mb-4">
              Envie provas que você já usa em Word (.docx). A IA lê o texto e aplica seu tom ao gerar
              questões no fluxo Montar — enunciados, estrutura e vocabulário.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.txt,application/pdf,text/plain"
              multiple
              className="hidden"
              id="pf-sample-upload"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <label htmlFor="pf-sample-upload" className="uzone block cursor-pointer">
              <span className="uzone-icon">
                <PfIcon name="upload" size={28} />
              </span>
              <span className="uzone-t">Enviar provas suas (Word .docx)</span>
              <span className="uzone-s">Preferencial: .docx · também PDF ou .txt · até 8 amostras</span>
            </label>
            {profile.sampleExams.length > 0 ? (
              <ul className="pf-sample-list">
                {profile.sampleExams.map((s) => (
                  <li key={s.id}>
                    <strong>{s.fileName}</strong>
                    <span>{s.textPreview.slice(0, 120)}…</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="pf-empty-state">
                <PfIcon name="prova" size={32} />
                <p>Nenhuma prova enviada ainda.</p>
                <p className="pf-home-muted">Envie arquivos Word (.docx) para a IA imitar seu estilo.</p>
              </div>
            )}
            <button
              type="button"
              className="btn-ir mt-4"
              disabled={analyzing || !profile.sampleExams.length}
              onClick={() => void analyzeStyle()}
            >
              {analyzing ? 'Analisando seu estilo…' : 'Gerar perfil de escrita com IA'}
            </button>
            {profile.writingProfile && (
              <div className="pf-style-card">
                <p className="pf-style-label">Perfil ativo</p>
                <p>{profile.writingProfile.summary}</p>
                {profile.writingProfile.tone && (
                  <p className="pf-home-muted">
                    <b>Tom:</b> {profile.writingProfile.tone}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="pf-home-actions">
        <p className="sl">Começar</p>
        <div className="pf-action-grid">
          {QUICK_ACTIONS.map((a) => (
            <button key={a.view} type="button" className="pf-action-card" onClick={() => go(a.view)}>
              <span className="pf-action-icon">
                <PfIcon name={a.icon} size={24} />
              </span>
              <strong>{a.label}</strong>
              <span>{a.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {msg && <p className="pf-home-toast">{msg}</p>}
    </div>
  );
}
