import type { FlowNode, Rubric } from "../types";

export function formatRubricPrompt(rubric: Rubric): string {
  const criteria = rubric.criteria.filter((criterion) => criterion.name.trim());
  if (criteria.length === 0) return "";

  const description = rubric.description.trim()
    ? ` — ${rubric.description.trim()}`
    : "";
  const lines = criteria.map(
    (criterion, index) =>
      `${index + 1}. ${criterion.name.trim()} (peso ${criterion.weight}%): ${
        criterion.description.trim() || "Sin descripción."
      }`,
  );

  return [
    `Rúbrica de evaluación: ${rubric.name}${description}`,
    ...lines,
    'Puntuá cada criterio de 1 a 5 en "scores" usando el nombre del criterio como clave.',
  ].join("\n");
}

export function applyRubricToNodes(
  nodes: FlowNode[],
  rubric: Rubric | undefined,
): FlowNode[] {
  if (!rubric) return nodes;
  const rubricPrompt = formatRubricPrompt(rubric);
  if (!rubricPrompt) return nodes;

  return nodes.map((node) => {
    if (node.data.kind !== "critic") return node;
    return {
      ...node,
      data: {
        ...node.data,
        instructions:
          `${node.data.instructions.trim()}\n\n${rubricPrompt}`.trim(),
      },
    };
  });
}
