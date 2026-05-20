import type { ExamTemplateModel, QuestionType } from '@/lib/exam/types';

/** Analisa texto de prova modelo e extrai ExamTemplateModel */
export function extractExamTemplateFromText(examText: string): ExamTemplateModel {
  const lines = examText.split('\n').map((l) => l.trim()).filter(Boolean);
  let mc = 0;
  let disc = 0;
  let vf = 0;

  for (const line of lines) {
    if (/^[a-e]\)/i.test(line)) continue;
    if (/^\d+\./.test(line)) {
      const block = line;
      if (/verdadeiro|falso|v\s*\/\s*f/i.test(block)) vf++;
      else if (
        /produza|discorra|explique|disserte|elabore|escreva|redija|linhas/i.test(
          examText.slice(examText.indexOf(line), examText.indexOf(line) + 800),
        )
      ) {
        const after = examText.slice(examText.indexOf(line), examText.indexOf(line) + 1200);
        const altMatches = after.match(/^[a-e]\)/gim);
        if (!altMatches || altMatches.length < 3) disc++;
        else mc++;
      } else mc++;
    }
  }

  const total = Math.max(mc + disc + vf, 1);
  const types: { type: QuestionType; count: number }[] = [];
  if (mc) types.push({ type: 'multiple_choice', count: mc });
  if (vf) types.push({ type: 'true_false', count: vf });
  if (disc) types.push({ type: 'discursive', count: disc });
  if (!types.length) types.push({ type: 'multiple_choice', count: total });

  const numMatch = examText.match(/^(\d+)\./m);
  const altMatch = examText.match(/^([a-e])\)/im);

  return {
    questionCount: total,
    types,
    numberingStyle: numMatch ? `${numMatch[1]}.` : '1.',
    alternativeStyle: altMatch ? `${altMatch[1]})` : 'a)',
    hasHeader: true,
    hasAnswerLines: disc > 0,
    difficultyPattern: ['medium', 'medium', 'hard'],
  };
}
