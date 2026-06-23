'use client';

import type { NodeProps } from '@xyflow/react';
import type { FlowNodeData } from '@/components/flow-builder/flow-types';
import { FlowNodeShell } from '@/components/flow-nodes/FlowNodeShell';

/** Cabeçalho + exercícios salvos (passos 3 e 5 legados). */
export function HeaderEnrichNode(props: NodeProps) {
  const data = props.data as FlowNodeData;
  return <FlowNodeShell {...props} data={data} />;
}
