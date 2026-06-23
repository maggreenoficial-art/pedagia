'use client';

import { useCallback, useEffect, useState } from 'react';
import { PALETTE_ITEMS } from '@/components/flow-builder/palette-config';
import type { FlowNodeKind } from '@/components/flow-builder/flow-types';
import { PfIcon } from '@/lib/icons';
import { useFlowStore } from '@/store/useFlowStore';

export type FlowContextMenuState = {
  x: number;
  y: number;
  kind: 'pane' | 'node';
  nodeId?: string;
  flowX?: number;
  flowY?: number;
} | null;

export function FlowContextMenu({
  menu,
  onClose,
  onAddNode,
}: {
  menu: FlowContextMenuState;
  onClose: () => void;
  onAddNode: (kind: FlowNodeKind, position: { x: number; y: number }) => void;
}) {
  const nodes = useFlowStore((s) => s.nodes);
  const setNodes = useFlowStore((s) => s.setNodes);
  const setEdges = useFlowStore((s) => s.setEdges);
  const edges = useFlowStore((s) => s.edges);
  const setActiveNodeId = useFlowStore((s) => s.setActiveNodeId);

  useEffect(() => {
    if (!menu) return;
    const onDoc = () => onClose();
    window.addEventListener('click', onDoc);
    return () => window.removeEventListener('click', onDoc);
  }, [menu, onClose]);

  if (!menu) return null;

  const duplicateNode = () => {
    if (!menu.nodeId) return;
    const src = nodes.find((n) => n.id === menu.nodeId);
    if (!src) return;
    const id = `node-dup-${Date.now().toString(36)}`;
    setNodes([
      ...nodes,
      {
        ...src,
        id,
        position: { x: src.position.x + 48, y: src.position.y + 48 },
        selected: false,
      },
    ]);
    setActiveNodeId(id);
    onClose();
  };

  const deleteNode = () => {
    if (!menu.nodeId) return;
    setNodes(nodes.filter((n) => n.id !== menu.nodeId));
    setEdges(edges.filter((e) => e.source !== menu.nodeId && e.target !== menu.nodeId));
    setActiveNodeId(null);
    onClose();
  };

  return (
    <div
      className="flow-context-menu"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
      role="menu"
    >
      {menu.kind === 'pane' && (
        <>
          <p className="flow-context-title">Adicionar bloco ao builder</p>
          {PALETTE_ITEMS.map((item) => (
            <button
              key={item.kind}
              type="button"
              className="flow-context-item"
              onClick={() => {
                if (menu.flowX != null && menu.flowY != null) {
                  onAddNode(item.kind, { x: menu.flowX, y: menu.flowY });
                }
                onClose();
              }}
            >
              <PfIcon name={item.icon} size={18} />
              {item.label}
            </button>
          ))}
        </>
      )}
      {menu.kind === 'node' && (
        <>
          <button type="button" className="flow-context-item" onClick={duplicateNode}>
            📋 Duplicar bloco
          </button>
          <button type="button" className="flow-context-item flow-context-danger" onClick={deleteNode}>
            🗑 Remover bloco
          </button>
        </>
      )}
    </div>
  );
}

export function useFlowContextMenu(
  screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number },
) {
  const [menu, setMenu] = useState<FlowContextMenuState>(null);

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const clientX = 'clientX' in event ? event.clientX : 0;
      const clientY = 'clientY' in event ? event.clientY : 0;
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
      setMenu({
        kind: 'pane',
        x: clientX,
        y: clientY,
        flowX: flowPos.x,
        flowY: flowPos.y,
      });
    },
    [screenToFlowPosition],
  );

  const onNodeContextMenu = useCallback((event: MouseEvent | React.MouseEvent, node: { id: string }) => {
    event.preventDefault();
    const clientX = 'clientX' in event ? event.clientX : 0;
    const clientY = 'clientY' in event ? event.clientY : 0;
    setMenu({ kind: 'node', x: clientX, y: clientY, nodeId: node.id });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  return { menu, onPaneContextMenu, onNodeContextMenu, closeMenu };
}
