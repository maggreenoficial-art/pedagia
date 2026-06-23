import { NextResponse } from 'next/server';
import type { TeacherProfile } from '@/lib/teacher-profile/types';
import { getTeacherProfile, saveTeacherProfile } from '@/lib/server/teacher-profile-store';
import { sanitizeTeacherProfile } from '@/lib/teacher-profile/sanitize';
import { formatDbError } from '@/lib/server/db-error';
import { requireUser, userClient } from '@/lib/server/supabase';

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  try {
    const sb = userClient(auth.token);
    const profile = await getTeacherProfile(sb, auth.user.id);
    return NextResponse.json({ profile });
  } catch (e) {
    return NextResponse.json(
      { error: formatDbError(e) || 'Erro ao carregar perfil.' },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  try {
    const sb = userClient(auth.token);
    const body = (await req.json()) as Partial<TeacherProfile>;
    const current = await getTeacherProfile(sb, auth.user.id);
    const next = sanitizeTeacherProfile({
      displayName: String(body.displayName ?? current.displayName ?? ''),
      subjects: String(body.subjects ?? current.subjects ?? ''),
      bio: String(body.bio ?? current.bio ?? ''),
      sampleExams: Array.isArray(body.sampleExams) ? body.sampleExams : current.sampleExams,
      writingProfile:
        body.writingProfile !== undefined ? body.writingProfile : current.writingProfile,
    });
    const saved = await saveTeacherProfile(sb, auth.user.id, next);
    return NextResponse.json({ profile: saved });
  } catch (e) {
    return NextResponse.json(
      { error: formatDbError(e) || 'Erro ao salvar perfil.' },
      { status: 500 },
    );
  }
}
