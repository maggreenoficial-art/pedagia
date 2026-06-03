import { NextResponse } from 'next/server';
import { buildSavedExerciseRow } from '@/lib/server/saved-exercises';
import { requireUser, userClient } from '@/lib/server/supabase';

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const { data, error } = await userClient(auth.token)
    .from('saved_exercises')
    .select(
      'id, image_id, storage_path, image_title, page_number, disciplina, serie, question, block_id, created_at',
    )
    .order('created_at', { ascending: false });

  if (error) {
    const missing = /saved_exercises|relation|does not exist/i.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? 'Tabela saved_exercises não encontrada. Execute supabase/schema-v2-material.sql no SQL Editor.'
          : error.message,
      },
      { status: missing ? 503 : 500 },
    );
  }
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const body = await req.json();
  if (!body?.image_id) {
    return NextResponse.json({ error: 'image_id é obrigatório.' }, { status: 400 });
  }

  let row;
  try {
    row = buildSavedExerciseRow(auth.user.id, body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Dados inválidos';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { data, error } = await userClient(auth.token)
    .from('saved_exercises')
    .insert(row)
    .select(
      'id, image_id, storage_path, image_title, page_number, disciplina, serie, question, block_id, created_at',
    )
    .single();

  if (error) {
    const missing = /saved_exercises|relation|does not exist/i.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? 'Tabela saved_exercises não encontrada. Execute supabase/schema-v2-material.sql no SQL Editor.'
          : error.message,
      },
      { status: missing ? 503 : 500 },
    );
  }
  return NextResponse.json(data, { status: 201 });
}
