import type { IconName } from '@/lib/icons';
import type { ExamFields, FlowNodeKind, FlowNodeStatus, PoolItem } from '@/components/flow-builder/flow-types';

export const FLOW_DND_MIME = 'application/pedagia-flow-node';

export const PRODUCTION_TYPES: {
  id: ExamFields['productionKind'];
  icon: IconName;
  label: string;
  desc: string;
}[] = [
  { id: 'prova', icon: 'prova', label: 'Prova', desc: 'Avaliação formal com nota' },
  { id: 'atividade', icon: 'atividade', label: 'Atividade', desc: 'Exercícios para aula ou casa' },
  { id: 'avaliacao', icon: 'avaliacao', label: 'Avaliação', desc: 'Diagnóstica ou formativa' },
  { id: 'leitura', icon: 'leitura', label: 'Leitura', desc: 'Texto com orientações' },
  { id: 'imagem', icon: 'visual', label: 'Visual', desc: 'Imagens e recursos gráficos' },
];

export type NodePaletteMeta = {
  kind: FlowNodeKind;
  icon: IconName;
  label: string;
  hint: string;
  defaultLabel: string;
  /** false = aparece na lista de etapas, mas não no drag-and-drop do canvas */
  draggable?: boolean;
};

export const NODE_PALETTE: NodePaletteMeta[] = [
  { kind: 'config', icon: 'config', label: 'Dados', hint: 'Tipo e disciplina', defaultLabel: 'Dados da produção' },
  { kind: 'material', icon: 'source', label: 'Fonte', hint: 'PDF, texto ou recortes', defaultLabel: 'Fonte de dados' },
  { kind: 'headerEnrich', icon: 'header', label: 'Cabeçalho', hint: 'Identidade da escola', defaultLabel: 'Cabeçalho' },
  { kind: 'aiProcess', icon: 'media', label: 'Figuras', hint: 'Selecionar imagens', defaultLabel: 'Figuras e gráficos' },
  { kind: 'output', icon: 'output', label: 'Gerar', hint: 'IA + revisão final', defaultLabel: 'Gerar e montar' },
  {
    kind: 'result',
    icon: 'prova',
    label: 'Resultado',
    hint: 'Material montado',
    defaultLabel: 'Resultado',
    draggable: false,
  },
];

/** Etapas arrastáveis para o canvas (sem Resultado — ele entra pelo fluxo). */
export const PALETTE_ITEMS = NODE_PALETTE.filter((p) => p.draggable !== false);

export const KIND_TO_NODE_TYPE: Record<FlowNodeKind, string> = {
  config: 'configNode',
  material: 'materialNode',
  headerEnrich: 'headerEnrichNode',
  aiProcess: 'aiProcessNode',
  output: 'outputNode',
  result: 'resultNode',
};

export function paletteMeta(kind: FlowNodeKind) {
  return NODE_PALETTE.find((p) => p.kind === kind);
}

export function defaultSummaryForKind(kind: FlowNodeKind): string {
  switch (kind) {
    case 'config':
      return 'Tipo, disciplina, série';
    case 'material':
      return 'PDF ou texto-base';
    case 'headerEnrich':
      return 'Cabeçalho institucional';
    case 'aiProcess':
      return 'Selecione figuras para a IA';
    case 'output':
      return 'Gerar e revisar conteúdo';
    case 'result':
      return 'Aguardando montagem';
    default:
      return '';
  }
}

