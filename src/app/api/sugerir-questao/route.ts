import { NextResponse } from 'next/server';
import { toImageDataUrl } from '@/lib/server/image-mime';
import {
  assertOpenRouterConfigured,
  fetchOpenRouterPedagia,
  readOpenRouterErrorResponse,
} from '@/lib/server/openrouter';
import { parseSuggestQuestionJson, parseSuggestQuestionText } from '@/lib/server/suggest';
import { requireUser } from '@/lib/server/supabase';

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const { imageId, imageBase64, srcHint, disc, serie, caption, pageNumber, storagePath } =
    await req.json();
  if (!imageId) return NextResponse.json({ error: 'imageId não fornecido.' }, { status: 400 });
  if (!imageBase64) return NextResponse.json({ error: 'Imagem não fornecida.' }, { status: 400 });

  const disciplina = disc || 'disciplina';
  const serie_ = serie || 'ensino médio';
  const fonteInfo = srcHint || caption
    ? `Fonte visível na imagem: "${srcHint || caption}". Use EXATAMENTE essa fonte no enunciado, se aplicável.`
    : 'Sem fonte visível — NÃO invente fonte.';

  const prompt = `Você elabora avaliação escolar alinhada à BNCC (${disciplina} — ${serie_}).
Analise a imagem (página ${pageNumber || '?'}) e crie UMA questão de múltipla escolha.

${fonteInfo}

REGRAS OBRIGATÓRIAS (BNCC — avaliação escolar, NÃO estilo ENEM/vestibular):
- A figura será impressa ACIMA do enunciado — o statement é só texto (contexto + comando), sem descrever pixels.
- Use comandos como: "Assinale a alternativa correta", "De acordo com o gráfico/mapa", "Observe a figura e responda".
- Responda APENAS com JSON válido (sem markdown, sem texto antes ou depois).
- O campo "imageId" DEVE ser exatamente: "${imageId}"
- O "statement" contextualiza e pergunta; cite a fonte no final do enunciado se houver (texto da Fonte:).
- NUNCA use [IMAGEM], [Imagem 1] ou placeholder de imagem.
- Exatamente 5 alternativas com letras a, b, c, d, e em minúsculas (todas plausíveis; uma só correta).
- "correctAnswer" é APENAS a letra (a, b, c, d ou e) da alternativa correta conforme a figura — varie a letra; nunca fixe sempre a mesma.

Formato (substitua ... pelo conteúdo real; correctAnswer = letra da alternativa certa):
{
  "imageId": "${imageId}",
  "statement": "...",
  "alternatives": [
    {"letter":"a","text":"..."},
    {"letter":"b","text":"..."},
    {"letter":"c","text":"..."},
    {"letter":"d","text":"..."},
    {"letter":"e","text":"..."}
  ],
  "correctAnswer": "a"
}`;

  try {
    assertOpenRouterConfigured();
    const resp = await fetchOpenRouterPedagia({
      task: 'suggest_question',
      stream: false,
      temperature: 0.65,
      max_tokens: 700,
      user: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: { url: toImageDataUrl(String(imageBase64), storagePath || '') },
        },
      ],
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: await readOpenRouterErrorResponse(resp) },
        { status: resp.status === 401 ? 503 : 502 },
      );
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    const parsed =
      parseSuggestQuestionJson(raw, imageId) || parseSuggestQuestionText(raw, imageId);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Não foi possível interpretar a questão gerada pela IA.' },
        { status: 502 },
      );
    }
    if (parsed.imageId !== imageId) {
      return NextResponse.json({ error: 'A IA retornou uma questão para outra imagem.' }, { status: 500 });
    }
    if (/\[\s*imagem|imagem\s*\d+/i.test(parsed.statement)) {
      return NextResponse.json(
        { error: 'Enunciado contém placeholder de imagem — regenere a sugestão.' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      imageId,
      question: {
        statement: parsed.statement,
        alternatives: parsed.alternatives,
        correctAnswer: parsed.correctAnswer,
      },
      questao: parsed.statement,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro';
    const config = /OPENROUTER_API_KEY|OpenRouter/i.test(msg);
    return NextResponse.json({ error: msg }, { status: config ? 503 : 500 });
  }
}
