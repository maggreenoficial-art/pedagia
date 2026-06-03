import { OPENROUTER_API_KEY, OR_MODEL } from '@/lib/server/env';
import {
  buildPedagiaMessages,
  type PedagiaTaskKind,
} from '@/lib/services/pedagogia/master-prompt';

export { OR_MODEL };

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function getOpenRouterConfigError(): string | null {
  const key = OPENROUTER_API_KEY;
  if (!key) {
    return 'OPENROUTER_API_KEY não está no .env do servidor. Crie uma chave em openrouter.ai/keys e reinicie o npm run dev.';
  }
  if (/x{4,}/i.test(key) || key.includes('xxxxxxxx')) {
    return 'OPENROUTER_API_KEY ainda é o valor de exemplo no .env. Substitua pela chave real da OpenRouter.';
  }
  if (!/^sk-or-v1-/i.test(key) && !/^sk-or-/i.test(key)) {
    return 'OPENROUTER_API_KEY parece inválida (esperado formato sk-or-v1-...). Use uma chave de API, não de gerenciamento.';
  }
  return null;
}

export function isOpenRouterConfigured(): boolean {
  return getOpenRouterConfigError() === null;
}

export function assertOpenRouterConfigured(): void {
  const err = getOpenRouterConfigError();
  if (err) throw new Error(err);
}

export function openRouterHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'X-Title': 'PedagIA',
  };
}

/** OpenRouter devolve 401 "User not found" para chave inválida/expirada (mensagem enganosa). */
export function formatOpenRouterHttpError(status: number, body: string): string {
  let message = '';
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    message = parsed?.error?.message || parsed?.message || '';
  } catch {
    message = body.slice(0, 200);
  }

  if (
    status === 401 ||
    /user not found/i.test(message) ||
    /missing authentication/i.test(message) ||
    /invalid.*api.*key/i.test(message)
  ) {
    return (
      'Chave OpenRouter inválida, expirada ou incorreta. ' +
      'Gere uma nova em openrouter.ai/keys (tipo API, não management), ' +
      'cole em OPENROUTER_API_KEY no arquivo .env e reinicie o servidor (npm run dev).'
    );
  }
  if (status === 402 || /insufficient|credit|balance|payment/i.test(message)) {
    return 'Sem créditos na OpenRouter. Adicione saldo em openrouter.ai/settings/credits.';
  }

  return message || `Erro na OpenRouter (HTTP ${status}).`;
}

export async function readOpenRouterErrorResponse(resp: Response): Promise<string> {
  const text = await resp.text();
  return formatOpenRouterHttpError(resp.status, text);
}

export async function fetchOpenRouterBody(body: Record<string, unknown>): Promise<Response> {
  assertOpenRouterConfigured();
  return fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify(body),
  });
}

export async function fetchOpenRouter(body: Record<string, unknown>): Promise<Response> {
  return fetchOpenRouterBody({ model: OR_MODEL, ...body });
}

export async function fetchOpenRouterPedagia(opts: {
  user: string | unknown[];
  task?: PedagiaTaskKind;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  model?: string;
}): Promise<Response> {
  return fetchOpenRouterBody({
    model: opts.model ?? OR_MODEL,
    stream: opts.stream ?? false,
    max_tokens: opts.max_tokens,
    temperature: opts.temperature,
    messages: buildPedagiaMessages(opts.user, opts.task ?? 'general'),
  });
}
