import type { AgentRole, Pricing } from "./types";

export const APP_VERSION = "0.2.0";

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
  'El crítico siempre devuelve JSON con {"approved", "scores", "observations", "summary"}. Con rúbrica, las claves de "scores" son los criterios.';

export type LoopLevel = {
  id: "low" | "default" | "high" | "max" | "extra";
  label: string;
  description: string;
  iterations: number;
};

export const LOOP_LEVELS: LoopLevel[] = [
  {
    id: "low",
    label: "Low",
    description: "Corte rápido: prioriza terminar antes que pulir.",
    iterations: 1,
  },
  {
    id: "default",
    label: "Default",
    description: "Equilibrio entre calidad, tokens y tiempo.",
    iterations: 3,
  },
  {
    id: "high",
    label: "High",
    description:
      "Más insistencia: le da al escritor varias chances de corregir.",
    iterations: 5,
  },
  {
    id: "max",
    label: "Max",
    description: "Máximo esfuerzo: exprime el loop antes de rendirse.",
    iterations: 8,
  },
  {
    id: "extra",
    label: "Extra max",
    description:
      "Sin concesiones: la mayor cantidad de reintentos, con más costo y latencia.",
    iterations: 12,
  },
];

export function loopLevelForIterations(iterations: number): LoopLevel {
  return (
    LOOP_LEVELS.find((level) => level.iterations === iterations) ??
    LOOP_LEVELS[1]
  );
}

export const MAX_ITERATIONS = 3;

export const DEFAULT_PRICING: Pricing = {
  inputPer1K: 0.0003,
  outputPer1K: 0.0025,
};

export const STORAGE_KEYS = {
  flow: "hextlab:flow:v1",
  pricing: "hextlab:pricing:v1",
  workspace: "hextlab:workspace:v1",
} as const;

export const LEGACY_STORAGE_KEYS = {
  flow: "a2a-pg:flow:v2",
  pricing: "a2a-pg:pricing:v2",
} as const;
