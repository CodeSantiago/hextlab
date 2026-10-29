import type { Edge, Node } from "@xyflow/react";

export type AgentStatus =
  "idle" | "working" | "completed" | "failed" | "input-required";

export type TaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled";

// --- Grafo -----------------------------------------------------------------

export type AgentRole = "writer" | "critic";
export type NodeKind = "trigger" | AgentRole | "blank";

export type TriggerData = {
  kind: "trigger";
  name: string;
  input: string;
};

export type AgentData = {
  kind: AgentRole;
  name: string;
  instructions: string;
  providerId: string;
  model: string;
  temperature: number | null;
};

export type BlankData = {
  kind: "blank";
  name: string;
  note: string;
};

export type FlowNodeData = TriggerData | AgentData | BlankData;
export type FlowNode = Node<FlowNodeData, NodeKind>;
export type FlowEdge = Edge;

// Datos que el canvas agrega en render (no se persisten).
export type RenderExtras = {
  status: AgentStatus;
  providerName?: string;
  agentUrl?: string;
};

// --- Proyectos y rúbricas --------------------------------------------------

export type RubricCriterion = {
  id: string;
  name: string;
  description: string;
  weight: number;
};

export type Rubric = {
  id: string;
  name: string;
  description: string;
  criteria: RubricCriterion[];
  builtin: boolean;
};

export type Project = {
  id: string;
  name: string;
  rubricId: string | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  createdAt: number;
  updatedAt: number;
};

export type WorkspaceState = {
  projects: Project[];
  activeProjectId: string;
  rubrics: Rubric[];
};

// --- Proveedores -----------------------------------------------------------

export type ProviderKind =
  | "mock"
  | "opencode-go"
  | "openai"
  | "anthropic"
  | "gemini"
  | "groq"
  | "openrouter"
  | "ollama"
  | "custom";

export interface ProviderPreset {
  label: string;
  baseUrl: string;
  needsKey: boolean;
  suggestedModels: string[];
}

export interface Provider {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  models: string[];
  hasKey: boolean;
  keyPreview: string;
  builtin: boolean;
}

export interface ProviderInput {
  kind: ProviderKind;
  name: string;
  apiKey?: string;
  baseUrl: string;
  models: string[];
}

export interface Pricing {
  inputPer1K: number;
  outputPer1K: number;
}

// --- A2A -------------------------------------------------------------------

export interface AgentSkill {
  id: string;
  name: string;
  description?: string;
}

export interface AgentCard {
  name: string;
  description?: string;
  version?: string;
  protocolVersion?: string;
  url: string;
  skills?: AgentSkill[];
}

export interface MessagePart {
  kind: "text" | "data" | "file";
  text?: string;
  data?: unknown;
}

export interface Artifact {
  artifactId: string;
  name?: string;
  parts: MessagePart[];
  metadata?: Record<string, unknown>;
}

export interface TaskStatus {
  state: TaskState;
  timestamp?: string;
  message?: { parts?: MessagePart[] };
}

export interface Task {
  kind: "task";
  id: string;
  contextId: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  metadata?: Record<string, unknown>;
}

export interface ReviewData {
  approved: boolean;
  scores: Record<string, number>;
  observations: string[];
  summary: string;
}

// --- Ejecución -------------------------------------------------------------

export type CostSource = "provider" | "catalog" | "local" | "manual";

export interface TraceStep {
  id: string;
  nodeId: string;
  nodeName: string;
  kind: AgentRole;
  iteration: number;
  state: TaskState;
  prompt: string;
  systemPrompt?: string;
  model?: string;
  providerId?: string;
  agentUrl?: string;
  request: unknown;
  response?: unknown;
  output?: string;
  review?: ReviewData;
  error?: string;
  tokensInput: number;
  tokensOutput: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  serverLatencyMs: number;
  clientLatencyMs: number;
  cost: number;
  costSource: CostSource;
  estimated: boolean;
  timestamp: string;
}

export interface RunResult {
  id: string;
  input: string;
  systemPrompt: string;
  draft: string;
  approved: boolean;
  iterations: number;
  status: "completed" | "failed";
  message: string;
  totalTokens: number;
  totalCost: number;
}

export type RunState = "idle" | "running" | "completed" | "failed";
