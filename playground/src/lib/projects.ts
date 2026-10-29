import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from "../config";
import { defaultFlowEdges, defaultFlowNodes } from "../data/flow";
import type {
  FlowEdge,
  FlowNode,
  Project,
  Rubric,
  RubricCriterion,
  WorkspaceState,
} from "../types";
import { newId } from "./id";

export function createProject(
  name: string,
  nodes: FlowNode[] = [],
  edges: FlowEdge[] = [],
): Project {
  const now = Date.now();
  return {
    id: newId(),
    name: name.trim() || "Proyecto sin nombre",
    rubricId: null,
    nodes,
    edges,
    createdAt: now,
    updatedAt: now,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeCriterion(raw: unknown): RubricCriterion | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.name !== "string") return null;
  const weight = Number(raw.weight);
  return {
    id: typeof raw.id === "string" ? raw.id : newId(),
    name: raw.name,
    description: typeof raw.description === "string" ? raw.description : "",
    weight: Number.isFinite(weight) ? Math.max(1, Math.min(100, weight)) : 25,
  };
}

function normalizeRubric(raw: unknown): Rubric | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  const criteria = Array.isArray(raw.criteria)
    ? raw.criteria
        .map(normalizeCriterion)
        .filter((item): item is RubricCriterion => item !== null)
    : [];
  return {
    id: raw.id,
    name: raw.name,
    description: typeof raw.description === "string" ? raw.description : "",
    criteria,
    builtin: false,
  };
}

function normalizeProject(raw: unknown): Project | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  const now = Date.now();
  return {
    id: raw.id,
    name: raw.name,
    rubricId: typeof raw.rubricId === "string" ? raw.rubricId : null,
    nodes: Array.isArray(raw.nodes) ? (raw.nodes as FlowNode[]) : [],
    edges: Array.isArray(raw.edges) ? (raw.edges as FlowEdge[]) : [],
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : now,
  };
}

function readStoredFlow(): { nodes: FlowNode[]; edges: FlowEdge[] } | null {
  for (const key of [STORAGE_KEYS.flow, LEGACY_STORAGE_KEYS.flow]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as {
        nodes?: unknown;
        edges?: unknown;
      };
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
        return {
          nodes: parsed.nodes as FlowNode[],
          edges: parsed.edges as FlowEdge[],
        };
      }
    } catch {
      // seguimos con la próxima clave
    }
  }
  return null;
}

export function loadWorkspace(): WorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.workspace);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isRecord(parsed) && Array.isArray(parsed.projects)) {
        const projects = parsed.projects
          .map(normalizeProject)
          .filter((item): item is Project => item !== null);
        const rubrics = Array.isArray(parsed.rubrics)
          ? parsed.rubrics
              .map(normalizeRubric)
              .filter((item): item is Rubric => item !== null)
          : [];
        if (projects.length > 0) {
          const storedActive =
            typeof parsed.activeProjectId === "string"
              ? parsed.activeProjectId
              : null;
          const activeProjectId = projects.some(
            (project) => project.id === storedActive,
          )
            ? storedActive!
            : projects[0].id;
          return { projects, activeProjectId, rubrics };
        }
      }
    }
  } catch {
    // workspace corrupto: caemos a la migración del flujo viejo
  }

  const storedFlow = readStoredFlow();
  const project = createProject(
    "Mi primer proyecto",
    storedFlow?.nodes ?? defaultFlowNodes,
    storedFlow?.edges ?? defaultFlowEdges,
  );
  return { projects: [project], activeProjectId: project.id, rubrics: [] };
}

export function saveWorkspace(state: WorkspaceState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.workspace, JSON.stringify(state));
  } catch {
    // localStorage puede estar lleno o bloqueado
  }
}
