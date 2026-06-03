import type { ExamMetadata } from '@/lib/exam/types';
import { buildBnccPromptBlock, getBnccExamTemplate, type BnccPedagogyPrefs } from './bnccTemplate';
import { PEDAGIA_AUTOVERIFY_CHECKLIST } from '@/lib/services/pedagogia/master-prompt';

export interface BatchQuestionsPromptInput {
  metadata: ExamMetadata;
  contentBlock: string;
  count: number;
  bnccPrefs?: BnccPedagogyPrefs;
  /** Versão adaptada (PAEE / necessidades específicas) */
  adapted?: boolean;
  adaptationNotes?: string;
}

export function buildBatchQuestionsPrompt(input: BatchQuestionsPromptInput): string {
  const { metadata, contentBlock, count } = input;
  const tpl = getBnccExamTemplate(count, metadata.serie);
  const mc = tpl.types.find((t) => t.type === 'multiple_choice')?.count ?? Math.max(1, count - 2);
  const disc = tpl.types.find((t) => t.type === 'discursive')?.count ?? Math.max(0, count - mc);

  const bnccPrefs: BnccPedagogyPrefs = input.bnccPrefs || {
    orientacoes: metadata.bnccOrientacoes || '',
    habilidades: metadata.bnccHabilidades || '',
    focoAvaliativo: metadata.bnccFoco || '',
  };
  const bnccBlock = buildBnccPromptBlock(bnccPrefs, metadata.serie, metadata.disciplina);
  const adapted = !!input.adapted;
  const adaptNotes = (input.adaptationNotes || '').trim();
  const adaptBlock = adapted
    ? `
════════════════════════════════════════════════
VERSÃO ADAPTADA — AVALIAÇÃO INDIVIDUAL (PAEE / INCLUSÃO)
════════════════════════════════════════════════
Esta é uma prova/atividade ADAPTADA para UM aluno com necessidade específica.
${adaptNotes ? `Orientações do professor: ${adaptNotes}` : 'Aplique adaptações de acessibilidade adequadas à série.'}

OBRIGATÓRIO:
- Mesmos objetivos de aprendizagem do material, mas linguagem mais clara e comandos fracionados.
- Enunciados mais curtos; evite ambiguidade; uma ideia por questão.
- Se houver figura no material, descreva o essencial no enunciado (aluno pode não ver a imagem).
- Distratores mais distintos (menos sutis que na versão da turma).
- Indique no JSON o campo "variant": "adaptada" em cada questão (se o schema permitir; senão ignore).
- Título mental da prova: "AVALIAÇÃO ADAPTADA — USO INDIVIDUAL"
`
    : '';

  return `Você é professor de ${metadata.disciplina || 'Geografia'} elaborando questões para ${metadata.serie}, alinhadas à BNCC.

O professor selecionou páginas do PDF ou texto — use SOMENTE o material abaixo.
Gere um BANCO de sugestões para ele APROVAR ou REJEITAR (não monte a prova final em prosa).
${adaptBlock}

${bnccBlock}

════════════════════════════════════════════════
QUANTIDADE E TIPOS
════════════════════════════════════════════════
Gere EXATAMENTE ${count} questões: ~${mc} múltipla escolha + ~${disc} discursivas, intercaladas.
Todas ancoradas no material — nada genérico estilo ENEM desconectado do texto.

════════════════════════════════════════════════
FORMATO DE RESPOSTA (OBRIGATÓRIO)
════════════════════════════════════════════════
Responda APENAS com JSON válido (sem markdown, sem texto antes ou depois):

{
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "statement": "Contextualizador + comando. Fonte: ... (só se existir no material)",
      "alternatives": [
        {"letter":"a","text":"..."},
        {"letter":"b","text":"..."},
        {"letter":"c","text":"..."},
        {"letter":"d","text":"..."},
        {"letter":"e","text":"..."}
      ],
      "correctAnswer": "c",
      "justification": "Por que esta alternativa, citando o material"
    },
    {
      "id": 2,
      "type": "discursive",
      "statement": "Comando discursivo com critérios e mínimo de linhas",
      "alternatives": [],
      "correctAnswer": "",
      "justification": "Critérios de correção esperados"
    }
  ],
  "pedagogicalNote": "3-5 linhas: por que estas questões e habilidades"
}

Regras:
- MC: 5 alternativas a)–e) plausíveis; correctAnswer = letra minúscula.
- Discursiva: type "discursive", alternatives [].
- PROIBIDO: [IMAGEM], placeholders, markdown (** ##).
- Fonte só se impressa no material.

Disciplina: ${metadata.disciplina}
Série: ${metadata.serie}
Dificuldade: ${metadata.dificuldade || 'médio'}

════════════════════════════════════════════════
MATERIAL DO PROFESSOR
════════════════════════════════════════════════
${contentBlock}

${PEDAGIA_AUTOVERIFY_CHECKLIST}`;
}
