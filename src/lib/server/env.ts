export const SUPABASE_URL = process.env.SUPABASE_URL || '';
export const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
export const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
export const OR_MODEL = 'anthropic/claude-haiku-4-5';
/** Modelo com saída de imagem (OpenRouter). Legado — imagens usam Kie. */
export const OR_IMAGE_MODEL =
  (process.env.OPENROUTER_IMAGE_MODEL || 'openai/gpt-5.4-image-2').trim();
/** Kie AI — geração de imagens (docs.kie.ai) */
export const KIE_API_KEY = (process.env.KIE_API_KEY || '').trim();
export const KIE_IMAGE_MODEL =
  (process.env.KIE_IMAGE_MODEL || 'gpt-image-2-text-to-image').trim();

export function assertServerEnv() {
  const missing = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'OPENROUTER_API_KEY'].filter(
    (k) => !process.env[k],
  );
  if (missing.length) {
    throw new Error(`Variáveis ausentes: ${missing.join(', ')}`);
  }
}
