import { getImageB64 } from './resolveImages';
import { statementHasImgPlaceholder } from './parse';
import type { CatalogImage, ExamModel, ValidationIssue } from './types';

export function validateExamModel(
  exam: ExamModel,
  opts: { strictExport?: boolean; catalog?: CatalogImage[] } = {},
): ValidationIssue[] {
  const catalog = opts.catalog || [];
  const issues: ValidationIssue[] = [];
  const { questions, metadata, gabarito } = exam;
  const strict = opts.strictExport === true;

  if (!questions.length) {
    issues.push({
      code: 'NO_QUESTIONS',
      message: 'Nenhuma questão na prova.',
      severity: 'error',
    });
    return issues;
  }

  const requested = metadata.numQuestoesPedidas;
  if (requested && questions.length !== requested) {
    issues.push({
      code: 'COUNT_MISMATCH',
      message: `Esperado ${requested} questões, encontrado ${questions.length}.`,
      severity: strict ? 'error' : 'warning',
    });
  }

  for (const q of questions) {
    const stmt = q.statement.join(' ').trim();
    const n = q.number;

    if (!stmt) {
      issues.push({
        code: 'EMPTY_STATEMENT',
        message: `Questão ${n}: enunciado vazio.`,
        questionNumber: n,
        severity: 'error',
      });
      continue;
    }

    if (statementHasImgPlaceholder(stmt)) {
      issues.push({
        code: 'IMG_PLACEHOLDER',
        message: `Questão ${n}: placeholder de imagem no texto — use blocos da galeria.`,
        questionNumber: n,
        severity: 'error',
      });
    }

    if (q.type === 'multiple_choice') {
      if (q.alternatives.length !== 5) {
        issues.push({
          code: 'ALT_COUNT',
          message: `Questão ${n}: ${q.alternatives.length} alternativas (esperado: 5).`,
          questionNumber: n,
          severity: 'error',
        });
      } else {
        const letters = q.alternatives.map((a) => a.letter).join('');
        if (letters !== 'abcde') {
          issues.push({
            code: 'ALT_ORDER',
            message: `Questão ${n}: alternativas fora de ordem (${letters}).`,
            questionNumber: n,
            severity: 'error',
          });
        }
        const empty = q.alternatives.filter((a) => !a.text.trim()).length;
        if (empty) {
          issues.push({
            code: 'ALT_EMPTY',
            message: `Questão ${n}: ${empty} alternativa(s) vazia(s).`,
            questionNumber: n,
            severity: 'error',
          });
        }
      }
    }

    if (q.imageId || q.fromBlock) {
      if (!q.imageId) {
        issues.push({
          code: 'MISSING_IMAGE_ID',
          message: `Questão ${n}: bloco sem image_id.`,
          questionNumber: n,
          severity: 'error',
        });
      } else {
        const catImg = catalog.find((c) => c.imageId === q.imageId);
        const hasBytes =
          !!getImageB64(catImg) ||
          !!getImageB64(q.image as CatalogImage) ||
          !!(q.image?.previewUrl && String(q.image.previewUrl).startsWith('data:'));
        if (!hasBytes && !q.image?.storagePath) {
          issues.push({
            code: 'IMAGE_UNRESOLVED',
            message: `Questão ${n}: imagem não carregada — nomeie e salve na nuvem na aba Material.`,
            questionNumber: n,
            severity: 'error',
          });
        }
      }
      if (q.image?.isFullPage && q.image?.recommendedForQuestion !== true) {
        issues.push({
          code: 'FULL_PAGE_IMAGE',
          message: `Questão ${n}: usa página inteira — revise na galeria.`,
          questionNumber: n,
          severity: strict ? 'error' : 'warning',
        });
      }
      if (q.image?.type === 'lixo' || (q.image?.usefulnessScore ?? 1) < 0.25) {
        issues.push({
          code: 'LOW_QUALITY_IMAGE',
          message: `Questão ${n}: imagem classificada como pouco útil.`,
          questionNumber: n,
          severity: strict ? 'error' : 'warning',
        });
      }
    }
  }

  if (gabarito.length === 0 && strict) {
    issues.push({
      code: 'NO_GABARITO',
      message: 'Gabarito ausente.',
      severity: 'warning',
    });
  }

  for (const g of gabarito) {
    const q = questions.find((x) => x.number === g.number);
    if (q?.type === 'multiple_choice' && g.letter && !g.justification?.trim()) {
      issues.push({
        code: 'GAB_NO_JUSTIFY',
        message: `Gabarito questão ${g.number}: falta justificativa.`,
        questionNumber: g.number,
        severity: 'warning',
      });
    }
  }

  return issues;
}

export function hasBlockingIssues(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
