import type { ExamAlternative, ExamQuestion, GabaritoEntry, QuestionType } from './types';

export function stripMd(s: string): string {
  return String(s)
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^>\s*/, '')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

export function isImgMarker(t: string): boolean {
  return /^\[?\s*IMAGEM\s*\d*\s*\]?$/i.test(t.trim());
}

export function isStandaloneImgMarker(t: string): boolean {
  return /^\[IMAGEM\]$/i.test(t.trim());
}

export function statementHasImgPlaceholder(text: string): boolean {
  return /\[\s*imagem|imagem\s*\d+|^\[IMAGEM\]/i.test(String(text || ''));
}

function stripInlineImgPlaceholder(t: string): string {
  return t
    .replace(/\[\s*imagem\s*\d*\s*\]/gi, '')
    .replace(/\[\s*IMAGEM\s*\]/gi, '')
    .trim();
}

function inferQuestionType(
  altCount: number,
  answerLines: number,
  stmt: string,
): QuestionType {
  if (altCount === 0) {
    if (
      answerLines > 0 ||
      /produza|discorra|explique|disserte|elabore|escreva um texto|redija/i.test(stmt)
    ) {
      return 'discursive';
    }
    return 'discursive';
  }
  if (altCount === 2 && /^[a-e]\)/i.test(stmt)) return 'true_false';
  return 'multiple_choice';
}

export function parseProvaText(provaText: string): ExamQuestion[] {
  const questions: ExamQuestion[] = [];
  let cur: ExamQuestion | null = null;

  for (const line of provaText.split('\n')) {
    const raw = line.trim();
    if (!raw || /^-{3,}$/.test(raw) || /^#{1,6}\s/.test(raw)) continue;
    if (isImgMarker(raw) || isStandaloneImgMarker(raw)) continue;

    let t = stripMd(raw);
    if (!t) continue;
    if (/\[[^\]]*(imagem|charge|figura|gr[áa]fico|mapa|tabela|foto|ilustra)/i.test(t)) {
      t = stripInlineImgPlaceholder(t);
      if (!t) continue;
    }

    const qm = t.match(/^(\d+)\.\s*([\s\S]*)/);
    if (qm) {
      if (cur) questions.push(cur);
      let stmt = qm[2].trim();
      const isDisc = /^\[DISCURSIVA\]/i.test(stmt);
      if (isDisc) stmt = stmt.replace(/^\[DISCURSIVA\]\s*/i, '').trim();
      cur = {
        id: `q_txt_${qm[1]}`,
        number: parseInt(qm[1], 10),
        type: isDisc ? 'discursive' : 'multiple_choice',
        statement: [stmt],
        alternatives: [],
        answerLines: isDisc ? 8 : 0,
      };
      continue;
    }

    if (!cur) continue;

    const am = t.match(/^([a-eA-E])\)\s*([\s\S]*)/);
    if (am) {
      cur.alternatives.push({ letter: am[1].toLowerCase(), text: am[2] });
      continue;
    }

    if (/^_{5,}/.test(t)) {
      cur.answerLines = (cur.answerLines || 0) + 1;
      continue;
    }

    if (cur.alternatives.length === 0) {
      cur.statement.push(t);
    } else {
      cur.alternatives[cur.alternatives.length - 1].text += ' ' + t;
    }
  }

  if (cur) questions.push(cur);

  for (const q of questions) {
    const stmt = q.statement.join(' ').trim();
    if (q.type !== 'discursive') {
      q.type = inferQuestionType(q.alternatives.length, q.answerLines || 0, stmt);
    }
    if (q.type === 'discursive' && (q.answerLines || 0) < 5) {
      q.answerLines = Math.max(q.answerLines || 0, 8);
    }
    q.statement = q.statement.map((s) => s.trim()).filter(Boolean);
  }

  return questions;
}

export function parseGabaritoText(gabText: string): GabaritoEntry[] {
  const entries: GabaritoEntry[] = [];
  if (!gabText?.trim()) return entries;

  for (const line of gabText.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^(\d+)[.):\s]+([a-eA-E])?\s*[-–:]?\s*(.*)/i);
    if (m) {
      entries.push({
        number: parseInt(m[1], 10),
        letter: m[2]?.toLowerCase(),
        justification: (m[3] || '').trim(),
      });
    }
  }
  return entries;
}

export function splitProvaAndGabarito(accumulated: string): { provaText: string; gabText: string } {
  const parts = accumulated.split('---GABARITO---');
  return {
    provaText: parts[0]?.trim() || accumulated,
    gabText: parts[1]?.trim() || '',
  };
}
