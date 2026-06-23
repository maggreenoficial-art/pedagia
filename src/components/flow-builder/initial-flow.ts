import type { FlowEdge, FlowNode } from '@/components/flow-builder/flow-types';



/** Grafo inicial — receita visual do builder pedagógico. */

export const INITIAL_FLOW_NODES: FlowNode[] = [

  {

    id: 'node-config',

    type: 'configNode',

    position: { x: 40, y: 140 },

    data: {

      kind: 'config',

      label: 'Dados da produção',

      status: 'idle',

      summary: 'Tipo, disciplina, série',

    },

  },

  {

    id: 'node-material',

    type: 'materialNode',

    position: { x: 300, y: 100 },

    data: {

      kind: 'material',

      label: 'Fonte de dados',

      status: 'idle',

      summary: 'PDF ou texto-base',

    },

  },

  {

    id: 'node-header',

    type: 'headerEnrichNode',

    position: { x: 560, y: 180 },

    data: {

      kind: 'headerEnrich',

      label: 'Cabeçalho',

      status: 'idle',

      summary: 'Cabeçalho institucional',

    },

  },

  {

    id: 'node-ai',

    type: 'aiProcessNode',

    position: { x: 820, y: 100 },

    data: {

      kind: 'aiProcess',

      label: 'Figuras e gráficos',

      status: 'idle',

      summary: 'Selecione figuras para a IA',

    },

  },

  {

    id: 'node-output',

    type: 'outputNode',

    position: { x: 1080, y: 160 },

    data: {

      kind: 'output',

      label: 'Gerar e montar',

      status: 'idle',

      summary: 'Gerar com IA e revisar',

    },

  },

  {

    id: 'node-result',

    type: 'resultNode',

    position: { x: 1340, y: 160 },

    data: {

      kind: 'result',

      label: 'Resultado',

      status: 'idle',

      summary: 'Aguardando montagem',

    },

  },

];



export const INITIAL_FLOW_EDGES: FlowEdge[] = [

  { id: 'e-config-material', source: 'node-config', target: 'node-material', animated: false },

  { id: 'e-material-header', source: 'node-material', target: 'node-header' },

  { id: 'e-header-ai', source: 'node-header', target: 'node-ai' },

  { id: 'e-ai-output', source: 'node-ai', target: 'node-output' },

  { id: 'e-output-result', source: 'node-output', target: 'node-result' },

];

/** Layout em coluna — melhor leitura no celular */
export const MOBILE_FLOW_NODES: FlowNode[] = INITIAL_FLOW_NODES.map((node, i) => ({
  ...node,
  position: { x: 24, y: 24 + i * 168 },
}));
