import { create } from 'zustand';
import {
  applyEdgeChanges,
  applyNodeChanges,
  addEdge,
  type Connection,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import {
  defaultSummaryForKind,
  paletteMeta,
  statusForNode,
  summaryForNode,
  validateConfigStep,
  validateMaterialStep,
  KIND_TO_NODE_TYPE,
} from '@/components/flow-builder/palette-config';
import {
  INITIAL_FLOW_EDGES,
  INITIAL_FLOW_NODES,
} from '@/components/flow-builder/initial-flow';
import type {
  ExamFields,
  FlowEdge,
  FlowNode,
  FlowNodeKind,
  LegacyFlowSnapshot,
  PoolItem,
} from '@/components/flow-builder/flow-types';
import {
  legacySaveBuilder,
  legacySetFlowTitle,
  legacyToast,
  syncExamFieldsToLegacy,
} from '@/lib/legacy/bridge';

const PRODUCTION_LABELS: Record<string, string> = {
  prova: 'Prova',
  atividade: 'Atividade',
  avaliacao: 'Avaliação',
  leitura: 'Texto de leitura',
  imagem: 'Material visual',
};

const DEFAULT_EXAM: ExamFields = {
  productionKind: 'prova',
  disciplina: '',
  serie: '',
  tipo: 'Prova',
  valor: '10,0',
  numQ: 10,
  wantAdapted: false,
  adaptNotes: '',
  topicos: '',
};

function pushExamToLegacySilent(exam: ExamFields) {
  if (typeof window !== 'undefined') {
    syncExamFieldsToLegacy(exam);
  }
}

export interface FlowStoreState {
  materialId: string | null;
  bookFileName: string;
  bookTotalPages: number;
  builderPagesConfirmed: boolean;
  confirmedPageList: number[];
  selectedPages: number[];
  builderPool: PoolItem[];
  activeHeaderId: string | null;
  selectedFigures: string[];
  exam: ExamFields;

  flowTitle: string;
  flowSavedAt: number | null;
  flowSaving: boolean;

  nodes: FlowNode[];
  edges: FlowEdge[];
  activeNodeId: string | null;
  /** Nós com etapa confirmada pelo professor */
  confirmedNodeIds: string[];
  /** Material montado e pronto para revisão */
  resultReady: boolean;

  setActiveNodeId: (id: string | null) => void;
  onNodesChange: OnNodesChange<FlowNode>;
  onEdgesChange: OnEdgesChange<FlowEdge>;
  onConnect: OnConnect;
  setNodes: (nodes: FlowNode[]) => void;
  setEdges: (edges: FlowEdge[]) => void;

  updateExamField: <K extends keyof ExamFields>(key: K, value: ExamFields[K]) => void;
  setMaterialId: (id: string | null) => void;
  setPagesConfirmed: (pages: number[], topicos?: string) => void;
  setBuilderPool: (pool: PoolItem[]) => void;
  setActiveHeaderId: (id: string | null) => void;
  setSelectedFigures: (ids: string[]) => void;
  toggleFigureSelection: (id: string) => void;

  addNodeFromPalette: (kind: FlowNodeKind, position: { x: number; y: number }) => string;
  confirmActiveNodeStep: () => { ok: true } | { ok: false; error: string };
  getActiveNode: () => FlowNode | undefined;

  hydrateFromLegacy: (snap: LegacyFlowSnapshot) => void;
  refreshNodeStatuses: () => void;
  onMaterialMounted: () => void;
  setFlowTitle: (title: string) => void;
  saveFlow: () => Promise<{ ok: boolean }>;
}

export const useFlowStore = create<FlowStoreState>((set, get) => ({
  materialId: null,
  bookFileName: '',
  bookTotalPages: 0,
  builderPagesConfirmed: false,
  confirmedPageList: [],
  selectedPages: [],
  builderPool: [],
  activeHeaderId: null,
  selectedFigures: [],
  exam: { ...DEFAULT_EXAM },
  flowTitle: '',
  flowSavedAt: null,
  flowSaving: false,

  nodes: INITIAL_FLOW_NODES,
  edges: INITIAL_FLOW_EDGES,
  activeNodeId: 'node-config',
  confirmedNodeIds: [],
  resultReady: false,

  setActiveNodeId: (id) => set({ activeNodeId: id }),

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection: Connection) => {
    set({
      edges: addEdge(
        {
          ...connection,
          id: `e-${connection.source}-${connection.target}-${Date.now().toString(36)}`,
          animated: true,
        },
        get().edges,
      ),
    });
  },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  getActiveNode: () => {
    const { activeNodeId, nodes } = get();
    return nodes.find((n) => n.id === activeNodeId);
  },

  updateExamField: (key, value) => {
    const nextExam = { ...get().exam, [key]: value };
    if (key === 'productionKind') {
      const kind = value as ExamFields['productionKind'];
      nextExam.tipo = PRODUCTION_LABELS[kind] || nextExam.tipo;
    }
    set({ exam: nextExam });
    pushExamToLegacySilent(nextExam);
    get().refreshNodeStatuses();
  },

  setMaterialId: (id) => {
    set({ materialId: id });
    get().refreshNodeStatuses();
  },

  setPagesConfirmed: (pages, topicos) => {
    set((s) => ({
      builderPagesConfirmed: true,
      confirmedPageList: pages,
      selectedPages: pages,
      exam: topicos != null ? { ...s.exam, topicos } : s.exam,
    }));
    pushExamToLegacySilent(get().exam);
    get().refreshNodeStatuses();
  },

  setBuilderPool: (pool) => {
    set({ builderPool: pool });
    get().refreshNodeStatuses();
  },

  setActiveHeaderId: (id) => {
    set({ activeHeaderId: id });
    get().refreshNodeStatuses();
  },

  setSelectedFigures: (ids) => {
    set({ selectedFigures: ids });
    get().refreshNodeStatuses();
  },

  toggleFigureSelection: (id) => {
    set((s) => {
      const has = s.selectedFigures.includes(id);
      return {
        selectedFigures: has
          ? s.selectedFigures.filter((x) => x !== id)
          : [...s.selectedFigures, id],
      };
    });
    get().refreshNodeStatuses();
  },

  addNodeFromPalette: (kind, position) => {
    const meta = paletteMeta(kind);
    const id = `node-${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const newNode: FlowNode = {
      id,
      type: KIND_TO_NODE_TYPE[kind],
      position,
      data: {
        kind,
        label: meta?.defaultLabel ?? meta?.label ?? kind,
        status: 'idle',
        summary: defaultSummaryForKind(kind),
      },
    };
    set((s) => ({
      nodes: [...s.nodes, newNode],
      activeNodeId: id,
    }));
    get().refreshNodeStatuses();
    return id;
  },

  confirmActiveNodeStep: () => {
    const node = get().getActiveNode();
    if (!node) return { ok: false as const, error: 'Selecione um nó no canvas.' };

    const s = get();
    const kind = node.data.kind;

    if (kind === 'config') {
      const err = validateConfigStep(s.exam);
      if (err) return { ok: false as const, error: err };
      pushExamToLegacySilent(s.exam);
    }

    if (kind === 'material') {
      const err = validateMaterialStep({
        exam: s.exam,
        materialId: s.materialId,
        selectedPages: s.selectedPages,
        builderPagesConfirmed: s.builderPagesConfirmed,
        confirmedPageList: s.confirmedPageList,
      });
      if (err) return { ok: false as const, error: err };
      pushExamToLegacySilent(s.exam);
    }

    if (kind === 'result' && !s.resultReady) {
      return { ok: false as const, error: 'Monte o material no passo Gerar e montar primeiro.' };
    }

    set((state) => ({
      confirmedNodeIds: state.confirmedNodeIds.includes(node.id)
        ? state.confirmedNodeIds
        : [...state.confirmedNodeIds, node.id],
    }));
    get().refreshNodeStatuses();
    return { ok: true as const };
  },

  hydrateFromLegacy: (snap) => {
    set({
      materialId: snap.materialId,
      bookFileName: snap.bookFileName,
      bookTotalPages: snap.bookTotalPages,
      flowTitle: snap.flowTitle || '',
      flowSavedAt: snap.flowSavedAt ?? null,
      builderPagesConfirmed: snap.builderPagesConfirmed,
      confirmedPageList: snap.confirmedPageList,
      selectedPages: snap.selectedPages,
      builderPool: snap.builderPool,
      activeHeaderId: snap.activeHeaderId ?? null,
      selectedFigures: snap.selectedFigures ?? [],
      exam: {
        ...DEFAULT_EXAM,
        ...snap.exam,
        productionKind: snap.exam.productionKind ?? DEFAULT_EXAM.productionKind,
      },
    });
    get().refreshNodeStatuses();
  },

  refreshNodeStatuses: () => {
    const s = get();
    const ctx = {
      exam: s.exam,
      materialId: s.materialId,
      bookFileName: s.bookFileName,
      builderPagesConfirmed: s.builderPagesConfirmed,
      confirmedPageList: s.confirmedPageList,
      builderPool: s.builderPool,
      activeHeaderId: s.activeHeaderId,
      selectedFigures: s.selectedFigures,
      confirmedNodeIds: s.confirmedNodeIds,
      selectedPages: s.selectedPages,
      resultReady: s.resultReady,
    };

    set({
      nodes: s.nodes.map((n) => {
        const kind = n.data.kind;
        return {
          ...n,
          data: {
            ...n.data,
            status: statusForNode(kind, n.id, ctx),
            summary: summaryForNode(kind, { ...ctx, nodeId: n.id, builderPool: s.builderPool }),
          },
        };
      }),
      edges: s.edges.map((e) => {
        const src = s.nodes.find((n) => n.id === e.source);
        const srcDone =
          src &&
          (s.confirmedNodeIds.includes(src.id) ||
            statusForNode(src.data.kind, src.id, ctx) === 'done');
        return {
          ...e,
          animated: !!srcDone,
          data: { completed: !!srcDone },
        };
      }),
    });
  },

  onMaterialMounted: () => {
    set((s) => {
      const confirmed = new Set(s.confirmedNodeIds);
      confirmed.add('node-output');
      confirmed.add('node-result');
      return {
        resultReady: true,
        activeNodeId: 'node-result',
        confirmedNodeIds: [...confirmed],
      };
    });
    get().refreshNodeStatuses();
    setTimeout(() => void window.refreshExamPreview?.(), 120);
  },

  setFlowTitle: (title) => {
    set({ flowTitle: title });
    legacySetFlowTitle(title);
  },

  saveFlow: async () => {
    const s = get();
    syncExamFieldsToLegacy(s.exam);
    legacySetFlowTitle(s.flowTitle);
    set({ flowSaving: true });
    try {
      const res = await legacySaveBuilder();
      if (res.ok && res.savedAt) {
        set({ flowSavedAt: res.savedAt });
        return { ok: true };
      }
      if (!res.ok && res.error) {
        legacyToast(res.error, 'err');
      }
      return { ok: false };
    } finally {
      set({ flowSaving: false });
    }
  },
}));
