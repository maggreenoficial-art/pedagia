import type { SupabaseClient } from '@supabase/supabase-js';
import type { TeacherProfile } from '@/lib/teacher-profile/types';
import { EMPTY_TEACHER_PROFILE } from '@/lib/teacher-profile/types';
import { sanitizeTeacherProfile } from '@/lib/teacher-profile/sanitize';
import { formatDbError } from '@/lib/server/db-error';

const PROFILE_KEY = '__teacherProfile';

function readProfileFromRaw(raw: unknown): TeacherProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<TeacherProfile>;
  const hasData =
    !!String(p.displayName || '').trim() ||
    !!String(p.subjects || '').trim() ||
    !!String(p.bio || '').trim() ||
    (Array.isArray(p.sampleExams) && p.sampleExams.length > 0) ||
    (p.writingProfile && typeof p.writingProfile === 'object');
  if (!hasData) return null;
  return {
    displayName: String(p.displayName || ''),
    subjects: String(p.subjects || ''),
    bio: String(p.bio || ''),
    sampleExams: Array.isArray(p.sampleExams) ? p.sampleExams : [],
    writingProfile:
      p.writingProfile && typeof p.writingProfile === 'object'
        ? (p.writingProfile as TeacherProfile['writingProfile'])
        : null,
    updatedAt: p.updatedAt ? String(p.updatedAt) : undefined,
  };
}

function readProfileFromBuilderState(builderState: unknown): TeacherProfile {
  if (!builderState || typeof builderState !== 'object') return { ...EMPTY_TEACHER_PROFILE };
  const root = builderState as Record<string, unknown>;
  return readProfileFromRaw(root[PROFILE_KEY]) || { ...EMPTY_TEACHER_PROFILE };
}

export async function getTeacherProfile(sb: SupabaseClient, userId: string): Promise<TeacherProfile> {
  const { data, error } = await sb
    .from('pedagia_workspace')
    .select('teacher_profile, builder_state')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (/teacher_profile/i.test(formatDbError(error))) {
      const legacy = await sb
        .from('pedagia_workspace')
        .select('builder_state')
        .eq('user_id', userId)
        .maybeSingle();
      if (legacy.error) throw legacy.error;
      return readProfileFromBuilderState(legacy.data?.builder_state);
    }
    throw error;
  }

  const fromColumn = readProfileFromRaw(data?.teacher_profile);
  if (fromColumn) return fromColumn;
  return readProfileFromBuilderState(data?.builder_state);
}

async function saveToTeacherProfileColumn(
  sb: SupabaseClient,
  userId: string,
  profile: TeacherProfile,
): Promise<void> {
  const { error } = await sb.from('pedagia_workspace').upsert(
    {
      user_id: userId,
      teacher_profile: profile,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

async function patchProfileKeyRpc(
  sb: SupabaseClient,
  userId: string,
  profile: TeacherProfile,
): Promise<void> {
  const { error } = await sb.rpc('pedagia_patch_builder_state_key', {
    p_user_id: userId,
    p_key: PROFILE_KEY,
    p_value: profile,
  });
  if (error) throw error;
}

async function patchProfileKeyFallback(
  sb: SupabaseClient,
  userId: string,
  profile: TeacherProfile,
): Promise<void> {
  const { data: existing, error: readErr } = await sb
    .from('pedagia_workspace')
    .select('builder_state')
    .eq('user_id', userId)
    .maybeSingle();
  if (readErr) throw readErr;

  const builderState =
    existing?.builder_state && typeof existing.builder_state === 'object'
      ? { ...(existing.builder_state as Record<string, unknown>) }
      : {};

  builderState[PROFILE_KEY] = profile;

  const { error } = await sb.from('pedagia_workspace').upsert(
    {
      user_id: userId,
      builder_state: builderState,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

function isMissingColumnError(msg: string): boolean {
  return /teacher_profile/i.test(msg) && /column|does not exist|42703/i.test(msg);
}

function isMissingRpcError(msg: string): boolean {
  return /pedagia_patch_builder_state_key/i.test(msg) || /function.*does not exist/i.test(msg);
}

export async function saveTeacherProfile(
  sb: SupabaseClient,
  userId: string,
  profile: TeacherProfile,
): Promise<TeacherProfile> {
  const next = sanitizeTeacherProfile({
    ...profile,
    updatedAt: new Date().toISOString(),
  });

  try {
    await saveToTeacherProfileColumn(sb, userId, next);
    return next;
  } catch (colErr) {
    const colMsg = formatDbError(colErr);
    if (!isMissingColumnError(colMsg)) {
      throw new Error(colMsg);
    }
  }

  try {
    await patchProfileKeyRpc(sb, userId, next);
    return next;
  } catch (rpcErr) {
    const rpcMsg = formatDbError(rpcErr);
    if (!isMissingRpcError(rpcMsg)) {
      throw new Error(rpcMsg);
    }
  }

  try {
    await patchProfileKeyFallback(sb, userId, next);
    return next;
  } catch (fallbackErr) {
    const fbMsg = formatDbError(fallbackErr);
    if (/too large|payload|size|limit/i.test(fbMsg)) {
      throw new Error(
        'Não foi possível salvar o perfil. Rode supabase/schema-profile.sql no Supabase (SQL Editor) e tente de novo.',
      );
    }
    throw new Error(fbMsg);
  }
}
