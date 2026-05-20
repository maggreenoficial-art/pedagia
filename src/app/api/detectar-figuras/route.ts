import { NextResponse } from 'next/server';
import { DETECT_FIGURES_PROMPT, parseDetectFiguresJson } from '@/lib/server/detect-figures';
import { OPENROUTER_API_KEY, OR_MODEL } from '@/lib/server/env';
import { requireUser } from '@/lib/server/supabase';

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const { pageBase64, canvasWidth, canvasHeight, pageNumber, pageTextSummary } = await req.json();
  if (!pageBase64) {
    return NextResponse.json({ error: 'Página não fornecida.' }, { status: 400 });
  }

  const cw = Number(canvasWidth) || 800;
  const ch = Number(canvasHeight) || 1100;

  const textCtx = pageTextSummary
    ? `\nTexto extraído da página (referência de layout):\n"""\n${String(pageTextSummary).slice(0, 2500)}\n"""`
    : '';

  const prompt = `${DETECT_FIGURES_PROMPT}

Página do PDF: ${pageNumber || '?'}
Largura: ${cw}px. Altura: ${ch}px.${textCtx}`;

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
        max_tokens: 1200,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${pageBase64}` },
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
    const figures = parseDetectFiguresJson(raw, cw, ch);
    return NextResponse.json({ figures });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro' },
      { status: 500 },
    );
  }
}
