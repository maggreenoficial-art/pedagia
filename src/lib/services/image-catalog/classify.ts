import type { CatalogImage, ImageAssetType } from '@/lib/exam/types';

export interface ClassificationResult {
  type: ImageAssetType;
  usefulnessScore: number;
  containsTextOnly: boolean;
  recommendedForQuestion: boolean;
  description: string;
}

/** Classificação heurística local — substituível por IA depois */
export function classifyExtractedImage(
  img: Pick<CatalogImage, 'w' | 'h' | 'isFullPage' | 'caption' | 'srcHint'>,
  pageTextSnippet = '',
): ClassificationResult {
  const w = img.w || 1;
  const h = img.h || 1;
  const aspect = w / h;
  const area = w * h;

  if (img.isFullPage) {
    return {
      type: 'pagina_inteira',
      usefulnessScore: 0.15,
      containsTextOnly: true,
      recommendedForQuestion: false,
      description: 'Página inteira — revisar manualmente',
    };
  }

  const hint = `${img.caption || ''} ${img.srcHint || ''} ${pageTextSnippet}`.toLowerCase();

  let type: ImageAssetType = 'desconhecido';
  if (/gráfico|grafico|chart|barras|linha|série|serie/i.test(hint)) type = 'grafico';
  else if (/tabela|quadro|dados/i.test(hint)) type = 'tabela';
  else if (/mapa|cartografia|geografia/i.test(hint)) type = 'mapa';
  else if (/charge|quadrinho|tirinha/i.test(hint)) type = 'charge';
  else if (/diagrama|esquema|fluxo|ciclo/i.test(hint)) type = 'diagrama';
  else if (/foto|imagem|ilustra/i.test(hint)) type = 'ilustracao';

  if (aspect > 4.5 || aspect < 0.16) {
    return {
      type: 'lixo',
      usefulnessScore: 0.1,
      containsTextOnly: true,
      recommendedForQuestion: false,
      description: 'Faixa estreita — provável rodapé ou artefato',
    };
  }

  if (area < 120 * 120) {
    return {
      type: 'lixo',
      usefulnessScore: 0.2,
      containsTextOnly: false,
      recommendedForQuestion: false,
      description: 'Imagem muito pequena',
    };
  }

  const containsTextOnly = area > 400000 && aspect > 0.6 && aspect < 1.5;
  let usefulnessScore = 0.65;
  if (type !== 'desconhecido') usefulnessScore = 0.82;
  if (containsTextOnly) usefulnessScore = 0.25;

  return {
    type: containsTextOnly ? 'texto' : type,
    usefulnessScore,
    containsTextOnly,
    recommendedForQuestion: usefulnessScore >= 0.55 && !containsTextOnly,
    description:
      type !== 'desconhecido'
        ? `Detectado: ${type}`
        : 'Ilustração / figura didática',
  };
}

export function applyClassification(img: CatalogImage, c: ClassificationResult): CatalogImage {
  return {
    ...img,
    type: c.type,
    usefulnessScore: c.usefulnessScore,
    containsTextOnly: c.containsTextOnly,
    recommendedForQuestion: c.recommendedForQuestion,
    description: c.description,
  };
}
