import { NextResponse } from 'next/server';
import { guessImageMime } from '@/lib/server/image-mime';
import { requireUser, userClient } from '@/lib/server/supabase';

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const { storagePath } = await req.json();
  if (!storagePath || typeof storagePath !== 'string') {
    return NextResponse.json({ error: 'storagePath obrigatório.' }, { status: 400 });
  }
  if (!storagePath.startsWith(`${auth.user.id}/`)) {
    return NextResponse.json({ error: 'Caminho não permitido.' }, { status: 403 });
  }

  const sb = userClient(auth.token);
  const { data, error } = await sb.storage.from('pedagia').download(storagePath);
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Não foi possível baixar a imagem.' },
      { status: 404 },
    );
  }

  const buf = Buffer.from(await data.arrayBuffer());
  const base64 = buf.toString('base64');
  const mime = data.type || guessImageMime(base64, storagePath);

  return NextResponse.json({ base64, mime });
}
