import { OR_IMAGE_MODEL, OR_MODEL } from '@/lib/server/env';
import {
  assertOpenRouterConfigured,
  fetchOpenRouterBody,
  readOpenRouterErrorResponse,
} from '@/lib/server/openrouter';

export type ExtractedImage = {
  mime: string;
  base64: string;
  dataUrl: string;
};

export type ImageGenLogEntry = {
  ts: number;
  level: 'info' | 'ok' | 'warn' | 'error';
  message: string;
};

export type ImageGenResult = {
  images: ExtractedImage[];
  modelRequested: string;
  modelUsed: string;
  provider?: string;
  assistantText?: string;
  log: ImageGenLogEntry[];
  usage?: Record<string, unknown>;
};

const ALLOWED_ASPECTS = new Set([
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
]);

const TEXT_ONLY_MODEL_PATTERNS = [
  /haiku/i,
  /claude-(?!.*image)/i,
  /anthropic\/claude-(?!.*image)/i,
  /gpt-4(?!.*image)/i,
];

export function resolveImageModel(override?: string): string {
  const model = (override || OR_IMAGE_MODEL || 'openai/gpt-5.4-image-2').trim();
  if (!model) {
    throw new Error('OPENROUTER_IMAGE_MODEL não configurado no .env');
  }
  if (model === OR_MODEL) {
    throw new Error(
      `OPENROUTER_IMAGE_MODEL está igual ao modelo de texto (${OR_MODEL}). ` +
        'Defina OPENROUTER_IMAGE_MODEL=openai/gpt-5.4-image-2 no .env',
    );
  }
  const looksTextOnly =
    TEXT_ONLY_MODEL_PATTERNS.some((re) => re.test(model)) && !/image/i.test(model);
  if (looksTextOnly) {
    throw new Error(
      `O modelo "${model}" é de texto, não gera imagens. Use openai/gpt-5.4-image-2 em OPENROUTER_IMAGE_MODEL.`,
    );
  }
  return model;
}

export function normalizeAspectRatio(value?: string): string {
  const v = (value || '4:3').trim();
  return ALLOWED_ASPECTS.has(v) ? v : '4:3';
}

function pushLog(
  log: ImageGenLogEntry[],
  onLog: ((entry: ImageGenLogEntry) => void) | undefined,
  level: ImageGenLogEntry['level'],
  message: string,
) {
  const entry = { ts: Date.now(), level, message };
  log.push(entry);
  onLog?.(entry);
}

function parseDataUrl(url: string): ExtractedImage | null {
  const m = url.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!m) return null;
  return { mime: m[1], base64: m[2], dataUrl: url };
}

function collectFromMessage(message: Record<string, unknown>): ExtractedImage[] {
  const out: ExtractedImage[] = [];

  const images = message.images;
  if (Array.isArray(images)) {
    for (const item of images) {
      const rec = item as Record<string, unknown>;
      const imageUrl = rec.image_url as Record<string, string> | undefined;
      const url = imageUrl?.url || (rec.url as string) || '';
      if (typeof url === 'string' && url.startsWith('data:image')) {
        const parsed = parseDataUrl(url);
        if (parsed) out.push(parsed);
      }
    }
  }

  const content = message.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      const p = part as Record<string, unknown>;
      if (p.type === 'image_url' && p.image_url) {
        const iu = p.image_url as Record<string, string>;
        const url = iu.url || '';
        if (url.startsWith('data:image')) {
          const parsed = parseDataUrl(url);
          if (parsed) out.push(parsed);
        }
      }
    }
  } else if (typeof content === 'string' && content.includes('data:image')) {
    const match = content.match(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/i);
    if (match) {
      const parsed = parseDataUrl(match[0]);
      if (parsed) out.push(parsed);
    }
  }

  return out;
}

export function extractImagesFromChatCompletion(data: unknown): ExtractedImage[] {
  const root = data as Record<string, unknown>;
  const choices = root.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  if (!message) return [];
  return collectFromMessage(message);
}

