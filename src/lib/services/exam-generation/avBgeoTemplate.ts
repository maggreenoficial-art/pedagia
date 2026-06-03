import type { ExamTemplateModel } from '@/lib/exam/types';

/**
 * Métricas das provas AV1º BGEO (1º–3º, 8º e 9º ano):
 * - 17–21 questões, predominantemente múltipla escolha (a–e)
 * - ~12–18% discursivas com linhas para resposta
 * - Cabeçalho institucional + 2 colunas (layout no export)
 * - Figuras via blocos do builder (não no texto da IA)
 */
export function getAvBgeoTemplate(totalQuestions: number, serie?: string): ExamTemplateModel {
  const total = Math.min(30, Math.max(8, Math.round(totalQuestions) || 18));

  let disc = Math.max(2, Math.round(total * 0.15));
  if (total <= 10) disc = Math.max(1, Math.round(total * 0.12));
  if (disc >= total) disc = Math.max(1, total - 5);
  const mc = total - disc;

  const serieHint = (serie || '').toLowerCase();
  let typicalTotal = 18;
  if (/^1º|^1o|1\s*ano/i.test(serieHint)) typicalTotal = 19;
  else if (/^2º|^2o|2\s*ano/i.test(serieHint)) typicalTotal = 17;
  else if (/^3º|^3o|3\s*ano/i.test(serieHint)) typicalTotal = 15;
  else if (/8º|8o|8\s*ano/i.test(serieHint)) typicalTotal = 21;
  else if (/9º|9o|9\s*ano/i.test(serieHint)) typicalTotal = 20;

  return {
    questionCount: total,
    types: [
      { type: 'multiple_choice', count: mc },
      { type: 'discursive', count: disc },
    ],
    numberingStyle: '1.',
    alternativeStyle: 'a)',
    hasHeader: true,
    hasAnswerLines: true,
    difficultyPattern: ['medium', 'medium', 'hard'],
    /** Metadado interno para prompts */
    typicalTotal,
    serieLabel: serie || '',
  } as ExamTemplateModel & { typicalTotal?: number; serieLabel?: string };
}

export function describeAvBgeoMix(template: ExamTemplateModel): string {
  const mc = template.types.find((t) => t.type === 'multiple_choice')?.count ?? 0;
  const disc = template.types.find((t) => t.type === 'discursive')?.count ?? 0;
  return `${mc} múltipla escolha (a–e) + ${disc} discursiva(s) com linhas de resposta`;
}
