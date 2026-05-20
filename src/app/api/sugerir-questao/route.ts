import { NextResponse } from 'next/server';
import { OPENROUTER_API_KEY, OR_MODEL } from '@/lib/server/env';
import { requireUser } from '@/lib/server/supabase';
import { parseSuggestQuestionJson, parseSuggestQuestionText } from '@/lib/server/suggest';

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const { imageId, imageBase64, srcHint, disc, serie, caption, pageNumber } = await req.json();
  if (!imageId) return NextResponse.json({ error: 'imageId não fornecido.' }, { status: 400 });
  if (!imageBase64) return NextResponse.json({ error: 'Imagem não fornecida.' }, { status: 400 });

  const disciplina = disc || 'disciplina';
  const serie_ = serie || 'ensino médio';
  const fonteInfo = srcHint || caption
    ? `Fonte visível na imagem: "${srcHint || caption}". Use EXATAMENTE essa fonte no enunciado, se aplicável.`
    : 'Sem fonte visível — NÃO invente fonte.';

  const prompt = `Você é um elaborador de provas para escola estadual brasileira.
Analise a imagem (página ${pageNumber || '?'}) e crie UMA questão de múltipla escolha para ${disciplina} — ${serie_}.

${fonteInfo}

REGRAS OBRIGATÓRIAS:
- A figura será impressa ACIMA do enunciado na prova — o statement é só texto (contexto + pergunta), sem descrever pixels da imagem.
- Responda APENAS com JSON válido (sem markdown, sem texto antes ou depois).
- O campo "imageId" DEVE ser exatamente: "${imageId}"
- O "statement" contextualiza e pergunta; cite a fonte no final do enunciado se houver (texto da Fonte:).
- NUNCA use [IMAGEM], [Imagem 1] ou placeholder de imagem.
- Exatamente 5 alternativas com letras a, b, c, d, e em minúsculas.
- "correctAnswer" é uma letra de a a e.

Formato:
{
  "imageId": "${imageId}",
  "statement": "texto do enunciado completo em texto simples",
  "alternatives": [
    {"letter":"a","text":"..."},
    {"letter":"b","text":"..."},
    {"letter":"c","text":"..."},
    {"letter":"d","text":"..."},
    {"letter":"e","text":"..."}
  ],
  "correctAnswer": "c"
}`;

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000',
        'X-Title': 'PedagIA',
      },
      body: JSON.stringify({
        model: OR_MODEL,
        stream: false,
        max_tokens: 700,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: `OpenRouter: ${(await resp.text()).slice(0, 200)}` },
        { status: 502 },
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro' },
      { status: 500 },
    );
  }
}
