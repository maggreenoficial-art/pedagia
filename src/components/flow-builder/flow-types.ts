import type { Edge, Node } from '@xyflow/react';

/** Tipos de nó do ProfessorFlux (mapeamento das 6 etapas legadas). */
export type FlowNodeKind =
  | 'config'
  | 'material'
  | 'headerEnrich'
  | 'aiProcess'
  | 'output'
  | 'result';

export type FlowNodeStatus = 'idle' | 'ready' | 'running' | 'done' | 'error';

export type FlowNodeData = {
  kind: FlowNodeKind;
  label: string;
  status: FlowNodeStatus;
  summary: string;
};

export type FlowEdgeData = {
  completed?: boolean;
};

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge<FlowEdgeData>;

export type ProductionKind = 'prova' | 'atividade' | 'avaliacao' | 'leitura' | 'imagem';

export type ExamFields = {
  productionKind: ProductionKind;
  disciplina: string;
  serie: string;
  tipo: string;
  valor: string;
  numQ: number;
  wantAdapted: boolean;
  adaptNotes: string;
  topicos: string;
};

export type PoolItem = {
  id: string;
  source?: string;
  variant?: string;
  reviewStatus?: string;
  statement?: string;
  type?: string;
  inProva?: boolean;
};

export type MaterialListItem = {
  id: string;
  fileName: string;
  totalPages: number;
};

export type HeaderListItem = {
  id: string;
  name: string;
};

export type ImageCatalogItem = {
  imageId: string;
  previewUrl: string;
  pageNumber?: number;
  title: string;
};

  /** Snapshot espelhado do legado (`st` + campos do DOM). */
export type LegacyFlowSnapshot = {
  materialId: string | null;
  bookFileName: string;
  bookTotalPages: number;
  flowTitle?: string;
  flowSavedAt?: number | null;
  builderPagesConfirmed: boolean;
  confirmedPageList: number[];
  selectedPages: number[];
  builderPool: PoolItem[];
  builderPoolTab?: string;
  builderWantAdapted?: boolean;
  materialsList?: MaterialListItem[];
  headers?: HeaderListItem[];
  activeHeaderId?: string | null;
  mediaDrafts?: Record<string, unknown>;
  imageCatalog?: ImageCatalogItem[];
  mediaItems?: ImageCatalogItem[];
  exerciciosCount?: number;
  pagFrom?: string;
  pagTo?: string;
  selectedFigures?: string[];
  exam: ExamFields;
};
