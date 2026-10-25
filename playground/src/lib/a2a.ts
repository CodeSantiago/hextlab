import { HOST_URL } from "../config";
import type { AgentCard, Task } from "../types";
import { fetchWithTimeout, TIMEOUTS } from "./http";
import { newId } from "./id";

interface JsonRpcError {
  code: number;
  message: string;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: string;
  result?: Task;
  error?: JsonRpcError;
}

export interface MessageInput {
  text: string;
  contextId?: string;
}

export function agentBaseUrl(agentId: string): string {
  return `${HOST_URL}/agents/${encodeURIComponent(agentId)}`;
}

export function buildMessagePayload({ text, contextId }: MessageInput) {
  return {
    jsonrpc: "2.0",
    id: newId(),
    method: "message/send",
    params: {
      message: {
        kind: "message",
        role: "user",
        messageId: newId(),
        parts: [{ kind: "text", text }],
        ...(contextId ? { contextId } : {}),
      },
    },
  };
}

export async function fetchAgentCard(
  agentId: string,
  signal?: AbortSignal,
): Promise<AgentCard> {
  const baseUrl = agentBaseUrl(agentId);
  const response = await fetchWithTimeout(
    `${baseUrl}/.well-known/agent-card.json`,
    { signal },
    TIMEOUTS.metadata,
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al leer Agent Card de ${agentId}`);
  }
  return (await response.json()) as AgentCard;
}

export async function postMessage(
  agentId: string,
  payload: unknown,
  signal?: AbortSignal,
) {
  const baseUrl = agentBaseUrl(agentId);
  const started = performance.now();
  const httpResponse = await fetchWithTimeout(
    `${baseUrl}/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    TIMEOUTS.message,
  );
  const latencyMs = Math.round((performance.now() - started) * 10) / 10;

  let body: JsonRpcResponse;
  try {
    body = (await httpResponse.json()) as JsonRpcResponse;
  } catch {
    throw new Error(`Respuesta no JSON (HTTP ${httpResponse.status})`);
  }

  if (!httpResponse.ok) {
    throw new Error(`HTTP ${httpResponse.status}`);
  }
  if (body.error) {
    throw new Error(`JSON-RPC ${body.error.code}: ${body.error.message}`);
  }
  if (!body.result) {
    throw new Error("La respuesta JSON-RPC no trae result");
  }

  return { task: body.result, response: body, latencyMs };
}

export function textFromTask(task: Task): string {
  return (task.artifacts ?? [])
    .flatMap((artifact) => artifact.parts)
    .filter((part) => part.kind === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n");
}

export function statusMessageFromTask(task: Task): string {
  return (task.status.message?.parts ?? [])
    .filter((part) => part.kind === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n");
}

export function dataFromTask<T>(task: Task): T | undefined {
  const part = (task.artifacts ?? [])
    .flatMap((artifact) => artifact.parts)
    .find((candidate) => candidate.kind === "data");
  return part?.data as T | undefined;
}

export function metadataFromTask(task: Task): Record<string, unknown> {
  return task.artifacts?.[0]?.metadata ?? {};
}
