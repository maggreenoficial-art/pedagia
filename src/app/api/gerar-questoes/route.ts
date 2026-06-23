import { NextResponse } from 'next/server';
import { parseBatchQuestionsJson } from '@/lib/server/parse-batch-questions';
import {
  assertOpenRouterConfigured,
  fetchOpenRouterPedagia,
  readOpenRouterErrorResponse,
} from '@/lib/server/openrouter';
import { requireUser } from '@/lib/server/supabase';
import { buildBatchQuestionsPrompt } from '@/lib/services/exam-generation/batchQuestionsPrompt';
import type { ExamMetadata } from '@/lib/exam/types';

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const body = await req.json();
  const contentBlock = String(body.contentBlock || '').trim();
  const count = Math.min(28, Math.max(3, Number(body.count) || 12));
  const metadata = (body.metadata || {}) as ExamMetadata;

  if (!contentBlock || contentBlock.length < 80) {
    return NextResponse.json(
      { error: 'Conteúdo insuficiente. Selecione páginas do PDF ou escreva os tópicos.' },
      { status: 400 },
    );
  }

  const prompt = buildBatchQuestionsPrompt({
    metadata,
    contentBlock,
    count,
    bnccPrefs: body.bnccPrefs,
    adapted: !!body.adapted,
    adaptationNotes: typeof body.adaptationNotes === 'string' ? body.adaptationNotes : '',
    teacherStyleBlock: typeof body.teacherStyleBlock === 'string' ? body.teacherStyleBlock : '',
  });

  try {
    assertOpenRouterConfigured();
    const resp = await fetchOpenRouterPedagia({
      task: 'exam_generation',
      stream: false,
      temperature: 0.65,
      max_tokens: 12000,
      user: prompt,
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: await readOpenRouterErrorResponse(resp) },
        { status: resp.status === 401 ? 503 : 502 },
      );
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    const { questions, pedagogicalNote } = parseBatchQuestionsJson(raw);

    if (!questions.length) {
      return NextResponse.json(
        { error: 'A IA não retornou questões em JSON válido. Tente novamente.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      questions,
      pedagogicalNote,
      count: questions.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar questões';
    const config = /OPENROUTER_API_KEY|OpenRouter/i.test(msg);
    return NextResponse.json({ error: msg }, { status: config ? 503 : 500 });
  }
}
