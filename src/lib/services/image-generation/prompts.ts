export type ImageGenCategory =
  | 'mapa'
  | 'anatomia'
  | 'historia'
  | 'arquitetura'
  | 'educativo';

export const IMAGE_GEN_CATEGORIES: Record<
  ImageGenCategory,
  { label: string; hint: string; placeholder: string }
> = {
  mapa: {
    label: 'Mapa',
    hint: 'mapa geográfico ou temático para sala de aula',
    placeholder: 'Ex.: mapa do Brasil com biomas e legenda; escala e nomes legíveis',
  },
  anatomia: {
    label: 'Diagrama anatômico',
    hint: 'diagrama anatômico didático com rótulos em português',
    placeholder: 'Ex.: sistema digestório humano, vista lateral, rótulos claros',
  },
  historia: {
    label: 'Reconstrução histórica',
    hint: 'ilustração de reconstrução histórica fiel e educativa',
    placeholder: 'Ex.: feira medieval no século XIII, povoado e feira',
  },
  arquitetura: {
    label: 'Cena arquitetônica',
    hint: 'cena arquitetônica ou urbanística para estudo',
    placeholder: 'Ex.: praça colonial brasileira, igreja e casarios',
  },
  educativo: {
    label: 'Recurso visual',
    hint: 'ilustração educacional clara para material didático',
    placeholder: 'Ex.: ciclo da água com setas e legendas curtas',
  },
};

const STYLE_RULES = `
Estilo obrigatório (PedagIA — recurso visual educacional):
- Ilustração educacional para livro didático brasileiro (ensino fundamental/médio).
- Rastreabilidade: adequado para prova/apostila; marque mentalmente como "gerado por IA" se não vier de livro.
- Sem marcas d'água, sem logos, sem texto ilegível.
- Cores sóbrias, alto contraste, linhas nítidas.
- Se houver texto, em português, curto e legível (títulos e legendas).
- Não incluir rostos de pessoas reais identificáveis.
- Adequado para impressão; respeite faixa etária e BNCC quando indicada série/disciplina.
`.trim();

export function buildImageGenerationPrompt(opts: {
  category: ImageGenCategory;
  userPrompt: string;
  disciplina?: string;
  serie?: string;
}): string {
  const cat = IMAGE_GEN_CATEGORIES[opts.category] || IMAGE_GEN_CATEGORIES.educativo;
  const context = [
    opts.disciplina ? `Disciplina: ${opts.disciplina}.` : '',
    opts.serie ? `Série: ${opts.serie}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return [
    `Crie uma imagem original: ${cat.hint}.`,
    context,
    `Pedido do professor: ${opts.userPrompt.trim()}`,
    STYLE_RULES,
    'Gere apenas a imagem solicitada.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function isValidImageGenCategory(value: string): value is ImageGenCategory {
  return value in IMAGE_GEN_CATEGORIES;
}
