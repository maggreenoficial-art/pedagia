import type { ChapterRecord } from '@/lib/exam/types';

export interface SumarioChapterInput {
  title: string;
  printedPageStart?: number;
  pdfPageStart: number;
  pdfPageEnd?: number;
}

/** Normaliza capítulos do sumário com intervalo de páginas PDF */
export function normalizeChapters(
  chapters: SumarioChapterInput[],
  totalPdfPages: number,
): ChapterRecord[] {
  const sorted = [...chapters].sort((a, b) => a.pdfPageStart - b.pdfPageStart);
  return sorted.map((ch, i) => {
    const next = sorted[i + 1];
    const pdfPageEnd =
      ch.pdfPageEnd ??
      (next ? Math.max(ch.pdfPageStart, next.pdfPageStart - 1) : totalPdfPages);
    return {
      id: `ch_${ch.pdfPageStart}_${i}`,
      materialId: '',
      title: ch.title,
      printedPageStart: ch.printedPageStart ?? ch.pdfPageStart,
      pdfPageStart: ch.pdfPageStart,
      pdfPageEnd: Math.min(pdfPageEnd, totalPdfPages),
      indexed: false,
    };
  });
}

export function pagesForChapter(ch: ChapterRecord): number[] {
  const pages: number[] = [];
  for (let p = ch.pdfPageStart; p <= ch.pdfPageEnd; p++) pages.push(p);
  return pages;
}

export {
  parsePdfTextBoxes,
  refineFigureRectWithText,
  refineFigureRectsWithText,
  expandFigureRect,
  expandFigureRects,
  mergeOverlappingRects,
  pageHasOrphanFonte,
  isValidFigureCrop,
  filterFigureRects,
  trimWhitespaceMargins,
} from './figureBounds';
export type { FigureRect, PdfTextBox } from './figureBounds';

export function extractSourcesFromText(text: string): string[] {
  const found: string[] = [];
  const re = /[Ff]onte:\s*([^\n]{8,}(?:\n(?![A-ZÁÊÍÓÚÀÃÇ\d])[^\n]{4,}){0,3})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = m[1].replace(/\s+/g, ' ').trim();
    if (s.length > 15 && s.length < 350 && !found.includes(s)) found.push(s);
  }
  return found;
}
