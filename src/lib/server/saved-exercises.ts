export type SavedExerciseQuestion = {
  statement: string;
  alternatives: { letter: string; text: string }[];
  correctAnswer: string;
};

export type SavedExerciseRow = {
  id: string;
  user_id: string;
  image_id: string;
  storage_path: string | null;
  image_title: string | null;
  page_number: number | null;
  disciplina: string | null;
  serie: string | null;
  question: SavedExerciseQuestion;
  block_id: string | null;
  created_at: string;
};

export function buildSavedExerciseRow(
  userId: string,
  body: {
    image_id: string;
    storage_path?: string;
    image_title?: string;
    page_number?: number | null;
    disciplina?: string;
    serie?: string;
    question: SavedExerciseQuestion;
    block_id?: string;
  },
) {
  const q = body.question;
  if (!q?.statement?.trim()) {
    throw new Error('Questão sem enunciado.');
  }
  if (!Array.isArray(q.alternatives) || q.alternatives.length < 2) {
    throw new Error('Questão sem alternativas válidas.');
  }
  return {
    user_id: userId,
    image_id: String(body.image_id),
    storage_path: body.storage_path || null,
    image_title: body.image_title?.trim() || null,
    page_number: body.page_number != null ? Number(body.page_number) : null,
    disciplina: body.disciplina?.trim() || null,
    serie: body.serie?.trim() || null,
    question: {
      statement: String(q.statement).trim(),
      alternatives: q.alternatives.map((a) => ({
        letter: String(a.letter).toLowerCase(),
        text: String(a.text).trim(),
      })),
      correctAnswer: String(q.correctAnswer || '').toLowerCase(),
    },
    block_id: body.block_id || null,
  };
}
