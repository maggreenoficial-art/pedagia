export interface FigureRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfTextBox {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

type PdfTextItem = {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
};

const CREDIT_RE =
  /\/(REUTERS|FOTOARENA|GETTY|ISTOCK|SHUTTER|AFP|EPA)|ARQUIVO DA EDITORA|FOTOGRAFIA/i;
const FONTE_RE = /^fonte\s*:/i;
const TITLE_BAR_RE =
  /^(brasil|mundo|estados unidos|mapa|gráfico|grafico|tabela|figura|charge|foto)/i;
const PUBLISHER_TITLE_RE =
  /^[A-ZÁÉÍÓÚÃÊÔÇ0-9][\wáéíóúàãçêô\s:–—\-]{6,95}$/;
const QUESTION_RE =
  /^\d{1,2}\s*[\.\)]\s|^(analise|análise|observe|de acordo|com base|assinale|leia|responda|explique|calcule)/i;
const LESSON_NOISE_RE =
  /^(nesse|nessa|dessa|desse|portanto|assim|além|alem|explore|desigualdades|indústria|industria|coronavírus|você sabe)/i;
const MC_OPTION_RE = /^[a-eA-E]\)\s/;

/** Converte itens PDF.js para caixas em coordenadas de canvas (origem no topo). */
export function parsePdfTextBoxes(items: PdfTextItem[], viewportHeight: number): PdfTextBox[] {
  const raw: PdfTextBox[] = [];
  for (const item of items) {
    const t = (item.str || '').trim();
    if (!t) continue;
    const tr = item.transform;
    if (!tr || tr.length < 6) continue;
    const fontSize = Math.max(Math.hypot(tr[0], tr[1]), Math.hypot(tr[2], tr[3]), 8);
    const x = tr[4];
    const pdfY = tr[5];
    const y = viewportHeight - pdfY - fontSize * 0.85;
    const w = item.width && item.width > 0 ? item.width : t.length * fontSize * 0.48;
    const h = item.height && item.height > 0 ? item.height : fontSize * 1.25;
    raw.push({ x, y, w, h, text: t });
  }
  return mergeTextLines(raw);
}

function mergeTextLines(boxes: PdfTextBox[]): PdfTextBox[] {
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: PdfTextBox[] = [];
  for (const b of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      Math.abs(last.y - b.y) < 6 &&
      b.x - (last.x + last.w) < fontSizeGap(last, b)
    ) {
      last.text += (last.text.endsWith('-') ? '' : ' ') + b.text;
      const r = Math.max(last.x + last.w, b.x + b.w);
      last.w = r - last.x;
      last.h = Math.max(last.h, b.h);
    } else {
      merged.push({ ...b });
    }
  }
  return merged;
}

function fontSizeGap(a: PdfTextBox, b: PdfTextBox): number {
  return Math.max(a.h, b.h) * 2.5;
}

function rectRight(r: FigureRect) {
  return r.x + r.w;
}
function rectBottom(r: FigureRect) {
  return r.y + r.h;
}
function boxRight(b: PdfTextBox) {
  return b.x + b.w;
}
function boxBottom(b: PdfTextBox) {
  return b.y + b.h;
}

function overlapsRect(r: FigureRect, tb: PdfTextBox, pad = 8): boolean {
  const cx = tb.x + tb.w / 2;
  const cy = tb.y + tb.h / 2;
  return (
    cx >= r.x - pad &&
    cx <= r.x + r.w + pad &&
    cy >= r.y - pad &&
    cy <= r.y + r.h + pad
  );
}

function isFonteText(t: string): boolean {
  return FONTE_RE.test(t) || /\bFonte\s*:/i.test(t);
}

function isCreditText(t: string): boolean {
  return CREDIT_RE.test(t);
}

function isPublisherTitle(t: string): boolean {
  const s = t.trim();
  if (isFonteText(s) || isCreditText(s)) return false;
  if (QUESTION_RE.test(s) || MC_OPTION_RE.test(s)) return false;
  if (s.length < 8 || s.length > 120) return false;
  return (
    PUBLISHER_TITLE_RE.test(s) ||
    TITLE_BAR_RE.test(s) ||
    (s.includes(':') && s.split(/\s+/).length <= 16 && /[A-ZÁÉ]/.test(s))
  );
}

function isQuestionEnunciado(t: string): boolean {
  const s = t.trim();
  if (QUESTION_RE.test(s)) return true;
  if (/^\d{1,2}\s*[\.\)]/.test(s)) return true;
  if (s.length > 90 && /\?\s*$/.test(s)) return true;
  return false;
}

function isLessonNoise(t: string): boolean {
  const s = t.trim();
  if (isFonteText(s)) return false;
  if (LESSON_NOISE_RE.test(s)) return true;
  if (/^explore\b/i.test(s)) return true;
  if (s.length > 100 && !isPublisherTitle(s) && !isFonteText(s)) return true;
  return false;
}

/**
 * Ajusta bbox da IA/heurística para o padrão das provas manuais:
 * faixa de título + visual + Fonte/crédito — sem enunciado nem parágrafo da lição.
 */
