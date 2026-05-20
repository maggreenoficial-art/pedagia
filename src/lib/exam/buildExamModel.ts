import { parseGabaritoText, parseProvaText } from './parse';
import type {
  BuildExamInput,
  CatalogImage,
  ExamModel,
  ExamQuestion,
  ImageQuestionBlock,
  ImageAssetRef,
} from './types';

function catalogToRef(img: CatalogImage): ImageAssetRef {
  return {
    imageId: img.imageId,
    storagePath: img.storagePath,
    previewUrl: img.previewUrl || img.dataUri || img.dataUrl,
    w: img.w,
    h: img.h,
    page: img.pageNumber || img.pageNum,
    type: img.type,
    description: img.description,
    usefulnessScore: img.usefulnessScore,
    recommendedForQuestion: img.recommendedForQuestion,
    isFullPage: img.isFullPage,
  };
}

function blockToQuestion(
  block: ImageQuestionBlock,
  catalog: CatalogImage[],
  number: number,
): ExamQuestion {
  const cat = catalog.find((i) => i.imageId === block.imageId);
  const img = { ...cat, ...block.image } as CatalogImage;
  return {
    id: `q_blk_${block.imageId}`,
    number,
    type: 'multiple_choice',
    statement: [block.question.statement.trim()],
    imageId: block.imageId,
    image: catalogToRef(img),
    alternatives: (block.question.alternatives || []).map((a) => ({
      letter: String(a.letter).toLowerCase(),
      text: a.text,
    })),
    answer: block.question.correctAnswer
      ? { letter: String(block.question.correctAnswer).toLowerCase() }
      : undefined,
    fromBlock: true,
    source: img.chapterId
      ? { chapterId: img.chapterId, materialId: img.materialId, page: img.pageNumber || img.pageNum }
      : { page: img.pageNumber || img.pageNum },
  };
}

function attachGabarito(questions: ExamQuestion[], gabText: string): void {
  const entries = parseGabaritoText(gabText);
  const byNum = new Map(entries.map((e) => [e.number, e]));
  for (const q of questions) {
    const g = byNum.get(q.number);
    if (g) {
      q.answer = {
        letter: g.letter || q.answer?.letter,
        justification: g.justification || q.answer?.justification,
      };
    }
  }
}

export function buildExamModel(input: BuildExamInput): ExamModel {
  const textQuestions = parseProvaText(input.provaText);
  const selectedBlocks = input.imageQuestionBlocks.filter((b) => b.selected);
  const blockQuestions = selectedBlocks.map((b, i) =>
    blockToQuestion(b, input.imageCatalog, textQuestions.length + i + 1),
  );

  const merged = [...textQuestions, ...blockQuestions].map((q, i) => ({
    ...q,
    number: i + 1,
    id: q.id || `q_${i + 1}`,
  }));

  attachGabarito(merged, input.gabText);

  return {
    metadata: input.metadata,
    header: input.header,
    questions: merged,
    gabarito: parseGabaritoText(input.gabText),
  };
}

/** Compat: formato legado usado por render antigo */
export function examModelToLegacyQuestions(exam: ExamModel) {
  return exam.questions.map((q) => ({
    number: q.number,
    statementParts: q.statement,
    image: q.image
      ? {
          ...q.image,
          imageId: q.imageId,
          base64: undefined,
        }
      : null,
    alternatives: q.alternatives,
    answerLines: q.answerLines || 0,
    fromBlock: q.fromBlock,
    imageRequired: !!q.imageId,
  }));
}
