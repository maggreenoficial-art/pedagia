import type { Node, NodeProps } from '@xyflow/react';

import { Handle, Position } from '@xyflow/react';

import type { FlowNodeData } from '@/components/flow-builder/flow-types';
import { paletteMeta } from '@/components/flow-builder/palette-config';
import { PfIcon, type IconName } from '@/lib/icons';
import { useFlowStore } from '@/store/useFlowStore';

const STATUS_LABEL: Record<FlowNodeData['status'], string> = {
  idle: 'Pendente',
  ready: 'Pronto',
  running: 'Processando',
  done: 'Confirmado',
  error: 'Atenção',
};

const KIND_ICON: Record<FlowNodeData['kind'], IconName> = {
  config: 'config',
  material: 'source',
  headerEnrich: 'header',
  aiProcess: 'media',
  output: 'output',
  result: 'prova',
};

type ShellProps = NodeProps<Node<FlowNodeData>> & {
  icon?: IconName;
  target?: boolean;
  source?: boolean;
};



export function FlowNodeShell({
  id,
  data,
  selected,
  icon,
  target = true,
  source = true,
}: ShellProps) {
  const setActive = useFlowStore((s) => s.setActiveNodeId);
  const activeNodeId = useFlowStore((s) => s.activeNodeId);
  const confirmedNodeIds = useFlowStore((s) => s.confirmedNodeIds);
  const isSelected = activeNodeId === id || selected;
  const meta = paletteMeta(data.kind);
  const isConfirmed = confirmedNodeIds.includes(id) || data.status === 'done';
  const iconName = icon ?? KIND_ICON[data.kind] ?? meta?.icon ?? 'config';

  return (
    <div
      className={`flow-node-card ${isSelected ? 'is-selected' : ''} ${isConfirmed ? 'is-done' : ''} ${data.status === 'ready' ? 'is-ready' : ''}`}
      onClick={() => setActive(id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setActive(id)}
    >
      {target && <Handle type="target" position={Position.Left} className="flow-handle" />}
      <div className="flow-node-card-inner">
        <div className="flow-node-icon">
          <PfIcon name={iconName} size={20} />
        </div>
        <p className="flow-node-title">{data.label}</p>
        <p className="flow-node-summary">{data.summary}</p>
        <span className={`flow-node-status ${isConfirmed ? 'done' : data.status}`}>
          {isConfirmed ? 'Confirmado' : STATUS_LABEL[data.status]}
        </span>
      </div>
      {source && <Handle type="source" position={Position.Right} className="flow-handle" />}
    </div>
  );
}

