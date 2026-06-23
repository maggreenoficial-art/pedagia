import type { TeacherProfile } from '@/lib/teacher-profile/types';

export function buildTeacherStylePromptBlock(profile: TeacherProfile | null | undefined): string {
  if (!profile) return '';
  const parts: string[] = [];

  if (profile.displayName?.trim()) {
    parts.push(`Nome do professor: ${profile.displayName.trim()}`);
  }
  if (profile.subjects?.trim()) {
    parts.push(`Disciplinas / áreas de atuação: ${profile.subjects.trim()}`);
  }
  if (profile.bio?.trim()) {
    parts.push(`Apresentação: ${profile.bio.trim()}`);
  }

  const wp = profile.writingProfile;
  if (wp?.promptBlock?.trim()) {
    parts.push(wp.promptBlock.trim());
  } else if (wp?.summary?.trim()) {
    parts.push(`Estilo de escrita do professor: ${wp.summary.trim()}`);
    if (wp.tone?.trim()) parts.push(`Tom: ${wp.tone.trim()}`);
    if (wp.vocabulary?.trim()) parts.push(`Vocabulário típico: ${wp.vocabulary.trim()}`);
    if (wp.structure?.trim()) parts.push(`Estrutura preferida: ${wp.structure.trim()}`);
  }

  const samples = (profile.sampleExams || []).filter((s) => String(s.textPreview || '').trim().length >= 80);
  if (samples.length) {
    parts.push(
      'Provas reais enviadas pelo professor (use como referência de tom e estrutura de enunciados):',
    );
    samples.slice(0, 4).forEach((s, i) => {
      parts.push(
        `Amostra ${i + 1} (${s.fileName}):\n${String(s.textPreview).trim().slice(0, 4500)}`,
      );
    });
  }

  if (!parts.length) return '';

  return `
════════════════════════════════════════════════
PERFIL PEDAGÓGICO DO PROFESSOR (tom pessoal — OBRIGATÓRIO)
════════════════════════════════════════════════
${parts.join('\n')}

REGRAS DE ESTILO:
- Imite o tom, vocabulário e estrutura descritos acima em TODAS as questões.
- Não padronize como prova genérica de internet — deve soar como material deste professor.
- Mantenha rigor pedagógico e alinhamento BNCC; apenas o estilo de redação é personalizado.
`;
}
