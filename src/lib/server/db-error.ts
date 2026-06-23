export function formatDbError(e: unknown): string {
  if (e && typeof e === 'object') {
    const err = e as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [err.message, err.details, err.hint].filter(Boolean);
    if (parts.length) return parts.join(' — ');
  }
  return e instanceof Error ? e.message : 'Erro desconhecido no banco de dados.';
}
