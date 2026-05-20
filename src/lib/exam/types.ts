/** Fonte única da verdade — prova estruturada */

export type QuestionType = 'multiple_choice' | 'discursive' | 'true_false';

export type ImageAssetType =
  | 'grafico'
  | 'tabela'
  | 'mapa'
  | 'charge'
  | 'ilustracao'
  | 'diagrama'
  | 'foto'
  | 'esquema'
  | 'pagina_inteira'
  | 'texto'
  | 'lixo'
  | 'desconhecido';

export interface ExamHeader {
  governo?: string;
  secretaria?: string;
  escola?: string;
  endereco?: string;
  cidade?: string;
  fone?: string;
  prof?: string;
  bimestre?: string;
}

export interface ExamMetadata {
  disciplina: string;
  serie: string;
  tipo?: string;
  valor?: string;
  bimestre?: string;
  dificuldade?: string;
  numQuestoesPedidas?: number;
  materialId?: string;
  chapterIds?: string[];
  scopeLabel?: string;
}

export interface ExamAlternative {
  letter: string;
  text: string;
}

export interface ExamAnswer {
  letter?: string;
  justification?: string;
}

export interface ExamSource {
  materialId?: string;
  chapterId?: string;
  page?: number;
  printedPage?: number;
}

export interface ImageAssetRef {
  imageId: string;
  storagePath?: string;
  previewUrl?: string;
  w?: number;
  h?: number;
  page?: number;
  type?: ImageAssetType;
  description?: string;
  usefulnessScore?: number;
  recommendedForQuestion?: boolean;
  isFullPage?: boolean;
}

export interface ExamQuestion {
  id: string;
  number: number;
  type: QuestionType;
  statement: string[];
  imageId?: string;
  image?: ImageAssetRef;
  alternatives: ExamAlternative[];
  answer?: ExamAnswer;
  answerLines?: number;
  source?: ExamSource;
  fromBlock?: boolean;
}

export interface GabaritoEntry {
  number: number;
  letter?: string;
  justification?: string;
}

export interface ExamModel {
  examId?: string;
  metadata: ExamMetadata;
  header: ExamHeader;
  questions: ExamQuestion[];
  gabarito: GabaritoEntry[];
  motivationalPhrase?: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
  questionNumber?: number;
  severity: 'error' | 'warning';
}

export interface BuildExamInput {
  provaText: string;
  gabText: string;
  metadata: ExamMetadata;
  header: ExamHeader;
  imageCatalog: CatalogImage[];
  imageQuestionBlocks: ImageQuestionBlock[];
  gabaritoMap?: Map<number, GabaritoEntry>;
}

export interface CatalogImage {
  imageId: string;
  pageNumber?: number;
  pageNum?: number;
  storagePath?: string;
  previewUrl?: string;
  dataUri?: string;
  dataUrl?: string;
  base64?: string;
  w?: number;
  h?: number;
  caption?: string;
  srcHint?: string;
  isFullPage?: boolean;
  type?: ImageAssetType;
  usefulnessScore?: number;
  containsTextOnly?: boolean;
  recommendedForQuestion?: boolean;
  description?: string;
  chapterId?: string;
  materialId?: string;
}

export interface ImageQuestionBlock {
  blockId?: string;
  selected?: boolean;
  imageId: string;
  image?: CatalogImage;
  question: {
    statement: string;
    alternatives: ExamAlternative[];
    correctAnswer?: string;
  };
}

export interface ChapterRecord {
  id: string;
  materialId: string;
  title: string;
  printedPageStart?: number;
  pdfPageStart: number;
  pdfPageEnd: number;
  indexed?: boolean;
}

export interface MaterialRecord {
  id: string;
  fileName: string;
  totalPages: number;
  storagePath?: string;
  chapters: ChapterRecord[];
  indexedAt?: string;
}

export interface ExamTemplateModel {
  questionCount: number;
  types: { type: QuestionType; count: number }[];
  numberingStyle: string;
  alternativeStyle: string;
  hasHeader: boolean;
  hasAnswerLines: boolean;
  difficultyPattern?: string[];
}

export interface ProcessedChapter {
  chapterId: string;
  textByPage: Record<number, string>;
  images: CatalogImage[];
}
