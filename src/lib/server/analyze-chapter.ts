import type { ChapterBrief } from '@/lib/services/exam-generation/chapterContent';
import { smartTruncateChapterText } from '@/lib/services/exam-generation/chapterContent';

export function buildAnalyzeChapterPrompt(
  chapterTitle: string,
  serie: string,
  disciplina: string,
  pagesText: string,
): string {
  const excerpt = smartTruncateChapterText(pagesText, 18_000);
  return `Você é professor de ${disciplina || 'Geografia'} (${serie || 'ensino fundamental II'}) elaborando AV1º BGEO.

Leia o TEXTO DO CAPÍTULO abaixo e produza um mapa para outro professor montar questões inteligentes (não genéricas).

Capítulo: ${chapterTitle || 'sem título'}

Responda APENAS com JSON válido (sem markdown):
{
  "concepts": ["5 a 8 conceitos-chave definidos ou discutidos no texto"],
  "subtopics": ["4 a 6 subtemas ou seções lógicas do capítulo"],
  "dataAndSources": ["dados, percentuais, datas ou fontes citáveis que aparecem no texto"],
  "questionAngles": ["6 a 10 ideias de questão específicas ligadas ao texto, ex: interpretar trecho sobre X, comparar Y e Z"]
}

Regras:
- Extraia SOMENTE do texto — não invente tema ausente.
- questionAngles devem ser específicas (mencionar fenômeno do capítulo), não "pergunta sobre geografia".

TEXTO DO CAPÍTULO:
${excerpt}`;
}

export function parseChapterBrief(
  raw: string,
  title: string,
  pages: number[],
): ChapterBrief | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const o = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const arr = (v: unknown) =>
      Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 12) : [];
    return {
      title,
      pages,
      concepts: arr(o.concepts),
      subtopics: arr(o.subtopics),
      dataAndSources: arr(o.dataAndSources),
      questionAngles: arr(o.questionAngles),
    };
  } catch {
    return null;
  }
}
