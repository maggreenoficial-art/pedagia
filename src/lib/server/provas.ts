export function buildProvaRow(userId: string, body: Record<string, unknown>) {
  const {
    disciplina,
    serie,
    conteudo,
    tipo,
    dificuldade,
    num_questoes,
    prova_text,
    gabarito_text,
    escola,
    professor,
    cabecalho,
    builder_snapshot,
    exam_model,
  } = body;

  const row: Record<string, unknown> = {
    user_id: userId,
    disciplina: String(disciplina || '').trim() || 'Sem disciplina',
    serie: String(serie || '').trim() || '—',
    conteudo:
      String(conteudo || '').trim() ||
      String(prova_text || '').slice(0, 120).trim() ||
      'Prova gerada',
    tipo: tipo || 'Prova',
    dificuldade: dificuldade || 'medio',
    num_questoes: Number(num_questoes) || 10,
    prova_text: String(prova_text || ''),
    gabarito_text: gabarito_text ? String(gabarito_text) : '',
    escola: escola || null,
    professor: professor || null,
  };

  if (cabecalho && typeof cabecalho === 'object') row.cabecalho = cabecalho;
  if (builder_snapshot && typeof builder_snapshot === 'object') row.builder_snapshot = builder_snapshot;
  if (exam_model && typeof exam_model === 'object') row.exam_model = exam_model;

  return row;
}
