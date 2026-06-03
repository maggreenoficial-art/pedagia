/**
 * PedagIA Core — camada compartilhada (ExamModel, serviços, render).
 * Carregada no browser via PedagiaShell → window.PedagiaCore
 */
export * from '@/lib/exam';
export * from '@/lib/services/image-catalog/classify';
export * from '@/lib/services/pdf-processing';
export * from '@/lib/services/exam-generation/prompt';
export * from '@/lib/services/exam-generation/template';
export * from '@/lib/services/pedagogia/master-prompt';

import { buildExamModel } from '@/lib/exam/buildExamModel';
import { validateExamModel, hasBlockingIssues } from '@/lib/exam/validateExamModel';
import { renderExamHtml, renderGabaritoHtml } from '@/lib/exam/render/html';
import { renderExamDocx } from '@/lib/exam/render/docx';
import { mergeExamIntoDocxTemplate } from '@/lib/exam/render/docxTemplateMerge';
import { prepareHeaderImageFromDataUrl } from '@/lib/exam/render/headerImage';
import { embedCatalogDataUris, resolveExamModelImages } from '@/lib/exam/resolveImages';
import { getAvBgeoTemplate, describeAvBgeoMix } from '@/lib/services/exam-generation/avBgeoTemplate';
import {
  getBnccExamTemplate,
  describeBnccMix,
  buildBnccPromptBlock,
  BNCC_DEFAULT_ORIENTACOES,
} from '@/lib/services/exam-generation/bnccTemplate';
import { buildTextExamPrompt } from '@/lib/services/exam-generation/prompt';
import {
  buildChapterContentBlock,
  cleanFullChapterText,
} from '@/lib/services/exam-generation/chapterContent';
import { extractExamTemplateFromText } from '@/lib/services/exam-generation/template';
import { classifyExtractedImage, applyClassification } from '@/lib/services/image-catalog/classify';
import {
  normalizeChapters,
  pagesForChapter,
  extractSourcesFromText,
  parsePdfTextBoxes,
  refineFigureRectsWithText,
  expandFigureRects,
  pageHasOrphanFonte,
  filterFigureRects,
  trimWhitespaceMargins,
} from '@/lib/services/pdf-processing';
import { splitProvaAndGabarito } from '@/lib/exam/parse';

export const PedagiaCore = {
  buildExamModel,
  validateExamModel,
  hasBlockingIssues,
  renderExamHtml,
  renderGabaritoHtml,
  renderExamDocx,
  mergeExamIntoDocxTemplate,
  prepareHeaderImageFromDataUrl,
  resolveExamModelImages,
  embedCatalogDataUris,
  buildTextExamPrompt,
  buildChapterContentBlock,
  cleanFullChapterText,
  getAvBgeoTemplate,
  describeAvBgeoMix,
  getBnccExamTemplate,
  describeBnccMix,
  buildBnccPromptBlock,
  BNCC_DEFAULT_ORIENTACOES,
  extractExamTemplateFromText,
  classifyExtractedImage,
  applyClassification,
  normalizeChapters,
  pagesForChapter,
  extractSourcesFromText,
  parsePdfTextBoxes,
  refineFigureRectsWithText,
  expandFigureRects,
  pageHasOrphanFonte,
  filterFigureRects,
  trimWhitespaceMargins,
  splitProvaAndGabarito,
};

export type PedagiaCoreApi = typeof PedagiaCore;