export function summaryForNode(
  kind: FlowNodeKind,
  ctx: {
    exam: ExamFields;
    materialId: string | null;
    bookFileName: string;
    builderPagesConfirmed: boolean;
    confirmedPageList: number[];
    builderPool: PoolItem[];
    activeHeaderId: string | null;
    selectedFigures: string[];
    confirmedNodeIds: string[];
    nodeId: string;
    resultReady: boolean;
  },
): string {
  const stepConfirmed = ctx.confirmedNodeIds.includes(ctx.nodeId);
  const prodLabel =
    PRODUCTION_TYPES.find((p) => p.id === ctx.exam.productionKind)?.label || ctx.exam.tipo;

  switch (kind) {
    case 'config':
      if (ctx.exam.disciplina.trim() && ctx.exam.serie.trim()) {
        const base = `${prodLabel} · ${ctx.exam.disciplina.trim()}`;
        return stepConfirmed ? `${base} ✓` : base;
      }
      return 'Tipo, disciplina, série';
    case 'material':
      if (ctx.builderPagesConfirmed) {
        if (ctx.exam.topicos.trim()) return 'Conteúdo escrito confirmado ✓';
        const pages = ctx.confirmedPageList.slice(0, 4).join(', ');
        const suffix = ctx.confirmedPageList.length > 4 ? '…' : '';
        return `Págs. ${pages}${suffix} ✓`;
      }
      if (ctx.bookFileName) return ctx.bookFileName;
      if (ctx.materialId) return 'PDF selecionado';
      return 'PDF ou texto-base';
    case 'headerEnrich':
      return ctx.activeHeaderId ? 'Cabeçalho selecionado ✓' : 'Escolha o cabeçalho';
    case 'aiProcess':
      if (ctx.selectedFigures.length) {
        return `${ctx.selectedFigures.length} figura(s) selecionada(s)${stepConfirmed ? ' ✓' : ''}`;
      }
      return 'Selecione figuras (opcional)';
    case 'output':
      return ctx.builderPool.length > 0
        ? `${ctx.builderPool.length} item(ns) no pool`
        : 'Gerar com IA e revisar';
    case 'result':
      if (ctx.resultReady) {
        const approved = ctx.builderPool.filter((q) => q.reviewStatus === 'approved').length;
        return approved > 0 ? `Material montado · ${approved} questão(ões) ✓` : 'Material montado ✓';
      }
      return 'Aguardando montagem';
    default:
      return defaultSummaryForKind(kind);
  }
}

export function statusForNode(
  kind: FlowNodeKind,
  nodeId: string,
  ctx: {
    exam: ExamFields;
    materialId: string | null;
    builderPagesConfirmed: boolean;
    confirmedPageList: number[];
    builderPool: PoolItem[];
    activeHeaderId: string | null;
    selectedFigures: string[];
    confirmedNodeIds: string[];
    resultReady: boolean;
  },
): FlowNodeStatus {
  if (ctx.confirmedNodeIds.includes(nodeId)) return 'done';

  switch (kind) {
    case 'config':
      if (ctx.exam.disciplina.trim() && ctx.exam.serie.trim()) return 'done';
      return 'idle';
    case 'material':
      if (ctx.builderPagesConfirmed) return 'done';
      return ctx.materialId || ctx.exam.topicos.trim() ? 'ready' : 'idle';
    case 'headerEnrich':
      if (ctx.activeHeaderId) return 'done';
      return 'idle';
    case 'aiProcess':
      return ctx.selectedFigures.length ? 'ready' : 'idle';
    case 'output':
      return ctx.builderPagesConfirmed ? 'ready' : 'idle';
    case 'result':
      return ctx.resultReady ? 'done' : 'idle';
    default:
      return 'idle';
  }
}

export function validateConfigStep(exam: ExamFields): string | null {
  if (!exam.disciplina.trim()) return 'Informe a disciplina.';
  if (!exam.serie.trim()) return 'Informe a série / ano.';
  return null;
}

export function validateMaterialStep(ctx: {
  exam: ExamFields;
  materialId: string | null;
  selectedPages: number[];
  builderPagesConfirmed?: boolean;
  confirmedPageList?: number[];
}): string | null {
  if (ctx.builderPagesConfirmed) return null;
  if (ctx.exam.topicos.trim()) return null;
  if (ctx.selectedPages.length) return null;
  if (ctx.confirmedPageList?.length) return null;
  if (!ctx.materialId) return 'Selecione um PDF na biblioteca ou cole conteúdo escrito.';
  return 'Marque ao menos uma página ou use conteúdo escrito.';
}
