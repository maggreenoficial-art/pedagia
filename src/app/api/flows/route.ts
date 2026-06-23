import { NextResponse } from 'next/server';
import { requireUser, userClient } from '@/lib/server/supabase';

type FlowRegistryEntry = {
  id?: string;
  materialId?: string | null;
  flowTitle?: string;
  flowSavedAt?: number | null;
  bookFileName?: string;
  totalPages?: number;
  disciplina?: string;
  serie?: string;
  tipo?: string;
  poolCount?: number;
  pagesConfirmed?: boolean;
  savedAt?: number | string | null;
};

type MontarSnap = {
  flowTitle?: string;
  flowSavedAt?: number | null;
  disc?: string;
  serie?: string;
  tipo?: string;
  pagesConfirmed?: boolean;
  pool?: unknown[];
};

type BuilderSnap = {
  montar?: MontarSnap;
  flowTitle?: string;
  flowSavedAt?: number | null;
  bookFileName?: string;
  bookTotalPages?: number;
  savedAt?: number;
};

type FlowItem = {
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

function entryToFlow(id: string, entry: FlowRegistryEntry, materialName?: string): FlowItem {
  return {
    id: entry.id || id,
    materialId: entry.materialId ?? (id === 'current' ? null : id),
    title:
      entry.flowTitle?.trim() ||
      materialName ||
      entry.bookFileName ||
      'Fluxo sem título',
    bookFileName: entry.bookFileName || materialName || '',
    totalPages: entry.totalPages || 0,
    disciplina: entry.disciplina || '',
    serie: entry.serie || '',
    tipo: entry.tipo || 'Prova',
    poolCount: entry.poolCount || 0,
    pagesConfirmed: !!entry.pagesConfirmed,
    savedAt: entry.flowSavedAt || entry.savedAt || null,
  };
}

function flowFromSnapshot(
  id: string,
  materialId: string | null,
  snap: BuilderSnap,
  materialName?: string,
  updatedAt?: string,
): FlowItem | null {
  const montar = snap.montar || {};
  const pool = Array.isArray(montar.pool) ? montar.pool : [];
  const hasWork =
    pool.length > 0 ||
    montar.pagesConfirmed ||
    snap.flowTitle?.trim() ||
    montar.flowTitle?.trim() ||
    montar.disc?.trim() ||
    montar.serie?.trim();
  if (!hasWork) return null;

  const title =
    montar.flowTitle?.trim() ||
    snap.flowTitle?.trim() ||
    materialName ||
    snap.bookFileName ||
    'Fluxo sem título';

  return {
    id,
    materialId,
    title,
    bookFileName: snap.bookFileName || materialName || '',
    totalPages: snap.bookTotalPages || 0,
    disciplina: montar.disc || '',
    serie: montar.serie || '',
    tipo: montar.tipo || 'Prova',
    poolCount: pool.length,
    pagesConfirmed: !!montar.pagesConfirmed,
    savedAt: montar.flowSavedAt || snap.flowSavedAt || snap.savedAt || updatedAt || null,
  };
}

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const sb = userClient(auth.token);
  const [{ data: ws, error: wsErr }, { data: materials, error: matErr }] = await Promise.all([
    sb.from('pedagia_workspace').select('builder_state, book_file_name, updated_at').maybeSingle(),
    sb
      .from('materials')
      .select('id, file_name, total_pages, created_at, updated_at')
      .order('updated_at', { ascending: false }),
  ]);

  if (wsErr) return NextResponse.json({ error: wsErr.message }, { status: 500 });
  if (matErr) return NextResponse.json({ error: matErr.message }, { status: 500 });

  const matMap = new Map((materials || []).map((m) => [m.id, m]));
  const byId = new Map<string, FlowItem>();

  const root = (ws?.builder_state || {}) as Record<string, unknown>;
  const flowsRegistry = (root.__flows || {}) as Record<string, FlowRegistryEntry>;

  for (const [key, entry] of Object.entries(flowsRegistry)) {
    if (!entry || typeof entry !== 'object') continue;
    const materialId = entry.materialId ?? (key === 'current' ? null : key);
    const mat = materialId ? matMap.get(materialId) : undefined;
    byId.set(key, entryToFlow(key, entry, mat?.file_name));
  }

  const byMaterial = (root.__byMaterial || {}) as Record<string, BuilderSnap>;

  for (const [key, snap] of Object.entries(byMaterial)) {
    const materialId = key === 'current' ? null : key;
    const mat = materialId ? matMap.get(materialId) : undefined;
    const fromSnap = flowFromSnapshot(
      key,
      materialId,
      snap,
      mat?.file_name,
      ws?.updated_at || mat?.updated_at,
    );
    if (!fromSnap) continue;
    const existing = byId.get(key);
    if (!existing || !existing.savedAt) {
      byId.set(key, fromSnap);
    }
  }

  const rootSnap = root as BuilderSnap;
  if (!byId.has('current')) {
    const current = flowFromSnapshot(
      'current',
      null,
      rootSnap,
      ws?.book_file_name || undefined,
      ws?.updated_at,
    );
    if (current) byId.set('current', current);
  }

  const flows = [...byId.values()].sort((a, b) => {
    const ta = a.savedAt ? new Date(a.savedAt).getTime() : 0;
    const tb = b.savedAt ? new Date(b.savedAt).getTime() : 0;
    return tb - ta;
  });

  return NextResponse.json(flows);
}
