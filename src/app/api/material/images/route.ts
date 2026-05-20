import { NextResponse } from 'next/server';
import { requireUser, userClient } from '@/lib/server/supabase';

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const body = await req.json();
  const {
    chapterId,
    imageId,
    pageNumber,
    storagePath,
    title,
    sourceText,
    description,
    imageType,
    usefulnessScore,
    recommendedForQuestion,
    isFullPage,
  } = body;

  if (!chapterId || !imageId) {
    return NextResponse.json({ error: 'chapterId e imageId são obrigatórios.' }, { status: 400 });
  }

  const sb = userClient(auth.token);
  const row: Record<string, unknown> = {
    chapter_id: chapterId,
    user_id: auth.user.id,
    image_id: imageId,
    page_number: pageNumber ?? null,
    storage_path: storagePath ?? null,
    description: description ?? null,
    image_type: imageType || 'outro',
    usefulness_score: usefulnessScore ?? 0.5,
    recommended_for_question: recommendedForQuestion ?? true,
    is_full_page: isFullPage ?? false,
  };

  if (title != null) row.title = title;
  if (sourceText != null) row.source_text = sourceText;

  const { data, error } = await sb
    .from('chapter_images')
    .upsert(row, { onConflict: 'chapter_id,image_id' })
    .select()
    .single();

  if (error) {
    if (/title|source_text/i.test(error.message)) {
      const slim = { ...row };
      delete slim.title;
      delete slim.source_text;
      const retry = await sb
        .from('chapter_images')
        .upsert(slim, { onConflict: 'chapter_id,image_id' })
        .select()
        .single();
      if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 });
      return NextResponse.json(retry.data);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
