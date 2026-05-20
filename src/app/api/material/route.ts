import { NextResponse } from 'next/server';
import { requireUser, userClient } from '@/lib/server/supabase';

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const sb = userClient(auth.token);
  const { data: materials, error } = await sb
    .from('materials')
    .select('*, chapters(*)')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(materials || []);
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const body = await req.json();
  const { fileName, storagePath, totalPages, chapters, materialId } = body;

  const sb = userClient(auth.token);

  if (materialId && chapters) {
    for (const ch of chapters as Array<Record<string, unknown>>) {
      const { error } = await sb.from('chapters').upsert({
        id: ch.id,
        material_id: materialId,
        user_id: auth.user.id,
        title: ch.title,
        printed_page_start: ch.printed_page_start ?? ch.pdf_page_start,
        pdf_page_start: ch.pdf_page_start,
        pdf_page_end: ch.pdf_page_end,
        indexed: ch.indexed ?? false,
        text_blob: ch.text_blob ?? {},
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await sb
      .from('materials')
      .update({ indexed_at: new Date().toISOString() })
      .eq('id', materialId);
    return NextResponse.json({ ok: true, materialId });
  }

  const { data: mat, error: matErr } = await sb
    .from('materials')
    .insert({
      user_id: auth.user.id,
      file_name: fileName || 'livro.pdf',
      storage_path: storagePath,
      total_pages: totalPages || 0,
    })
    .select()
    .single();

  if (matErr) return NextResponse.json({ error: matErr.message }, { status: 500 });

  if (Array.isArray(chapters) && chapters.length) {
    const rows = chapters.map((ch: Record<string, unknown>) => ({
      material_id: mat.id,
      user_id: auth.user.id,
      title: ch.title,
      printed_page_start: ch.printed_page_start ?? ch.pdf_page_start,
      pdf_page_start: ch.pdf_page_start,
      pdf_page_end: ch.pdf_page_end,
      indexed: false,
    }));
    const { error: chErr } = await sb.from('chapters').insert(rows);
    if (chErr) return NextResponse.json({ error: chErr.message }, { status: 500 });
  }

  return NextResponse.json(mat, { status: 201 });
}
