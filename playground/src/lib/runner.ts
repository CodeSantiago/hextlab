import {
  agentBaseUrl,
  buildMessagePayload,
  dataFromTask,
  fetchAgentCard,
  metadataFromTask,
  postMessage,
  statusMessageFromTask,
  textFromTask,
} from "./a2a";
import { MOCK_PROVIDER_ID, REWRITE_MARKERS } from "../config";
import { syncFlowAgents } from "./host";
import { newId } from "./id";
import { toAgentStatus } from "./status";
import type {
  AgentCard,
  AgentData,
  AgentStatus,
  FlowEdge,
  FlowNode,
  Pricing,
  ReviewData,
  RunResult,
  Task,
  TraceStep,
  TriggerData,
} from "../types";

function costOf(
  tokensInput: number,
  tokensOutput: number,
  pricing: Pricing,
): number {
  return (
    (tokensInput / 1000) * pricing.inputPer1K +
    (tokensOutput / 1000) * pricing.outputPer1K
  );
}

function buildStep(args: {
  node: FlowNode & { data: AgentData };
  iteration: number;
  prompt: string;
  request: unknown;
  response: unknown;
  task: Task;
  clientLatencyMs: number;
  pricing: Pricing;
  output?: string;
  review?: ReviewData;
  error?: string;
}): TraceStep {
  const metadata = metadataFromTask(args.task);
  const tokensInput = Number(metadata.tokensInput ?? 0);
  const tokensOutput = Number(metadata.tokensOutput ?? 0);
  const serverLatencyMs = Number(metadata.latencyMs ?? args.clientLatencyMs);

  return {
    id: newId(),
    nodeId: args.node.id,
    nodeName: args.node.data.name,
    kind: args.node.data.kind,
    iteration: args.iteration,
    state: args.task.status.state,
    prompt: args.prompt,
    systemPrompt: String(metadata.systemPrompt ?? args.node.data.instructions),
    model: String(metadata.model ?? args.node.data.model ?? MOCK_PROVIDER_ID),
    providerId: String(
      metadata.provider ?? args.node.data.providerId ?? MOCK_PROVIDER_ID,
    ),
    agentUrl: `${agentBaseUrl(args.node.id)}/`,
    request: args.request,
    response: args.response,
    output: args.output,
    review: args.review,
    error: args.error,
    tokensInput,
    tokensOutput,
    serverLatencyMs,
    clientLatencyMs: args.clientLatencyMs,
    cost: costOf(tokensInput, tokensOutput, args.pricing),
    estimated: Boolean(metadata.estimated),
    timestamp: new Date().toISOString(),
  };
}

function buildFailedStep(args: {
  node: FlowNode & { data: AgentData };
  iteration: number;
  prompt: string;
  request: unknown;
  error: string;
  clientLatencyMs: number;
}): TraceStep {
  return {
    id: newId(),
    nodeId: args.node.id,
    nodeName: args.node.data.name,
    kind: args.node.data.kind,
    iteration: args.iteration,
    state: "failed",
    prompt: args.prompt,
    systemPrompt: args.node.data.instructions,
    model: args.node.data.model,
    providerId: args.node.data.providerId,
    agentUrl: `${agentBaseUrl(args.node.id)}/`,
    request: args.request,
    error: args.error,
    tokensInput: 0,
    tokensOutput: 0,
    serverLatencyMs: args.clientLatencyMs,
    clientLatencyMs: args.clientLatencyMs,
    cost: 0,
    estimated: true,
    timestamp: new Date().toISOString(),
  };
}

function findNextNode(
  fromId: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  preferLoopHandle = false,
): FlowNode | undefined {
  const candidates = edges.filter((edge) => edge.source === fromId);
  const chosen = preferLoopHandle
    ? (candidates.find((e) => e.sourceHandle === "loop-out") ?? candidates[0])
    : (candidates.find((e) => e.sourceHandle !== "loop-out") ?? candidates[0]);
  if (!chosen) return undefined;
  return nodes.find((node) => node.id === chosen.target);
}

export interface RunFlowCallbacks {
  onStatusChange: (nodeId: string, status: AgentStatus) => void;
  onResetStatuses: () => void;
  onCardLoaded: (nodeId: string, card: AgentCard) => void;
  onStep: (step: TraceStep) => void;
  onIteration: (iteration: number) => void;
}

