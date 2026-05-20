export const SUPABASE_URL = process.env.SUPABASE_URL || '';
export const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
export const OR_MODEL = 'anthropic/claude-haiku-4-5';

export function assertServerEnv() {
  const missing = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'OPENROUTER_API_KEY'].filter(
    (k) => !process.env[k],
  );
  if (missing.length) {
    throw new Error(`Variáveis ausentes: ${missing.join(', ')}`);
  }
}
