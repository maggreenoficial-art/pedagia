export type SegmentImageResult = {
  title: string;
  description: string;
  source_text: string;
  image_type: string;
};

export function parseSegmentImageJson(raw: string): SegmentImageResult | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const o = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      title: String(o.title || o.nome || '').trim().slice(0, 120),
      description: String(o.description || o.descricao || '').trim().slice(0, 500),
      source_text: String(o.source_text || o.fonte || o.source || '').trim().slice(0, 400),
      image_type: String(o.image_type || o.tipo || 'outro').trim().slice(0, 40),
    };
  } catch {
    return null;
  }
}