export function refineFigureRectWithText(
  rect: FigureRect,
  textBoxes: PdfTextBox[],
  canvasW: number,
  canvasH: number,
): FigureRect {
  const related = textBoxes.filter((tb) => overlapsRect(rect, tb, 12));
  if (!related.length) return rect;

  let top = rect.y;
  let bottom = rect.y + rect.h;
  let left = rect.x;
  let right = rect.x + rect.w;

  const titles = related.filter((tb) => isPublisherTitle(tb.text));
  const fontes = related.filter((tb) => isFonteText(tb.text));
  const credits = related.filter((tb) => isCreditText(tb.text));

  if (titles.length) {
    top = Math.min(...titles.map((tb) => tb.y));
  }

  if (fontes.length) {
    bottom = Math.max(...fontes.map((tb) => boxBottom(tb))) + 6;
  } else if (titles.length) {
    const titleBottom = Math.max(...titles.map((tb) => boxBottom(tb)));
    const caption = related.filter(
      (tb) =>
        !isFonteText(tb.text) &&
        !isPublisherTitle(tb.text) &&
        !isQuestionEnunciado(tb.text) &&
        !isLessonNoise(tb.text) &&
        tb.y >= titleBottom &&
        tb.y < titleBottom + 90 &&
        tb.text.length >= 15 &&
        tb.text.length <= 140,
    );
    if (caption.length) {
      bottom = Math.max(...caption.map((tb) => boxBottom(tb))) + 4;
    }
  }

  for (const tb of credits) {
    if (tb.x > right - 40) right = Math.max(right, boxRight(tb) + 4);
    if (boxRight(tb) < left + 50) left = Math.min(left, tb.x - 4);
  }

  const visualTop = titles.length ? top : rect.y + rect.h * 0.15;

  for (const tb of related) {
    const t = tb.text.trim();
    if (boxBottom(tb) <= visualTop + 8) continue;

    if (isQuestionEnunciado(t) && tb.y < visualTop + rect.h * 0.35) {
      top = Math.max(top, boxBottom(tb) + 5);
    }

    if (isLessonNoise(t) && tb.y > bottom - 25) {
      bottom = Math.min(bottom, tb.y - 5);
    }

    if (MC_OPTION_RE.test(t) && tb.x > rect.x + rect.w * 0.55) {
      right = Math.min(right, tb.x - 6);
    }
  }

  const pad = 4;
  top = Math.max(0, top - pad);
  left = Math.max(0, left - pad);
  bottom = Math.min(canvasH, Math.max(bottom, top + 80));
  right = Math.min(canvasW, Math.max(right, left + 80));

  const w = right - left;
  const h = bottom - top;
  if (w < 80 || h < 80) return rect;
  return { x: left, y: top, w, h };
}

export function refineFigureRectsWithText(
  rects: FigureRect[],
  textBoxes: PdfTextBox[],
  canvasW: number,
  canvasH: number,
): FigureRect[] {
  return rects.map((r) => refineFigureRectWithText(r, textBoxes, canvasW, canvasH));
}

/** Expansão leve só no fallback PDF (bitmap sem bbox da IA). */
export function expandFigureRect(
  rect: FigureRect,
  textBoxes: PdfTextBox[],
  canvasW: number,
  canvasH: number,
): FigureRect {
  let { x, y, w, h } = rect;
  const bottom0 = y + h;
  const right0 = x + w;

  for (const tb of textBoxes) {
    const t = tb.text.trim();
    if (!t) continue;
    const isFonte = isFonteText(t);
    const isCredit = isCreditText(t);
    const isTitle = isPublisherTitle(t);

    const nearBelow = tb.y >= bottom0 - 20 && tb.y < bottom0 + 70;
    const nearAbove = boxBottom(tb) <= y + 25 && tb.y > y - 70;

    if (isFonte && nearBelow && overlapsRect({ x, y, w, h }, tb)) {
      h = Math.max(h, boxBottom(tb) - y + 6);
    } else if (isCredit && overlapsRect({ x, y, w, h }, tb)) {
      if (tb.x >= right0 - 30) w = Math.max(w, boxRight(tb) - x + 6);
      if (boxRight(tb) < x + 40) {
        x = Math.min(x, tb.x - 4);
        w = right0 - x + 6;
      }
    } else if (isTitle && nearAbove && overlapsRect({ x, y, w, h }, tb)) {
      y = Math.min(y, tb.y - 4);
      h = bottom0 - y;
    }
  }

  const margin = 6;
  x = Math.max(0, x - margin);
  y = Math.max(0, y - margin);
  w = Math.min(canvasW - x, w + margin * 2);
  h = Math.min(canvasH - y, h + margin * 2);
  if (w < 80 || h < 80) return rect;
  return { x, y, w, h };
}

export function expandFigureRects(
  rects: FigureRect[],
  textBoxes: PdfTextBox[],
  canvasW: number,
  canvasH: number,
): FigureRect[] {
  const expanded = rects.map((r) => expandFigureRect(r, textBoxes, canvasW, canvasH));
  return dedupeNearbyRects(expanded);
}

