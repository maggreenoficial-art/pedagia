import type { ExamTemplateModel } from '@/lib/exam/types';
import { getAvBgeoTemplate } from './avBgeoTemplate';

/** Metadados BNCC editáveis pelo professor (não inventar códigos na IA). */
export interface BnccPedagogyPrefs {
  /** Texto livre: competências, habilidades, eixos — o professor ajusta antes de gerar */
  orientacoes: string;
  /** Ex.: "EF69GE01" — só se o professor digitou; vazio = IA descreve habilidade sem código */
  habilidades: string;
  /** Foco avaliativo: compreensão, aplicação, análise… */
  focoAvaliativo: string;
}

export const BNCC_DEFAULT_ORIENTACOES = `Base Nacional Comum Curricular (BNCC) — Geografia
- Priorizar habilidades do componente curricular trabalhadas no capítulo do livro.
- Questões objetivas: contextualização breve ligada ao material + comando claro + 5 alternativas (a–e).
- Questões discursivas: produção textual com critérios explícitos e extensão adequada à série.
- Vocabulário e complexidade compatíveis com a faixa etária; evitar estilo vestibular genérico desconectado do livro.
- Cite fontes apenas quando constarem no material ou na figura.`;

export function getBnccExamTemplate(totalQuestions: number, serie?: string): ExamTemplateModel {
  return getAvBgeoTemplate(totalQuestions, serie);
}

export function describeBnccMix(template: ExamTemplateModel): string {
  const mc = template.types.find((t) => t.type === 'multiple_choice')?.count ?? 0;
  const disc = template.types.find((t) => t.type === 'discursive')?.count ?? 0;
  return `${mc} objetivas + ${disc} discursiva(s) · alinhamento BNCC`;
}

export function buildBnccPromptBlock(prefs: BnccPedagogyPrefs, serie: string, disciplina: string): string {
  const orient = (prefs.orientacoes || BNCC_DEFAULT_ORIENTACOES).trim();
  const hab = (prefs.habilidades || '').trim();
  const foco = (prefs.focoAvaliativo || 'compreensão, aplicação e análise').trim();

  return `
════════════════════════════════════════════════
BASE BNCC (editável pelo professor — respeite à risca)
════════════════════════════════════════════════
Disciplina: ${disciplina || 'Geografia'}
Série/ano: ${serie || '—'}
Foco avaliativo: ${foco}
${hab ? `Habilidades/competências indicadas pelo professor:\n${hab}\n` : 'Habilidades: descreva em texto qual competência cada questão avalia (NÃO invente código EF/EM se não foi fornecido acima; use "[verificar código BNCC]" se incerto).'}
Orientações do professor:
${orient}

Regras BNCC (substituem padrão ENEM/vestibular):
- Avaliação formativa/somativa escolar — NÃO imitar ENEM, Fuvest ou contextualizadores longos de vestibular.
- Cada questão deriva do capítulo ou figura indicada; sem clichês genéricos.
- MC: 2–5 linhas de contexto do material + comando + alternativas a)–e) plausíveis.
- Discursiva: critérios de correção + linhas para resposta (8 linhas quando aplicável).
- Nota pedagógica final: relacione questões às habilidades trabalhadas.
`;
}
