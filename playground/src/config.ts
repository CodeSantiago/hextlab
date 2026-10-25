import type { AgentRole, Pricing } from "./types";

export const APP_VERSION = "0.1.0";

export const HOST_URL = (
  import.meta.env.VITE_HOST_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export const MOCK_PROVIDER_ID = "mock";
export const DEFAULT_OPENCODE_MODEL = "deepseek-v4.1-flash";

// Contrato de reescritura compartido con agents/host/roles.py.
// Si cambia un marcador, actualizá ambos lados.
export const REWRITE_MARKERS = {
  originalRequest: "Pedido original:",
  feedback: "Observaciones del crítico:",
} as const;

export const DEFAULT_TOPIC =
  "Escribí un texto sobre observabilidad en sistemas de agentes A2A.";

export const DEFAULT_INSTRUCTIONS: Record<AgentRole, string> = {
  writer:
    "Sos un escritor técnico. Redactá un borrador claro y completo, con una idea por oración y sin relleno.",
  critic:
    "Sos un crítico exigente. Evaluá claridad, precisión y tono del texto, y señalá observaciones concretas y accionables.",
};

export const CRITIC_CONTRACT_NOTE =
  'El crítico siempre devuelve JSON con {"approved", "scores", "observations", "summary"} para controlar el loop.';

export const MAX_ITERATIONS = 3;

export const DEFAULT_PRICING: Pricing = {
  inputPer1K: 0.003,
  outputPer1K: 0.006,
};

export const STORAGE_KEYS = {
  flow: "hextlab:flow:v1",
  pricing: "hextlab:pricing:v1",
} as const;

export const LEGACY_STORAGE_KEYS = {
  flow: "a2a-pg:flow:v2",
  pricing: "a2a-pg:pricing:v2",
} as const;