function boxInsideRect(r: FigureRect, tb: PdfTextBox) {
  const cx = tb.x + tb.w / 2;
  const cy = tb.y + tb.h / 2;
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
}

export function isValidFigureCrop(
  rect: FigureRect,
  canvasW: number,
  canvasH: number,
  textBoxes: PdfTextBox[] = [],
): boolean {
  const { w, h } = rect;
  if (w < 100 || h < 100) return false;
  const asp = w / h;
  if (asp > 4.2 || asp < 0.15) return false;
  if (h < canvasH * 0.06 && w > h * 2.8) return false;

  const areaRatio = (w * h) / (canvasW * canvasH);
  if (areaRatio < 0.04) return false;
  if (areaRatio > 0.82) return false;

  const inside = textBoxes.filter((tb) => boxInsideRect(rect, tb));
  const joined = inside.map((t) => t.text).join(' ');

  if (/\bexplore\b/i.test(joined)) return false;
  if (/\b[abcde]\)\s/.test(joined) && inside.length >= 2) return false;
  if (/^\d{1,2}\s*[\.\)]/.test(joined) && inside.filter((tb) => isFonteText(tb.text)).length === 0) {
    return false;
  }

  const longLesson = inside.filter(
    (tb) => tb.text.length > 130 && !isFonteText(tb.text) && !isPublisherTitle(tb.text),
  );
  if (longLesson.length >= 2) return false;

  const fonteCount = inside.filter((tb) => isFonteText(tb.text)).length;
  const titleCount = inside.filter((tb) => isPublisherTitle(tb.text)).length;
  if (inside.length >= 10 && fonteCount === 0 && titleCount === 0 && areaRatio > 0.3) return false;

  return true;
}

export function filterFigureRects(
  rects: FigureRect[],
  canvasW: number,
  canvasH: number,
  textBoxes: PdfTextBox[] = [],
): FigureRect[] {
  return dedupeNearbyRects(
    rects.filter((r) => isValidFigureCrop(r, canvasW, canvasH, textBoxes)),
  );
}

function dedupeNearbyRects(rects: FigureRect[]): FigureRect[] {
  const out: FigureRect[] = [];
  for (const r of rects) {
    if (out.some((u) => iou(r, u) > 0.72)) continue;
    out.push(r);
  }
  return out;
}

export function mergeOverlappingRects(rects: FigureRect[]): FigureRect[] {
  const out: FigureRect[] = [];
  for (const r of rects) {
    const hit = out.findIndex((u) => iou(r, u) > 0.35);
    if (hit >= 0) out[hit] = unionRect(out[hit], r);
    else out.push({ ...r });
  }
  return out;
}

function unionRect(a: FigureRect, b: FigureRect): FigureRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const r = Math.max(a.x + a.w, b.x + b.w);
  const bt = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: r - x, h: bt - y };
}

function iou(a: FigureRect, b: FigureRect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const ua = a.w * a.h + b.w * b.h - inter;
  return ua > 0 ? inter / ua : 0;
}

export function pageHasOrphanFonte(rects: FigureRect[], textBoxes: PdfTextBox[]): boolean {
  const fontes = textBoxes.filter((tb) => isFonteText(tb.text));
  if (!fontes.length) return false;
  return fontes.some((f) => {
    const fc = f.x + f.w / 2;
    const fy = f.y;
    return !rects.some((r) => {
      return (
        fc >= r.x - 30 &&
        fc <= r.x + r.w + 30 &&
        fy >= r.y - 15 &&
        fy <= r.y + r.h + 20
      );
    });
  });
}

/** Recorte fino de margens brancas dentro do bbox (após refinamento textual). */
export function trimWhitespaceMargins(
  rect: FigureRect,
  imageData: ImageData,
  threshold = 248,
): FigureRect {
  const { data, width, height } = imageData;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.floor(rect.x + rect.w));
  const y1 = Math.min(height, Math.floor(rect.y + rect.h));
  if (x1 <= x0 + 20 || y1 <= y0 + 20) return rect;

  const rowInk = (y: number) => {
    let n = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum < threshold) n++;
    }
    return n;
  };
  const colInk = (x: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++) {
      const i = (y * width + x) * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum < threshold) n++;
    }
    return n;
  };

  let t = y0;
  let b = y1 - 1;
  let l = x0;
  let r = x1 - 1;
  const minInkRow = Math.max(8, Math.floor((x1 - x0) * 0.02));
  const minInkCol = Math.max(8, Math.floor((y1 - y0) * 0.02));

  while (t < b && rowInk(t) < minInkRow) t++;
  while (b > t && rowInk(b) < minInkRow) b--;
  while (l < r && colInk(l) < minInkCol) l++;
  while (r > l && colInk(r) < minInkCol) r--;

  if (r - l < 40 || b - t < 40) return rect;
  return { x: l, y: t, w: r - l + 1, h: b - t + 1 };
}
