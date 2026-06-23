import type { TeacherProfile, TeacherSampleExam } from '@/lib/teacher-profile/types';

/** Limite por amostra no storage (evita estourar builder_state no Supabase). */
export const SAMPLE_TEXT_STORAGE_MAX = 14_000;

/** Mínimo de caracteres para considerar amostra válida na análise. */
export const SAMPLE_TEXT_MIN = 40;

export function sanitizeSampleExams(samples: TeacherSampleExam[]): TeacherSampleExam[] {
  if (!Array.isArray(samples)) return [];
  return samples
    .slice(-8)
    .map((s) => ({
      id: String(s.id || `s_${Date.now()}`),
      fileName: String(s.fileName || 'prova.docx').slice(0, 200),
      textPreview: String(s.textPreview || '').trim().slice(0, SAMPLE_TEXT_STORAGE_MAX),
      uploadedAt: s.uploadedAt || new Date().toISOString(),
    }))
    .filter((s) => s.textPreview.length >= SAMPLE_TEXT_MIN);
}

export function sanitizeTeacherProfile(profile: TeacherProfile): TeacherProfile {
  const wp = profile.writingProfile;
  const writingProfile =
    wp && typeof wp === 'object'
      ? {
          ...wp,
          summary: String(wp.summary || '').slice(0, 2000),
          tone: String(wp.tone || '').slice(0, 1000),
          vocabulary: String(wp.vocabulary || '').slice(0, 2000),
          structure: String(wp.structure || '').slice(0, 2000),
          promptBlock: String(wp.promptBlock || '').slice(0, 6000),
        }
      : null;

  return {
    displayName: String(profile.displayName || '').slice(0, 200),
    subjects: String(profile.subjects || '').slice(0, 400),
    bio: String(profile.bio || '').slice(0, 2000),
    sampleExams: sanitizeSampleExams(profile.sampleExams || []),
    writingProfile,
    updatedAt: profile.updatedAt,
  };
}

export function collectSampleTexts(samples: TeacherSampleExam[]): string[] {
  return sanitizeSampleExams(samples).map((s) => s.textPreview);
}
