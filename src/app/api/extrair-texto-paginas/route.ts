import { NextResponse } from 'next/server';
import { toImageDataUrl } from '@/lib/server/image-mime';
import {
  assertOpenRouterConfigured,
  fetchOpenRouterPedagia,
  readOpenRouterErrorResponse,
} from '@/lib/server/openrouter';
import { requireUser } from '@/lib/server/supabase';

export const maxDuration = 120;

type PageInput = { pageNumber?: number; imageBase64?: string };

function parseVisionPagesJson(raw: string, expected: number[]): { pageNumber: number; text: string }[] {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      pages?: { pageNumber?: number; text?: string }[];
      pageNumber?: number;
      text?: string;
    };
    if (Array.isArray(parsed.pages)) {
      return parsed.pages
        .map((p, i) => ({
          pageNumber: Number(p.pageNumber ?? expected[i] ?? i + 1),
          text: String(p.text || '').trim(),
        }))
        .filter((p) => Number.isFinite(p.pageNumber));
    }
    if (parsed.text != null) {
      return [{ pageNumber: Number(parsed.pageNumber ?? expected[0] ?? 1), text: String(parsed.text).trim() }];
    }
  } catch {
    /* fallback abaixo */
  }

  return expected.map((pageNumber) => ({ pageNumber, text: trimmed.replace(/^```[\s\S]*?\n|```$/g, '').trim() }));
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const { pages, disc, serie } = (await req.json()) as { pages?: PageInput[]; disc?: string; serie?: string };
  if (!Array.isArray(pages) || !pages.length) {
    return NextResponse.json({ error: 'Informe ao menos uma página (pages).' }, { status: 400 });
  }

  const batch = pages.slice(0, 3).filter((p) => p?.imageBase64);
  if (!batch.length) {
    return NextResponse.json({ error: 'Nenhuma imagem válida nas páginas.' }, { status: 400 });
  }

  const disciplina = disc || 'disciplina';
  const serie_ = serie || 'ensino médio';
  const pageNumbers = batch.map((p, i) => Number(p.pageNumber ?? i + 1));

  const pageList = pageNumbers.map((n) => `página ${n}`).join(', ');
  const prompt = `Você transcreve páginas de livro didático para avaliação escolar (${disciplina} — ${serie_}).
Há ${batch.length} imagem(ns), uma por página (${pageList}), na ordem enviada.

Para CADA imagem, transcreva TODO o texto legível: títulos, parágrafos, legendas, notas de rodapé.
Preserve a ordem de leitura. Use \\n entre blocos.
NÃO invente conteúdo. Se ilegível, use [ilegível].
NÃO descreva figuras em detalhe — apenas legendas e textos visíveis.

Responda APENAS com JSON válido (sem markdown):
{"pages":[{"pageNumber":${pageNumbers[0]},"text":"..."}${pageNumbers.length > 1 ? `,{"pageNumber":${pageNumbers[1]},"text":"..."}` : ''}${pageNumbers.length > 2 ? `,{"pageNumber":${pageNumbers[2]},"text":"..."}` : ''}]}`;

  const userContent: unknown[] = [{ type: 'text', text: prompt }];
  for (const pg of batch) {
    userContent.push({
      type: 'image_url',
      image_url: { url: toImageDataUrl(String(pg.imageBase64)) },
    });
  }

  try {
    assertOpenRouterConfigured();
    const resp = await fetchOpenRouterPedagia({
      task: 'general',
      stream: false,
      temperature: 0.05,
      max_tokens: 6000,
      user: userContent,
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: await readOpenRouterErrorResponse(resp) },
        { status: resp.status === 401 ? 503 : 502 },
      );
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    const parsed = parseVisionPagesJson(raw, pageNumbers);

    const byNum = new Map(parsed.map((p) => [p.pageNumber, p.text]));
    const results = pageNumbers.map((pageNumber) => ({
      pageNumber,
      text: byNum.get(pageNumber) || '',
    }));

    const pagesText = results.map((p) => `[Página ${p.pageNumber}]\n${p.text}\n`).join('\n');

    return NextResponse.json({ pages: results, pagesText });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao ler páginas com IA.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
