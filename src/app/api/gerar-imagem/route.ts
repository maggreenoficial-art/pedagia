import { KIE_IMAGE_MODEL } from '@/lib/server/env';
import type { ImageGenLogEntry } from '@/lib/server/kie-images';
import { generateEducationalImage } from '@/lib/server/kie-images';
import { requireUser } from '@/lib/server/supabase';
import {
  buildImageGenerationPrompt,
  isValidImageGenCategory,
  type ImageGenCategory,
} from '@/lib/services/image-generation/prompts';

export const runtime = 'nodejs';
export const maxDuration = 120;

function sseLine(payload: object): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const body = await req.json();
  const {
    category = 'educativo',
    prompt = '',
    aspectRatio,
    disciplina,
    serie,
    title,
    stream: wantStream = true,
  } = body as {
    category?: string;
    prompt?: string;
    aspectRatio?: string;
    disciplina?: string;
    serie?: string;
    title?: string;
    stream?: boolean;
  };

  const userPrompt = String(prompt || '').trim();
  if (userPrompt.length < 8) {
    return Response.json(
      { error: 'Descreva o que deseja gerar (mínimo 8 caracteres).' },
      { status: 400 },
    );
  }
  if (userPrompt.length > 2000) {
    return Response.json({ error: 'Descrição muito longa (máx. 2000 caracteres).' }, { status: 400 });
  }

  const cat: ImageGenCategory = isValidImageGenCategory(category) ? category : 'educativo';
  const fullPrompt = buildImageGenerationPrompt({
    category: cat,
    userPrompt,
    disciplina: disciplina || undefined,
    serie: serie || undefined,
  });

  const runGeneration = async (onLog?: (entry: ImageGenLogEntry) => void) => {
    const result = await generateEducationalImage({
      prompt: fullPrompt,
      aspectRatio,
      onLog,
    });

    const suggestedTitle =
      String(title || '').trim() ||
      `${cat} — ${userPrompt.slice(0, 48)}${userPrompt.length > 48 ? '…' : ''}`;

    return {
      category: cat,
      title: suggestedTitle,
      images: result.images.map((img) => ({
        mime: img.mime,
        base64: img.base64,
        dataUrl: img.dataUrl,
      })),
      model: result.modelRequested,
      modelRequested: result.modelRequested,
      modelUsed: result.modelUsed,
      provider: result.provider,
      configuredModel: KIE_IMAGE_MODEL,
      assistantText: result.assistantText,
      log: result.log,
      usage: result.usage,
    };
  };

  if (!wantStream) {
    try {
      const payload = await runGeneration();
      return Response.json(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar imagem';
      const config = /KIE_API|Kie AI|crédito/i.test(msg);
      return Response.json({ error: msg }, { status: config ? 503 : 502 });
    }
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const push = (payload: object) => {
        controller.enqueue(encoder.encode(sseLine(payload)));
      };

      try {
        push({ type: 'start', configuredModel: KIE_IMAGE_MODEL, provider: 'kie.ai' });
        const payload = await runGeneration((entry) => {
          push({ type: 'log', ...entry });
        });
        push({ type: 'progress', percent: 100 });
        push({ type: 'done', ...payload });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao gerar imagem';
        push({ type: 'log', ts: Date.now(), level: 'error', message: msg });
        push({ type: 'error', error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
