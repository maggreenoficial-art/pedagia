import { OPENROUTER_API_KEY, OR_MODEL } from '@/lib/server/env';
import { requireUser } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const { prompt, images } = await req.json();
  if (!prompt || typeof prompt !== 'string' || prompt.length < 20) {
    return new Response(JSON.stringify({ error: 'Prompt inválido.' }), { status: 400 });
  }

  const imgs = Array.isArray(images) ? images.slice(0, 4) : [];
  const messageContent =
    imgs.length > 0
      ? [
          { type: 'text', text: prompt },
          ...imgs.map((img: { mimeType?: string; data: string }) => ({
            type: 'image_url',
            image_url: {
              url: `data:${img.mimeType || 'image/jpeg'};base64,${img.data}`,
            },
          })),
        ]
      : prompt;

  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
      stream: true,
      max_tokens: 4096,
      messages: [{ role: 'user', content: messageContent }],
    }),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(`data: ${JSON.stringify({ error: `OpenRouter: ${errText}` })}\n\n`, {
      status: 502,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              break;
            }
            try {
              const parsed = JSON.parse(raw);
              const text = parsed.choices?.[0]?.delta?.content;
              if (text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Erro' })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
