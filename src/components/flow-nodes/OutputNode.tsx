'use client';

import type { NodeProps } from '@xyflow/react';
import type { FlowNodeData } from '@/components/flow-builder/flow-types';
import { FlowNodeShell } from '@/components/flow-nodes/FlowNodeShell';

export function OutputNode(props: NodeProps) {
  const data = props.data as FlowNodeData;
  return (
    <FlowNodeShell {...props} data={data} source={false} />
  );
}
