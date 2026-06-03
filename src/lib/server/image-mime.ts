/** Detecta MIME a partir do base64 ou extensão do arquivo. */
export function guessImageMime(base64: string, fileHint?: string): string {
  const hint = (fileHint || '').toLowerCase();
  if (hint.endsWith('.png')) return 'image/png';
  if (hint.endsWith('.webp')) return 'image/webp';
  if (hint.endsWith('.jpg') || hint.endsWith('.jpeg')) return 'image/jpeg';

  const raw = base64.replace(/^data:[^;]+;base64,/, '').trim();
  if (raw.startsWith('/9j/')) return 'image/jpeg';
  if (raw.startsWith('iVBORw0KGgo')) return 'image/png';
  if (raw.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

export function toImageDataUrl(base64: string, fileHint?: string): string {
  const raw = base64.replace(/^data:[^;]+;base64,/, '').trim();
  const mime = guessImageMime(raw, fileHint);
  return `data:${mime};base64,${raw}`;
}
