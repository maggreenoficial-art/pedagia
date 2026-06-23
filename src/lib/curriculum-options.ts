/** Opções padronizadas para produção escolar (EF + EM). */

export const DISCIPLINAS = [
  'Artes',
  'Biologia',
  'Ciências',
  'Educação Física',
  'Filosofia',
  'Física',
  'Geografia',
  'História',
  'Inglês',
  'Literatura',
  'Língua Portuguesa',
  'Matemática',
  'Química',
  'Redação',
  'Sociologia',
  'Outra',
] as const;

export const SERIES = [
  '1º ano EF',
  '2º ano EF',
  '3º ano EF',
  '4º ano EF',
  '5º ano EF',
  '6º ano EF',
  '7º ano EF',
  '8º ano EF',
  '9º ano EF',
  '1º ano EM',
  '2º ano EM',
  '3º ano EM',
  'EJA',
  'Outra',
] as const;

export type DisciplinaOption = (typeof DISCIPLINAS)[number];
export type SerieOption = (typeof SERIES)[number];