export async function executeFlow(args: {
  nodes: FlowNode[];
  edges: FlowEdge[];
  maxIterations: number;
  pricing: Pricing;
  signal?: AbortSignal;
  callbacks: RunFlowCallbacks;
}): Promise<RunResult> {
  const { nodes, edges, maxIterations, pricing, signal, callbacks } = args;

  const emit: RunFlowCallbacks = {
    onStatusChange: (nodeId, status) => {
      if (!signal?.aborted) callbacks.onStatusChange(nodeId, status);
    },
    onResetStatuses: () => {
      if (!signal?.aborted) callbacks.onResetStatuses();
    },
    onCardLoaded: (nodeId, card) => {
      if (!signal?.aborted) callbacks.onCardLoaded(nodeId, card);
    },
    onStep: (step) => {
      if (!signal?.aborted) callbacks.onStep(step);
    },
    onIteration: (iteration) => {
      if (!signal?.aborted) callbacks.onIteration(iteration);
    },
  };

  const trigger = nodes.find(
    (n): n is FlowNode & { data: TriggerData } => n.data.kind === "trigger",
  );
  if (!trigger) {
    throw new Error("El flujo necesita un nodo Trigger para iniciar.");
  }

  const initialInput = trigger.data.input.trim();
  if (!initialInput) {
    throw new Error("El nodo Trigger no tiene texto de entrada.");
  }

  const firstNode = findNextNode(trigger.id, nodes, edges);
  if (!firstNode || firstNode.data.kind === "trigger") {
    throw new Error(
      "ConectÃ¡ la salida del Trigger a un agente (Escritor o CrÃ­tico).",
    );
  }

  for (const node of nodes) {
    if (
      (node.data.kind === "writer" || node.data.kind === "critic") &&
      node.data.providerId !== MOCK_PROVIDER_ID &&
      (!node.data.model || node.data.model === MOCK_PROVIDER_ID)
    ) {
      throw new Error(
        `El nodo "${node.data.name}" no tiene un modelo real elegido.`,
      );
    }
  }

  // Sincronizamos todos los agentes del grafo en el host y leemos sus Agent Cards.
  await syncFlowAgents(nodes, signal);
  for (const node of nodes) {
    if (node.data.kind === "writer" || node.data.kind === "critic") {
      const card = await fetchAgentCard(node.id, signal);
      emit.onCardLoaded(node.id, card);
    }
  }

  emit.onResetStatuses();
  emit.onStatusChange(trigger.id, "working");

  let currentNode: FlowNode | undefined = firstNode;
  let contextId: string | undefined;
  let draft = "";
  let observations: string[] = [];
  let approved = false;
  let iteration = 1;
  let writerRuns = 0;
  let primaryPrompt = "";
  const allSteps: TraceStep[] = [];
  let guardSteps = 0;

  try {
    const maxSteps =
      Math.max(1, maxIterations) * Math.max(1, nodes.length) + nodes.length;

    while (currentNode && currentNode.data.kind !== "trigger") {
      if (signal?.aborted) {
        throw new Error("Run cancelado.");
      }
      guardSteps += 1;
      if (guardSteps > maxSteps) {
        throw new Error(
          "El flujo superÃ³ el lÃ­mite de pasos por posibles ciclos.",
        );
      }

      const agentNode = currentNode as FlowNode & { data: AgentData };
      if (agentNode.data.kind === "writer") {
        writerRuns += 1;
        iteration = writerRuns;
        emit.onIteration(iteration);
        if (!primaryPrompt) {
          primaryPrompt = agentNode.data.instructions;
        }
      }

      const userPrompt =
        agentNode.data.kind === "writer"
          ? writerRuns === 1 || observations.length === 0
            ? initialInput
            : `${REWRITE_MARKERS.originalRequest}\n${initialInput}\n\nBorrador anterior:\n${draft}\n\n${REWRITE_MARKERS.feedback}\n${observations
                .map((obs) => `- ${obs}`)
                .join(
                  "\n",
                )}\n\nReescribÃ­ el borrador incorporando las observaciones.`
          : draft || initialInput;

      emit.onStatusChange(agentNode.id, "working");
      const payload = buildMessagePayload({ text: userPrompt, contextId });
      const started = performance.now();
      let recorded = false;

      try {
        const { task, response, latencyMs } = await postMessage(
          agentNode.id,
          payload,
          signal,
        );
        contextId = task.contextId;
        const status = toAgentStatus(task.status.state);
        emit.onStatusChange(agentNode.id, status);

        if (task.status.state !== "completed") {
          const reason =
            statusMessageFromTask(task) ||
            `El agente terminÃ³ en estado "${task.status.state}".`;
          const step = buildStep({
            node: agentNode,
            iteration,
            prompt: userPrompt,
            request: payload,
            response,
            task,
            clientLatencyMs: latencyMs,
            pricing,
            error: reason,
          });
          allSteps.push(step);
          emit.onStep(step);
          recorded = true;
          throw new Error(reason);
        }

        if (agentNode.data.kind === "writer") {
          draft = textFromTask(task);
          const step = buildStep({
            node: agentNode,
            iteration,
            prompt: userPrompt,
            request: payload,
            response,
            task,
            clientLatencyMs: latencyMs,
            pricing,
            output: draft,
          });
          allSteps.push(step);
          emit.onStep(step);
          recorded = true;

          if (!draft.trim()) {
            throw new Error("El escritor no devolviÃ³ texto.");
          }

          const next = findNextNode(agentNode.id, nodes, edges, false);
          if (!next) {
            approved = true;
            emit.onStatusChange(trigger.id, "completed");
            return summarizeResult({
              input: initialInput,
              systemPrompt: primaryPrompt,
              draft,
              approved: true,
              iterations: iteration,
              status: "completed",
              message: "Borrador generado (sin nodo crÃ­tico conectado).",
              steps: allSteps,
            });
          }
          currentNode = next;
        } else {
          const review = dataFromTask<ReviewData>(task);
          const step = buildStep({
            node: agentNode,
            iteration,
            prompt: userPrompt,
            request: payload,
            response,
            task,
            clientLatencyMs: latencyMs,
            pricing,
            output: review?.summary ?? textFromTask(task),
            review,
          });
          allSteps.push(step);
          emit.onStep(step);
          recorded = true;

          if (!review) {
            throw new Error(
              "El crÃ­tico no devolviÃ³ el data part con la revisiÃ³n.",
            );
          }

          observations = review.observations ?? [];
          if (review.approved) {
            approved = true;
            const forward = edges.find(
              (e) => e.source === agentNode.id && e.sourceHandle === "out",
            );
            if (forward) {
              currentNode = nodes.find((n) => n.id === forward.target);
              continue;
            }
            emit.onStatusChange(trigger.id, "completed");
            return summarizeResult({
              input: initialInput,
              systemPrompt: primaryPrompt,
              draft,
              approved: true,
              iterations: iteration,
              status: "completed",
              message: `Aprobado por ${agentNode.data.name} en la iteraciÃ³n ${iteration}.`,
              steps: allSteps,
            });
          }

          // No aprobado: buscamos arista de loop o revisamos lÃ­mite de iteraciones.
          const loopTarget = findNextNode(agentNode.id, nodes, edges, true);
          if (!loopTarget || iteration >= maxIterations) {
            emit.onStatusChange(trigger.id, "failed");
            return summarizeResult({
              input: initialInput,
              systemPrompt: primaryPrompt,
              draft,
              approved: false,
              iterations: iteration,
              status: "failed",
              message:
                iteration >= maxIterations
                  ? `Se alcanzÃ³ MAX_ITERATIONS (${maxIterations}) sin aprobaciÃ³n del crÃ­tico.`
                  : "El crÃ­tico rechazÃ³ el borrador y no hay conexiÃ³n de 'rehacer' hacia un escritor.",
              steps: allSteps,
            });
          }
          currentNode = loopTarget;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!recorded) {
          const failedStep = buildFailedStep({
            node: agentNode,
            iteration,
            prompt: userPrompt,
            request: payload,
            error: message,
            clientLatencyMs:
              Math.round((performance.now() - started) * 10) / 10,
          });
          allSteps.push(failedStep);
          emit.onStep(failedStep);
          emit.onStatusChange(agentNode.id, "failed");
        }
        throw err;
      }
    }

    emit.onStatusChange(trigger.id, approved ? "completed" : "failed");
    return summarizeResult({
      input: initialInput,
      systemPrompt: primaryPrompt,
      draft,
      approved,
      iterations: iteration,
      status: approved ? "completed" : "failed",
      message: approved
        ? "Flujo completado."
        : "El flujo terminÃ³ sin aprobaciÃ³n.",
      steps: allSteps,
    });
  } catch (err) {
    emit.onStatusChange(trigger.id, "failed");
    const message = err instanceof Error ? err.message : String(err);
    return summarizeResult({
      input: initialInput,
      systemPrompt: primaryPrompt,
      draft,
      approved: false,
      iterations: iteration,
      status: "failed",
      message: signal?.aborted ? "Run cancelado." : `El run fallÃ³: ${message}`,
      steps: allSteps,
    });
  }
}

function summarizeResult(args: {
  input: string;
  systemPrompt: string;
  draft: string;
  approved: boolean;
  iterations: number;
  status: "completed" | "failed";
  message: string;
  steps: TraceStep[];
}): RunResult {
  const totalTokens = args.steps.reduce(
    (acc, step) => acc + step.tokensInput + step.tokensOutput,
    0,
  );
  const totalCost = args.steps.reduce((acc, step) => acc + step.cost, 0);
  return {
    id: newId(),
    input: args.input,
    systemPrompt: args.systemPrompt,
    draft: args.draft,
    approved: args.approved,
    iterations: args.iterations,
    status: args.status,
    message: args.message,
    totalTokens,
    totalCost,
  };
}
