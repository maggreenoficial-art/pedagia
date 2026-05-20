import { NextResponse } from 'next/server';
import { OPENROUTER_API_KEY, OR_MODEL } from '@/lib/server/env';
import { requireUser } from '@/lib/server/supabase';

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const { text } = await req.json();
  if (!text || String(text).trim().length < 10) {
    return NextResponse.json({ error: 'Texto do sumário muito curto.' }, { status: 400 });
  }

  const prompt = `Você é um assistente especialista em análise de livros e apostilas didáticos brasileiros.

Analise o texto abaixo, extraído de páginas de sumário/índice de um livro ou apostila.
Identifique TODOS os capítulos, unidades, módulos, temas ou seções principais, com seus números de página.

RETORNE APENAS um array JSON válido, sem texto antes ou depois, no formato:
[
  {"title": "Nome completo do capítulo/unidade", "pageNum": 12}
]

REGRAS:
- Inclua apenas capítulos/unidades/módulos principais (não subseções)
- Se não houver número de página, use null
- Não inclua: prefácio, apresentação, introdução geral, bibliografia, anexos, glossário, créditos
- Mantenha os títulos exatamente como aparecem no sumário
- Se o texto não for um sumário, retorne []

TEXTO DO SUMÁRIO:
${String(text).slice(0, 5000)}`;

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
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      return NextResponse.json({ error: `OpenRouter: ${await resp.text()}` }, { status: 502 });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) {
      return NextResponse.json({ error: 'IA não retornou JSON válido.', raw: content }, { status: 422 });
    }
    return NextResponse.json({ chapters: JSON.parse(match[0]) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro' },
      { status: 500 },
    );
  }
}
