import { NextResponse } from 'next/server';
import { toImageDataUrl } from '@/lib/server/image-mime';
import {
  assertOpenRouterConfigured,
  fetchOpenRouterPedagia,
  readOpenRouterErrorResponse,
} from '@/lib/server/openrouter';
import { parseSegmentImageJson } from '@/lib/server/segment-image';
import { requireUser } from '@/lib/server/supabase';

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const { imageBase64, pageNumber, textSourceHint, storagePath } = await req.json();
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
    assertOpenRouterConfigured();
    const dataUrl = toImageDataUrl(String(imageBase64), storagePath || '');
    const resp = await fetchOpenRouterPedagia({
      task: 'segment_image',
      stream: false,
      max_tokens: 500,
      temperature: 0.2,
      user: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl } },
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
    const msg = err instanceof Error ? err.message : 'Erro';
    const config = /OPENROUTER|OpenRouter/i.test(msg);
    return NextResponse.json({ error: msg }, { status: config ? 503 : 500 });
  }
}
