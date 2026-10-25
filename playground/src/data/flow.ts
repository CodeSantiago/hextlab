import { MarkerType } from "@xyflow/react";
import {
  DEFAULT_INSTRUCTIONS,
  DEFAULT_TOPIC,
  MOCK_PROVIDER_ID,
} from "../config";
import type { FlowEdge, FlowNode } from "../types";

export const defaultFlowNodes: FlowNode[] = [
  {
    id: "trigger-1",
    type: "trigger",
    position: { x: 60, y: 150 },
    data: {
      kind: "trigger",
      name: "Trigger manual",
      input: DEFAULT_TOPIC,
    },
  },
  {
    id: "writer-1",
    type: "writer",
    position: { x: 370, y: 135 },
    data: {
      kind: "writer",
      name: "Writer Agent",
      instructions: DEFAULT_INSTRUCTIONS.writer,
      providerId: MOCK_PROVIDER_ID,
      model: MOCK_PROVIDER_ID,
      temperature: null,
    },
  },
  {
    id: "critic-1",
    type: "critic",
    position: { x: 710, y: 135 },
    data: {
      kind: "critic",
      name: "Critic Agent",
      instructions: DEFAULT_INSTRUCTIONS.critic,
      providerId: MOCK_PROVIDER_ID,
      model: MOCK_PROVIDER_ID,
      temperature: null,
    },
  },
];

export const defaultFlowEdges: FlowEdge[] = [
  {
    id: "e-trigger-writer",
    source: "trigger-1",
    sourceHandle: "out",
    target: "writer-1",
    targetHandle: "in",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  },
  {
    id: "e-writer-critic",
    source: "writer-1",
    sourceHandle: "out",
    target: "critic-1",
    targetHandle: "in",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  },
  {
    id: "e-critic-writer-loop",
    source: "critic-1",
    sourceHandle: "loop-out",
    target: "writer-1",
    targetHandle: "loop-in",
    label: "rehacer",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  },
];
