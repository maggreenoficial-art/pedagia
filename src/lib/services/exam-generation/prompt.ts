import type { ExamMetadata, ExamTemplateModel } from '@/lib/exam/types';

export interface TextGenerationPromptInput {
  metadata: ExamMetadata;
  contentBlock: string;
  numTextQuestions: number;
  template?: ExamTemplateModel | null;
  headerHints?: { escola?: string; prof?: string; cidade?: string };
}

/** Geração textual — sem imagens no payload (questões visuais são fluxo separado) */
export function buildTextExamPrompt(input: TextGenerationPromptInput): string {
  const { metadata, contentBlock, numTextQuestions, template, headerHints } = input;
  const dif = metadata.dificuldade || 'Médio';

  const templateBlock = template
    ? `
FORMATO OBRIGATÓRIO (extraído da prova modelo):
- Total: ${template.questionCount} questões
- Estilo numeração: ${template.numberingStyle}
- Alternativas: ${template.alternativeStyle}
- Distribuição: ${template.types.map((t) => `${t.count}× ${t.type}`).join(', ')}
`
    : '';

  return `BLOCO 1 — INSTRUÇÃO GERAL
Você é um elaborador especialista de provas no padrão ENEM/vestibular para escolas estaduais brasileiras.
Gere EXATAMENTE ${numTextQuestions} questão(ões) com contextualizador (padrão ENEM).
NÃO use markdown. NÃO use [IMAGEM] ou placeholders. Questões visuais são inseridas pelo sistema.

${templateBlock}

BLOCO 2 — REGRAS
- Alternativas minúsculas: a) b) c) d) e)
- Contextualizador obrigatório em toda múltipla escolha
- Numeração: 1. 2. 3.
- Após as questões: frase motivacional em texto simples
- Depois escreva EXATAMENTE: ---GABARITO---
- Gabarito: letra + justificativa de 2-3 linhas

BLOCO 3 — DADOS DA PROVA
Disciplina: ${metadata.disciplina}
Série: ${metadata.serie}
Bimestre: ${metadata.bimestre || '1º Bimestre'}
Tipo: ${metadata.tipo || 'Prova'}
Dificuldade: ${dif}
Escola: ${headerHints?.escola || '(não informado)'}
Professor(a): ${headerHints?.prof || '(não informado)'}

BLOCO 4 — CONTEÚDO (única fonte)
${contentBlock}

Gere ${numTextQuestions} questão(ões) APENAS com contextualizador textual.`;
}
