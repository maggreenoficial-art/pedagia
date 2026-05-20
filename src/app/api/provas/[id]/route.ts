import { NextResponse } from 'next/server';
import { buildProvaRow } from '@/lib/server/provas';
import { requireUser, userClient } from '@/lib/server/supabase';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  const { id } = await ctx.params;

  const { data, error } = await userClient(auth.token).from('provas').select('*').eq('id', id).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Prova não encontrada.' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  const { id } = await ctx.params;
  const body = await req.json();

  const updates = buildProvaRow(auth.user.id, { ...body, user_id: undefined });
  delete (updates as { user_id?: string }).user_id;

  const { data, error } = await userClient(auth.token)
    .from('provas')
    .update(updates)
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Prova não encontrada.' }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  const { id } = await ctx.params;

  const { error } = await userClient(auth.token).from('provas').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
