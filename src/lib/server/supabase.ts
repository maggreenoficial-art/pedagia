import { createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './env';

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY);

export function userClient(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: Request) {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return { error: Response.json({ error: 'Token não fornecido.' }, { status: 401 }) };
  }
  const token = header.slice(7);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return { error: Response.json({ error: 'Token inválido ou expirado.' }, { status: 401 }) };
  }
  return { user, token };
}
