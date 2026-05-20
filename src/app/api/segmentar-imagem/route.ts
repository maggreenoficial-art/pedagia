import { NextResponse } from 'next/server';
import { OPENROUTER_API_KEY, OR_MODEL } from '@/lib/server/env';
import { parseSegmentImageJson } from '@/lib/server/segment-image';
import { requireUser } from '@/lib/server/supabase';

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const { imageBase64, pageNumber, textSourceHint } = await req.json();
  if (!imageBase64) {
    return NextResponse.json({ error: 'Imagem não fornecida.' }, { status: 400 });
  }

  const hint = textSourceHint
    ? `Texto extraído da página (pode conter a fonte): """${String(textSourceHint).slice(0, 600)}"""`
    : 'Sem texto de fonte na página.';

  const prompt = `Você analisa recortes de FIGURAS COMPLETAS de livros didáticos brasileiros.

O recorte deve conter (quando existirem na imagem): título da figura, mapa/foto/gráfico, legenda, texto "Fonte:" e crédito de foto. Se algo estiver cortado na borda, mencione em description.

Tarefa:
1. Dê um nome curto (title) — use o título impresso da figura se visível.
2. Descreva o conteúdo visual (description).
3. Extraia a FONTE literal (source_text): linha "Fonte: AUTOR, obra..." ou crédito vertical (NOME/AGÊNCIA).
   - Copie como no livro. Se não houver, deixe vazio — NÃO invente.
4. Classifique image_type: grafico | tabela | mapa | foto | diagrama | texto | outro

Página PDF: ${pageNumber || '?'}

${hint}

Responda APENAS JSON válido:
{
  "title": "...",
  "description": "...",
  "source_text": "...",
  "image_type": "grafico"
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
        max_tokens: 500,
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
    const parsed = parseSegmentImageJson(raw);
    if (!parsed) {
      return NextResponse.json({ error: 'Não foi possível interpretar a segmentação.' }, { status: 502 });
    }

    let source = parsed.source_text.trim();
    if (source && !/^fonte:/i.test(source)) source = `Fonte: ${source}`;

    return NextResponse.json({
      ...parsed,
      source_text: source,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro' },
      { status: 500 },
    );
  }
}
