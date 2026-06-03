import { NextResponse } from 'next/server';
import { requireUser, userClient } from '@/lib/server/supabase';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  const { id } = await ctx.params;

  const { error } = await userClient(auth.token)
    .from('saved_exercises')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
