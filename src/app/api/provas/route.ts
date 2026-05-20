import { NextResponse } from 'next/server';
import { buildProvaRow } from '@/lib/server/provas';
import { requireUser, userClient } from '@/lib/server/supabase';

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const { data, error } = await userClient(auth.token)
    .from('provas')
    .select(
      'id, disciplina, serie, conteudo, tipo, dificuldade, num_questoes, escola, professor, created_at',
    )
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const body = await req.json();
  if (!body?.prova_text || !String(body.prova_text).trim()) {
    return NextResponse.json({ error: 'Texto da prova vazio.' }, { status: 400 });
  }

  const row = buildProvaRow(auth.user.id, body);
  const { data, error } = await userClient(auth.token).from('provas').insert(row).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
