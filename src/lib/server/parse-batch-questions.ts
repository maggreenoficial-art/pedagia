export type BatchQuestionType = 'multiple_choice' | 'discursive';

export interface BatchQuestionParsed {
  id: string;
  type: BatchQuestionType;
  statement: string;
  alternatives: { letter: string; text: string }[];
  correctAnswer: string;
  justification: string;
}

const LETTERS = ['a', 'b', 'c', 'd', 'e'];

function normalizeAlternatives(raw: unknown): { letter: string; text: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { letter: string; text: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const item = raw[i] as Record<string, string> | undefined;
    const letter = String(item?.letter || item?.letra || LETTERS[i]).toLowerCase();
    const text = String(item?.text || item?.texto || '').trim();
    out.push({ letter: LETTERS.includes(letter) ? letter : LETTERS[i], text });
  }
  return out;
}

function normalizeCorrect(raw: unknown): string {
  let c = String(raw ?? '')
    .toLowerCase()
    .trim();
  const m = c.match(/\b([a-e])\b/);
  if (m) return m[1];
  c = c.replace(/[^a-e]/g, '').charAt(0);
  return LETTERS.includes(c) ? c : 'a';
}

function parseOne(raw: Record<string, unknown>, index: number): BatchQuestionParsed | null {
  const statement = String(raw.statement || raw.enunciado || raw.questao || '').trim();
  if (!statement) return null;
  const typeRaw = String(raw.type || raw.tipo || 'multiple_choice').toLowerCase();
  const isDisc =
    typeRaw.includes('disc') ||
    raw.discursive === true ||
    (!raw.alternatives && !raw.alternativas && /\[discursiva\]/i.test(statement));
  const type: BatchQuestionType = isDisc ? 'discursive' : 'multiple_choice';
  const alternatives = normalizeAlternatives(raw.alternatives || raw.alternativas);
  const correctAnswer = normalizeCorrect(raw.correctAnswer ?? raw.gabarito ?? raw.resposta);
  const justification = String(raw.justification || raw.justificativa || '').trim();
  const id = String(raw.id || index + 1);
  if (type === 'multiple_choice' && alternatives.filter((a) => a.text).length < 5) {
    return null;
  }
  return {
    id,
    type,
    statement: statement.replace(/^\[DISCURSIVA\]\s*/i, '').trim(),
    alternatives,
    correctAnswer,
    justification,
  };
}

export function parseBatchQuestionsJson(raw: string): {
  questions: BatchQuestionParsed[];
  pedagogicalNote: string;
} {
  const strip = String(raw || '').trim();
  const jsonMatch = strip.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { questions: [], pedagogicalNote: '' };
  try {
    const data = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const arr = (data.questions || data.questoes || data.items) as unknown[];
    if (!Array.isArray(arr)) return { questions: [], pedagogicalNote: '' };
    const questions: BatchQuestionParsed[] = [];
    arr.forEach((item, i) => {
      if (!item || typeof item !== 'object') return;
      const q = parseOne(item as Record<string, unknown>, i);
      if (q) questions.push(q);
    });
    const pedagogicalNote = String(data.pedagogicalNote || data.notaPedagogica || '').trim();
    return { questions, pedagogicalNote };
  } catch {
    return { questions: [], pedagogicalNote: '' };
  }
}
