import { KIE_API_KEY, KIE_IMAGE_MODEL } from '@/lib/server/env';

const KIE_API_BASE = 'https://api.kie.ai';

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

type KieEnvelope<T> = {
  code: number;
  msg: string;
  data: T;
};

type KieTaskRecord = {
  taskId: string;
  model?: string;
  state: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
  resultJson?: string;
  failCode?: string;
  failMsg?: string;
  costTime?: number;
  creditsConsumed?: number;
};

const KIE_ASPECTS = new Set([
  'auto',
  '1:1',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '5:4',
  '4:5',
  '16:9',
  '9:16',
  '2:1',
  '1:2',
  '3:1',
  '1:3',
  '21:9',
  '9:21',
]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

export function getKieConfigError(): string | null {
  const key = KIE_API_KEY;
  if (!key) {
    return 'KIE_API_KEY não está no .env. Obtenha em https://kie.ai/api-key e reinicie npm run dev.';
  }
  if (/x{4,}/i.test(key) || key.length < 16) {
    return 'KIE_API_KEY parece inválida no .env.';
  }
  return null;
}

export function isKieConfigured(): boolean {
  return !getKieConfigError();
}

export function normalizeKieAspectRatio(value?: string): string {
  const v = (value || '4:3').trim();
  return KIE_ASPECTS.has(v) ? v : '4:3';
}

function kieErrorMessage(code: number, msg: string): string {
  if (code === 401) return 'Kie AI: chave inválida (KIE_API_KEY).';
  if (code === 402) return 'Kie AI: créditos insuficientes. Recarregue em kie.ai.';
  if (code === 429) return 'Kie AI: limite de requisições. Tente novamente em instantes.';
  return `Kie AI (${code}): ${msg || 'erro desconhecido'}`;
}

async function kieJson<T>(
  path: string,
  init?: RequestInit,
): Promise<KieEnvelope<T>> {
  assertKieConfigured();
  const resp = await fetch(`${KIE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KIE_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const json = (await resp.json().catch(() => ({}))) as KieEnvelope<T>;
  if (json.code !== 200) {
    throw new Error(kieErrorMessage(json.code ?? resp.status, json.msg || resp.statusText));
  }
  return json;
}

function assertKieConfigured() {
  const err = getKieConfigError();
  if (err) throw new Error(err);
}

function parseResultUrls(resultJson?: string): string[] {
  if (!resultJson) return [];
  try {
    const parsed = JSON.parse(resultJson) as { resultUrls?: string[]; resultUrl?: string };
    if (Array.isArray(parsed.resultUrls) && parsed.resultUrls.length) {
      return parsed.resultUrls.filter((u) => typeof u === 'string' && u.startsWith('http'));
    }
    if (typeof parsed.resultUrl === 'string' && parsed.resultUrl.startsWith('http')) {
      return [parsed.resultUrl];
    }
  } catch {
    /* ignore */
  }
  return [];
}

async function urlToExtractedImage(url: string): Promise<ExtractedImage> {
  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) {
    throw new Error(`Falha ao baixar imagem (${resp.status}).`);
  }
  const mime = (resp.headers.get('content-type') || 'image/png').split(';')[0].trim();
  const buf = Buffer.from(await resp.arrayBuffer());
  const base64 = buf.toString('base64');
  return { mime, base64, dataUrl: `data:${mime};base64,${base64}` };
}

async function createImageTask(
  prompt: string,
  aspectRatio: string,
  model: string,
): Promise<string> {
  const json = await kieJson<{ taskId: string }>('/api/v1/jobs/createTask', {
    method: 'POST',
    body: JSON.stringify({
      model,
      input: { prompt, aspect_ratio: aspectRatio },
    }),
  });
  const taskId = json.data?.taskId;
  if (!taskId) throw new Error('Kie AI não retornou taskId.');
  return taskId;
}

async function fetchTaskRecord(taskId: string): Promise<KieTaskRecord> {
  const json = await kieJson<KieTaskRecord>(
    `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { method: 'GET' },
  );
  return json.data;
}

const STATE_LABELS: Record<string, string> = {
  waiting: 'na fila',
  queuing: 'enfileirando',
  generating: 'gerando',
};

export async function generateEducationalImage(opts: {
  prompt: string;
  aspectRatio?: string;
  model?: string;
  onLog?: (entry: ImageGenLogEntry) => void;
  maxWaitMs?: number;
}): Promise<ImageGenResult> {
  const log: ImageGenLogEntry[] = [];
  const onLog = opts.onLog;
  const modelRequested = (opts.model || KIE_IMAGE_MODEL).trim();
  const aspect_ratio = normalizeKieAspectRatio(opts.aspectRatio);
  const maxWaitMs = opts.maxWaitMs ?? 110_000;

  assertKieConfigured();

  pushLog(log, onLog, 'info', `Provedor: Kie AI · modelo ${modelRequested}`);
  pushLog(log, onLog, 'info', `Proporção: ${aspect_ratio}`);

  pushLog(log, onLog, 'info', 'Criando tarefa em api.kie.ai…');
  const started = Date.now();
  const taskId = await createImageTask(opts.prompt, aspect_ratio, modelRequested);
  pushLog(log, onLog, 'ok', `Tarefa criada: ${taskId}`);

  let interval = 2500;
  let record: KieTaskRecord | null = null;

  while (Date.now() - started < maxWaitMs) {
    record = await fetchTaskRecord(taskId);
    const state = record.state;

    if (state === 'success') {
      pushLog(log, onLog, 'ok', `Concluído em ${((Date.now() - started) / 1000).toFixed(1)}s`);
      break;
    }
    if (state === 'fail') {
      const msg = record.failMsg || record.failCode || 'Geração falhou na Kie AI.';
      pushLog(log, onLog, 'error', msg);
      throw new Error(msg);
    }

    const label = STATE_LABELS[state] || state;
    pushLog(log, onLog, 'info', `Status: ${label}…`);
    await sleep(interval);
    interval = Math.min(Math.round(interval * 1.15), 8000);
  }

  if (!record || record.state !== 'success') {
    throw new Error('Tempo esgotado aguardando a Kie AI. Tente novamente.');
  }

  const urls = parseResultUrls(record.resultJson);
  pushLog(log, onLog, 'info', `URLs na resposta: ${urls.length}`);
  if (!urls.length) {
    throw new Error('Kie AI concluiu sem URL de imagem no resultado.');
  }

  pushLog(log, onLog, 'info', 'Baixando imagem gerada…');
  const images: ExtractedImage[] = [];
  for (const url of urls.slice(0, 1)) {
    images.push(await urlToExtractedImage(url));
  }

  const modelUsed = record.model || modelRequested;
  if (record.creditsConsumed != null) {
    pushLog(log, onLog, 'info', `Créditos consumidos: ${record.creditsConsumed}`);
  }

  pushLog(log, onLog, 'ok', 'Imagem pronta.');

  return {
    images,
    modelRequested,
    modelUsed,
    provider: 'kie.ai',
    log,
    usage: record.creditsConsumed != null
      ? { creditsConsumed: record.creditsConsumed, costTime: record.costTime }
      : { costTime: record.costTime },
  };
}
