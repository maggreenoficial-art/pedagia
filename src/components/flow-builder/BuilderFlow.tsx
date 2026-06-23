'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { FlowContextMenu, useFlowContextMenu } from '@/components/flow-builder/FlowContextMenu';
import { BuilderOnboarding } from '@/components/flow-builder/BuilderOnboarding';
import { FLOW_DND_MIME } from '@/components/flow-builder/palette-config';
import { FlowLeftPalette } from '@/components/flow-builder/FlowLeftPalette';
import { FlowNodeModal } from '@/components/flow-builder/FlowNodeModal';
import { FlowTopBar } from '@/components/flow-builder/FlowTopBar';
import { useIsMobile } from '@/components/flow-builder/useIsMobile';
import type { FlowNodeKind } from '@/components/flow-builder/flow-types';
import { MOBILE_FLOW_NODES } from '@/components/flow-builder/initial-flow';
import { AIProcessNode } from '@/components/flow-nodes/AIProcessNode';
import { ConfigNode } from '@/components/flow-nodes/ConfigNode';
import { HeaderEnrichNode } from '@/components/flow-nodes/HeaderEnrichNode';
import { MaterialNode } from '@/components/flow-nodes/MaterialNode';
import { ResultNode } from '@/components/flow-nodes/ResultNode';
import { OutputNode } from '@/components/flow-nodes/OutputNode';
import { useFlowStore } from '@/store/useFlowStore';
import { FlowBuilderLegacyHost } from '@/components/flow-builder/FlowBuilderLegacyHost';
import { OperationProgressOverlay } from '@/components/flow-builder/OperationProgressOverlay';

const nodeTypes = {
  configNode: ConfigNode,
  materialNode: MaterialNode,
  headerEnrichNode: HeaderEnrichNode,
  aiProcessNode: AIProcessNode,
  outputNode: OutputNode,
  resultNode: ResultNode,
};

function MobileFlowLayout({
  isMobile,
  fitViewOptions,
}: {
  isMobile: boolean;
  fitViewOptions: { padding: number; maxZoom: number; minZoom: number };
}) {
  const { fitView } = useReactFlow();
  const setNodes = useFlowStore((s) => s.setNodes);

  useEffect(() => {
    if (!isMobile) return;
    const current = useFlowStore.getState().nodes;
    const horizontal = current[0]?.position.x === 40 && current.at(-1)?.position.x === 1080;
    if (!horizontal) return;
    setNodes(MOBILE_FLOW_NODES);
    requestAnimationFrame(() => fitView(fitViewOptions));
  }, [isMobile, setNodes, fitView, fitViewOptions]);

  return null;
}

function BuilderFlowCanvas({ isMobile }: { isMobile: boolean }) {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const setActiveNodeId = useFlowStore((s) => s.setActiveNodeId);
  const addNodeFromPalette = useFlowStore((s) => s.addNodeFromPalette);
  const { screenToFlowPosition } = useReactFlow();
  const { menu, onPaneContextMenu, onNodeContextMenu, closeMenu } =
    useFlowContextMenu(screenToFlowPosition);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      setActiveNodeId(node.id);
    },
    [setActiveNodeId],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData(FLOW_DND_MIME) as FlowNodeKind;
      if (!kind) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNodeFromPalette(kind, position);
    },
    [addNodeFromPalette, screenToFlowPosition],
  );

  const defaultViewport = useMemo(
    () => ({
      x: isMobile ? 12 : 24,
      y: isMobile ? 12 : 24,
      zoom: isMobile ? 0.72 : 1.05,
    }),
    [isMobile],
  );

  const fitViewOptions = useMemo(
    () => ({
      padding: isMobile ? 0.12 : 0.06,
      maxZoom: isMobile ? 0.85 : 1.15,
      minZoom: isMobile ? 0.45 : 0.55,
    }),
    [isMobile],
  );

  return (
    <main className="flow-canvas relative min-h-0 min-w-0 flex-1">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu as NodeMouseHandler}
        onPaneContextMenu={
          onPaneContextMenu as unknown as (event: MouseEvent | React.MouseEvent) => void
        }
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        defaultViewport={defaultViewport}
        fitView
        fitViewOptions={fitViewOptions}
        minZoom={0.32}
        maxZoom={1.25}
        zoomOnPinch
        zoomOnScroll={!isMobile}
        panOnScroll={false}
        panOnDrag
        preventScrolling
        nodesDraggable={!isMobile}
        nodesConnectable={!isMobile}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ stroke: 'var(--flow-accent)', strokeWidth: 2 }}
        className="flow-canvas-inner"
      >
        <Background variant={BackgroundVariant.Dots} gap={isMobile ? 18 : 22} size={1.2} color="#2a3344" />
        <MobileFlowLayout isMobile={isMobile} fitViewOptions={fitViewOptions} />
        <Controls showInteractive={false} className="flow-controls" />
        {!isMobile && (
          <MiniMap className="flow-minimap" nodeColor="#f0b429" maskColor="rgba(13,17,23,0.8)" />
        )}
      </ReactFlow>
      <FlowContextMenu menu={menu} onClose={closeMenu} onAddNode={addNodeFromPalette} />
    </main>
  );
}

function BuilderFlowInner() {
  const isMobile = useIsMobile();

  return (
    <div className={`flow-builder-main relative flex min-h-0 flex-1 ${isMobile ? 'flow-builder-main--mobile' : ''}`}>
      <BuilderFlowCanvas isMobile={isMobile} />
      <FlowLeftPalette />
      <FlowNodeModal />
    </div>
  );
}

export function BuilderFlow() {
  return (
    <div className="flow-builder-root flex h-full min-h-0 flex-col">
      <FlowTopBar />
      <FlowBuilderLegacyHost />
      <OperationProgressOverlay />
      <ReactFlowProvider>
        <BuilderFlowInner />
      </ReactFlowProvider>
      <BuilderOnboarding />
    </div>
  );
}
