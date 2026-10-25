import { HOST_URL, MOCK_PROVIDER_ID } from "../config";
import type {
  AgentData,
  FlowNode,
  Provider,
  ProviderInput,
  ProviderKind,
  ProviderPreset,
} from "../types";
import { fetchWithTimeout, TIMEOUTS } from "./http";

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = (await response.json()) as { detail?: string };
      if (err.detail) detail = err.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export async function checkHostHealth(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `${HOST_URL}/health`,
      {},
      TIMEOUTS.health,
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function upsertHostAgent(
  nodeId: string,
  data: AgentData,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetchWithTimeout(
    `${HOST_URL}/agents/${encodeURIComponent(nodeId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: data.kind,
        name:
          data.name ||
          (data.kind === "writer" ? "Writer Agent" : "Critic Agent"),
        instructions: data.instructions,
        providerId: data.providerId || MOCK_PROVIDER_ID,
        model: data.model || MOCK_PROVIDER_ID,
        temperature: data.temperature,
      }),
      signal,
    },
    TIMEOUTS.metadata,
  );
  await readJson(res);
}

export async function deleteHostAgent(nodeId: string): Promise<void> {
  try {
    await fetchWithTimeout(
      `${HOST_URL}/agents/${encodeURIComponent(nodeId)}`,
      { method: "DELETE" },
      TIMEOUTS.metadata,
    );
  } catch {
    // ignore network error on cleanup
  }
}

export async function syncFlowAgents(
  nodes: FlowNode[],
  signal?: AbortSignal,
): Promise<void> {
  const agentNodes = nodes.filter(
    (node): node is FlowNode & { data: AgentData } =>
      node.data.kind === "writer" || node.data.kind === "critic",
  );
  await Promise.all(
    agentNodes.map((node) => upsertHostAgent(node.id, node.data, signal)),
  );
}

export async function fetchPresets(): Promise<
  Record<ProviderKind, ProviderPreset>
> {
  const res = await fetchWithTimeout(
    `${HOST_URL}/presets`,
    {},
    TIMEOUTS.metadata,
  );
  return readJson<Record<ProviderKind, ProviderPreset>>(res);
}

export async function fetchProviders(): Promise<Provider[]> {
  const res = await fetchWithTimeout(
    `${HOST_URL}/providers`,
    {},
    TIMEOUTS.metadata,
  );
  return readJson<Provider[]>(res);
}

export async function saveProvider(
  providerId: string,
  input: ProviderInput,
): Promise<Provider> {
  const res = await fetchWithTimeout(
    `${HOST_URL}/providers/${encodeURIComponent(providerId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    TIMEOUTS.metadata,
  );
  return readJson<Provider>(res);
}

export async function deleteProvider(providerId: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${HOST_URL}/providers/${encodeURIComponent(providerId)}`,
    { method: "DELETE" },
    TIMEOUTS.metadata,
  );
  await readJson(res);
}

export async function fetchProviderModels(
  providerId: string,
): Promise<string[]> {
  const res = await fetchWithTimeout(
    `${HOST_URL}/providers/${encodeURIComponent(providerId)}/models`,
    { method: "POST" },
    TIMEOUTS.models,
  );
  const data = await readJson<{ models: string[] }>(res);
  return data.models;
}
