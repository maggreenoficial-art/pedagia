import type { ExamMetadata, ExamTemplateModel } from '@/lib/exam/types';
import { describeAvBgeoMix, getAvBgeoTemplate } from './avBgeoTemplate';
import {
  buildBnccPromptBlock,
  describeBnccMix,
  getBnccExamTemplate,
  type BnccPedagogyPrefs,
} from './bnccTemplate';
import {
  PEDAGIA_AUTOVERIFY_CHECKLIST,
} from '@/lib/services/pedagogia/master-prompt';

export interface TextGenerationPromptInput {
  metadata: ExamMetadata;
  contentBlock: string;
  numTextQuestions: number;
  template?: ExamTemplateModel | null;
  headerHints?: { escola?: string; prof?: string; cidade?: string };
  bnccPrefs?: BnccPedagogyPrefs;
}

function resolveTemplate(
  numTextQuestions: number,
  template: ExamTemplateModel | null | undefined,
  serie?: string,
): ExamTemplateModel {
  if (template?.types?.length) return template;
  return getBnccExamTemplate(numTextQuestions, serie);
}

const BNCC_STYLE_EXAMPLES = `
EXEMPLOS — AVALIAÇÃO ESCOLAR ALINHADA À BNCC (imite a forma, não o assunto):

MC com trecho do material:
"O espaço geográfico é produzido pela ação da sociedade sobre a natureza...
Fonte: adaptado do material didático, cap. estudado.
Com base no trecho, assinale a alternativa que expressa corretamente a relação entre sociedade e natureza:
a) ... e) ..."

MC com dado do capítulo:
"De acordo com os dados apresentados no capítulo sobre [tema], assinale a alternativa correta:
a) ... e) ..."

Discursiva:
"[DISCURSIVA] Com base no conteúdo estudado sobre [tema do capítulo], explique [relação] citando elementos do texto. Critérios: ... Mínimo 8 linhas."
`;

/** Geração textual — BNCC + material do capítulo (professor pode editar orientações) */
export function buildTextExamPrompt(input: TextGenerationPromptInput): string {
  const { metadata, contentBlock, numTextQuestions, headerHints } = input;
  const tpl = resolveTemplate(numTextQuestions, input.template, metadata.serie);
  const dif = metadata.dificuldade || 'Médio';
  const bim = (metadata.bimestre || '1º Bimestre').replace(/ bimestre/i, ' BIMESTRE');
  const tipo = (metadata.tipo || 'PROVA').toUpperCase();
  const valor = metadata.valor || '10,0';

  const mc = tpl.types.find((t) => t.type === 'multiple_choice')?.count ?? numTextQuestions;
  const disc = tpl.types.find((t) => t.type === 'discursive')?.count ?? 0;
  const mixDesc = describeBnccMix(tpl);

  const bnccPrefs: BnccPedagogyPrefs = input.bnccPrefs || {
    orientacoes: metadata.bnccOrientacoes || '',
    habilidades: metadata.bnccHabilidades || '',
    focoAvaliativo: metadata.bnccFoco || '',
  };
  const bnccBlock = buildBnccPromptBlock(bnccPrefs, metadata.serie, metadata.disciplina);

  const imgNote =
    numTextQuestions < tpl.questionCount
      ? `\nO professor já incluiu ${tpl.questionCount - numTextQuestions} questão(ões) COM IMAGEM (blocos separados). Gere só ${numTextQuestions} questão(ões) SEM imagem, no mesmo padrão.\n`
      : '';

  return `Você é professor de ${metadata.disciplina || 'Geografia'} elaborando avaliação escolar para ${metadata.serie}, alinhada à BNCC.

Sua missão: criar questões a partir do CAPÍTULO LIDO abaixo — avaliação escolar, NÃO vestibular/ENEM.

${bnccBlock}

════════════════════════════════════════════════
QUALIDADE (o que separa prova boa de prova "burra")
════════════════════════════════════════════════
- LEIA o capítulo inteiro (texto + mapa do capítulo) ANTES de escrever.
- Cada questão avalia algo que o aluno só sabe se estudou ESTE capítulo.
- Use trechos, conceitos, dados e relações que aparecem no texto — cite ou parafraseie fielmente.
- PROIBIDO: perguntas vagas, assuntos fora do capítulo, estilo ENEM/vestibular genérico desconectado do livro.
- MC: contextualize (2–5 linhas) + comando claro + 5 alternativas a)–e).
- Distratores: erros plausíveis — nunca alternativas absurdas.
- Discursivas: [DISCURSIVA] + critérios explícitos + 8 linhas de resposta.
- Varie: interpretação do livro, aplicação, dado do capítulo, análise espacial.

${BNCC_STYLE_EXAMPLES}

════════════════════════════════════════════════
FORMATO DE SAÍDA
════════════════════════════════════════════════
- EXATAMENTE ${numTextQuestions} questões (${mixDesc}), numeradas 1. 2. 3.
- Texto simples — SEM markdown (** ## ---).
- SEM [IMAGEM] ou "veja a figura".
- SEM cabeçalho da escola.
${imgNote}

Discursivas: após o enunciado, 8 linhas:
______________________________________________
(repetir 8 vezes)

════════════════════════════════════════════════
DADOS DA PROVA
════════════════════════════════════════════════
Disciplina: ${metadata.disciplina}
Série: ${metadata.serie}
Avaliação: ${tipo} ${bim} (0 a ${valor})
Dificuldade: ${dif}

════════════════════════════════════════════════
MATERIAL DO CAPÍTULO (fonte exclusiva)
════════════════════════════════════════════════
${contentBlock}

════════════════════════════════════════════════
ENTREGAR
════════════════════════════════════════════════
1. ${numTextQuestions} questões (${mc} MC + ${disc} discursivas), intercaladas, todas ancoradas no capítulo.
2. Uma frase motivacional curta (sem asteriscos).
3. Linha: ---GABARITO---
4. Gabarito: MC "N. letra — justificativa citando o capítulo"; discursiva "N. — Critérios: ...".
5. NOTA PEDAGÓGICA (3–5 linhas): por que estas questões, esta dificuldade e quais habilidades avaliam.

${PEDAGIA_AUTOVERIFY_CHECKLIST}`;
}