export async function generateEducationalImage(opts: {
  prompt: string;
  aspectRatio?: string;
  model?: string;
  onLog?: (entry: ImageGenLogEntry) => void;
}): Promise<ImageGenResult> {
  const log: ImageGenLogEntry[] = [];
  const onLog = opts.onLog;

  assertOpenRouterConfigured();
  const modelRequested = resolveImageModel(opts.model);
  const aspect_ratio = normalizeAspectRatio(opts.aspectRatio);

  pushLog(log, onLog, 'info', `Modelo solicitado: ${modelRequested}`);
  pushLog(log, onLog, 'info', `Modelo de texto (provas): ${OR_MODEL} — não será usado aqui`);
  pushLog(log, onLog, 'info', `Proporção: ${aspect_ratio} · modalities: image+text`);

  const requestBody = {
    model: modelRequested,
    stream: false,
    modalities: ['image', 'text'],
    max_tokens: 4096,
    messages: [{ role: 'user', content: opts.prompt }],
    image_config: {
      aspect_ratio,
      image_size: '1K',
    },
  };

  pushLog(log, onLog, 'info', 'Enviando POST para openrouter.ai/api/v1/chat/completions…');
  const started = Date.now();

  const resp = await fetchOpenRouterBody(requestBody);

  pushLog(
    log,
    onLog,
    resp.ok ? 'info' : 'error',
    `OpenRouter respondeu HTTP ${resp.status} em ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  if (!resp.ok) {
    const errMsg = await readOpenRouterErrorResponse(resp);
    pushLog(log, onLog, 'error', errMsg);
    throw new Error(errMsg);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const modelUsed = String(data.model || modelRequested);
  const provider = data.provider != null ? String(data.provider) : undefined;
  const usage = data.usage as Record<string, unknown> | undefined;

  pushLog(log, onLog, 'ok', `Modelo cobrado pela OpenRouter: ${modelUsed}`);
  if (provider) pushLog(log, onLog, 'info', `Provider: ${provider}`);
  if (usage) {
    pushLog(
      log,
      onLog,
      'info',
      `Tokens: ${JSON.stringify(usage)}`,
    );
  }

  if (modelUsed !== modelRequested) {
    pushLog(
      log,
      onLog,
      'warn',
      `Atenção: pedido ${modelRequested}, retorno ${modelUsed}`,
    );
  }

  if (/haiku/i.test(modelUsed) && !/image/i.test(modelUsed)) {
    pushLog(
      log,
      onLog,
      'error',
      'OpenRouter usou modelo de texto (Haiku). Verifique OPENROUTER_IMAGE_MODEL e guardrails da chave.',
    );
    throw new Error(
      `A OpenRouter usou "${modelUsed}" em vez de um modelo de imagem. ` +
        'Confira OPENROUTER_IMAGE_MODEL=openai/gpt-5.4-image-2 no .env e se a chave permite esse modelo.',
    );
  }

  const images = extractImagesFromChatCompletion(data);
  pushLog(log, onLog, 'info', `Imagens extraídas da resposta: ${images.length}`);

  if (!images.length) {
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    const preview =
      typeof message?.content === 'string'
        ? message.content.slice(0, 120)
        : JSON.stringify(message || {}).slice(0, 120);
    pushLog(log, onLog, 'warn', `Resposta sem imagem. Trecho: ${preview}`);
    throw new Error(
      'A IA não retornou imagem. Confirme o modelo GPT-5.4 Image 2 na chave OpenRouter e os créditos.',
    );
  }

  const message = (data.choices as Array<Record<string, unknown>>)?.[0]
    ?.message as Record<string, unknown> | undefined;
  const assistantText =
    typeof message?.content === 'string' ? message.content.trim() : undefined;

  pushLog(log, onLog, 'ok', 'Imagem gerada com sucesso.');

  return {
    images,
    modelRequested,
    modelUsed,
    provider,
    assistantText,
    log,
    usage,
  };
}
