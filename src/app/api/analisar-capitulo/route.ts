import { NextResponse } from 'next/server';
import { buildAnalyzeChapterPrompt, parseChapterBrief } from '@/lib/server/analyze-chapter';
import {
  assertOpenRouterConfigured,
  fetchOpenRouterPedagia,
  readOpenRouterErrorResponse,
} from '@/lib/server/openrouter';
import { requireUser } from '@/lib/server/supabase';

export const maxDuration = 45;

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const { chapterTitle, serie, disciplina, pages, pagesText } = await req.json();
  const text = String(pagesText || '').trim();
  if (text.length < 200) {
    return NextResponse.json(
      { error: 'Texto do capítulo muito curto. Selecione o capítulo e as páginas no Material.' },
      { status: 400 },
    );
  }

  const prompt = buildAnalyzeChapterPrompt(
    String(chapterTitle || ''),
    String(serie || ''),
    String(disciplina || 'Geografia'),
    text,
  );

  try {
    assertOpenRouterConfigured();
    const resp = await fetchOpenRouterPedagia({
      task: 'chapter_analysis',
      stream: false,
      max_tokens: 1200,
      temperature: 0.2,
      user: prompt,
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: await readOpenRouterErrorResponse(resp) },
        { status: 502 },
      );
    }

    const data = await resp.json();

    const content = data?.choices?.[0]?.message?.content || '';
    const pageNums = Array.isArray(pages)
      ? pages.map((p: unknown) => Number(p)).filter((n) => n > 0)
      : [];
    const brief = parseChapterBrief(content, String(chapterTitle || ''), pageNums);

    if (!brief) {
      return NextResponse.json({ error: 'IA não retornou mapa do capítulo.', raw: content }, { status: 502 });
    }

    return NextResponse.json({ brief });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao analisar capítulo.' },
      { status: 500 },
    );
  }
}
