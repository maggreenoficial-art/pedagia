/** Prepara o texto do capítulo para geração de questões inteligentes */

export interface ChapterBrief {
  title: string;
  pages: number[];
  concepts: string[];
  subtopics: string[];
  dataAndSources: string[];
  questionAngles: string[];
}

export interface ChapterContentInput {
  bookFileName: string;
  chapterTitle: string;
  pages: number[];
  pagesText: string;
  bookSources: string[];
  imageBlocksNote?: string;
  brief?: ChapterBrief | null;
}

const DEFAULT_MAX_CHARS = 28_000;

/** Remove ruído típico de PDF escolar (número de página isolado, linhas vazias). */
export function cleanChapterPageText(raw: string): string {
  const lines = String(raw || '')
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => {
      if (!l) return false;
      if (/^\d{1,3}$/.test(l)) return false;
      if (/^p[áa]gina\s*\d+/i.test(l) && l.length < 20) return false;
      return true;
    });

  const out: string[] = [];
  let prev = '';
  for (const line of lines) {
    if (line === prev) continue;
    out.push(line);
    prev = line;
  }
  return out.join('\n');
}

export function cleanFullChapterText(pagesText: string): string {
  const parts = String(pagesText || '').split(/(?=\[Página \d+\])/);
  return parts
    .map((part) => {
      const m = part.match(/^\[Página (\d+)\]\s*/);
      const body = cleanChapterPageText(m ? part.slice(m[0].length) : part);
      if (!body.trim()) return '';
      return m ? `[Página ${m[1]}]\n${body}` : body;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** Mantém início, fim e trechos com dados/fontes quando o texto é longo demais. */
export function smartTruncateChapterText(text: string, maxChars = DEFAULT_MAX_CHARS): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;

  const headSize = Math.floor(maxChars * 0.42);
  const tailSize = Math.floor(maxChars * 0.38);
  const midBudget = maxChars - headSize - tailSize - 200;

  const head = t.slice(0, headSize);
  const tail = t.slice(-tailSize);

  const midStart = Math.floor((t.length - midBudget) / 2);
  const midChunk = t.slice(midStart, midStart + midBudget);

  const dataLines = t
    .split('\n')
    .filter(
      (l) =>
        /\d{2,}/.test(l) ||
        /fonte\s*:/i.test(l) ||
        /%\s*\d|milhões|bilhões|habitantes|km²|gráfico|tabela|mapa/i.test(l),
    )
    .slice(0, 40)
    .join('\n')
    .slice(0, Math.min(4000, midBudget));

  return (
    `${head}\n\n[… trecho central resumido …]\n${dataLines || midChunk}\n\n[… continuação do capítulo …]\n${tail}`
  );
}

export function buildChapterContentBlock(input: ChapterContentInput): string {
  const {
    bookFileName,
    chapterTitle,
    pages,
    pagesText,
    bookSources,
    imageBlocksNote = '',
    brief,
  } = input;

  const cleaned = cleanFullChapterText(pagesText);
  const body = smartTruncateChapterText(cleaned);

  const sourceBlock = bookSources.length
    ? `\nFONTES DO MATERIAL (copie literalmente quando usar):\n${bookSources.map((s) => `• ${s}`).join('\n')}\n`
    : '';

  const briefBlock = brief
    ? `
MAPA DO CAPÍTULO (leia como roteiro — questões devem nascer daqui):
Conceitos-chave: ${brief.concepts.join('; ') || '(extraia do texto)'}
Subtemas: ${brief.subtopics.join('; ') || '—'}
Dados / fontes citáveis: ${brief.dataAndSources.join('; ') || '—'}
Ângulos de questão sugeridos: ${brief.questionAngles.join('; ') || '—'}
`
    : '';

  return `
════════════════════════════════════════════════
CAPÍTULO SELECIONADO — ÚNICA FONTE DA PROVA
════════════════════════════════════════════════
Livro/Apostila: "${bookFileName}"
Capítulo: ${chapterTitle || '(informado pelo professor)'}
Páginas do PDF: ${pages.join(', ')} (${pages.length} página(s))
${imageBlocksNote}
${sourceBlock}
${briefBlock}
METODOLOGIA OBRIGATÓRIA (como professor experiente):
1. LEIA o texto do capítulo abaixo antes de escrever qualquer questão.
2. Cada questão deve avaliar conteúdo que ESTÁ no texto (conceito, dado, relação, interpretação).
3. PROIBIDO inventar tema fora do capítulo ou perguntas genéricas de "Geografia geral".
4. MC: contextualize com trecho, dado ou descrição fiel ao material; comando claro; 5 alternativas plausíveis.
5. Discursivas: peça análise, comparação ou explicação de fenômeno tratado no capítulo (mín. 8 linhas).
6. Varie os tipos: interpretação de parágrafo do livro, consequência geográfica, leitura de dado percentual, conceito definido no texto.
7. Exija interpretação e relação entre ideias do capítulo — não decoreba de definição isolada.

--- TEXTO EXTRAÍDO DO CAPÍTULO (material completo para elaboração) ---
${body}
--- FIM DO TEXTO DO CAPÍTULO ---

REGRA FINAL: Se um assunto não aparecer no texto acima, NÃO crie questão sobre ele.
Fontes só as listadas ou impressas no trecho — nunca invente IBGE/autor sem estar no material.
`;
}
