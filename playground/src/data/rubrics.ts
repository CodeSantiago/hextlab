import { newId } from "../lib/id";
import type { Rubric } from "../types";

export const RUBRIC_TEMPLATES: Rubric[] = [
  {
    id: "tpl-claridad",
    name: "Claridad y precisión",
    description:
      "Para textos explicativos: que se entiendan sin esfuerzo y no digan cosas incorrectas.",
    builtin: true,
    criteria: [
      {
        id: "tpl-claridad-c1",
        name: "Claridad",
        description:
          "Ideas fáciles de seguir, una por oración y sin ambigüedad.",
        weight: 30,
      },
      {
        id: "tpl-claridad-c2",
        name: "Precisión",
        description: "Datos correctos y afirmaciones verificables.",
        weight: 30,
      },
      {
        id: "tpl-claridad-c3",
        name: "Estructura",
        description:
          "Introducción, desarrollo y cierre con una progresión lógica.",
        weight: 20,
      },
      {
        id: "tpl-claridad-c4",
        name: "Tono",
        description: "Registro adecuado al público y al contexto.",
        weight: 20,
      },
    ],
  },
  {
    id: "tpl-tecnica",
    name: "Contenido técnico",
    description:
      "Para documentación y explicaciones de ingeniería: rigor, cobertura y utilidad real.",
    builtin: true,
    criteria: [
      {
        id: "tpl-tecnica-c1",
        name: "Rigor técnico",
        description: "Conceptos correctos, sin simplificaciones engañosas.",
        weight: 35,
      },
      {
        id: "tpl-tecnica-c2",
        name: "Cobertura",
        description: "Responde el pedido completo sin huecos importantes.",
        weight: 25,
      },
      {
        id: "tpl-tecnica-c3",
        name: "Ejemplos",
        description: "Casos concretos que aterrizan la explicación.",
        weight: 20,
      },
      {
        id: "tpl-tecnica-c4",
        name: "Accionabilidad",
        description: "El lector puede aplicar lo que leyó.",
        weight: 20,
      },
    ],
  },
  {
    id: "tpl-seo",
    name: "Contenido SEO",
    description:
      "Para piezas publicables: intención de búsqueda, legibilidad y llamado a la acción.",
    builtin: true,
    criteria: [
      {
        id: "tpl-seo-c1",
        name: "Intención de búsqueda",
        description: "El texto responde lo que el lector vino a buscar.",
        weight: 30,
      },
      {
        id: "tpl-seo-c2",
        name: "Palabras clave",
        description: "Uso natural de los términos relevantes, sin relleno.",
        weight: 25,
      },
      {
        id: "tpl-seo-c3",
        name: "Legibilidad",
        description: "Párrafos cortos, subtítulos y frases directas.",
        weight: 25,
      },
      {
        id: "tpl-seo-c4",
        name: "Llamado a la acción",
        description: "Cierre con un siguiente paso claro.",
        weight: 20,
      },
    ],
  },
  {
    id: "tpl-creativa",
    name: "Escritura creativa",
    description:
      "Para ficción y contenido de marca: voz propia, imágenes potentes y un cierre memorable.",
    builtin: true,
    criteria: [
      {
        id: "tpl-creativa-c1",
        name: "Originalidad",
        description: "Evita lugares comunes y propone una mirada propia.",
        weight: 30,
      },
      {
        id: "tpl-creativa-c2",
        name: "Voz",
        description: "Tono consistente y reconocible a lo largo del texto.",
        weight: 25,
      },
      {
        id: "tpl-creativa-c3",
        name: "Imágenes",
        description:
          "Detalles sensoriales y metáforas que sostienen la escena.",
        weight: 25,
      },
      {
        id: "tpl-creativa-c4",
        name: "Cierre",
        description: "Final que deja resonancia sin explicar de más.",
        weight: 20,
      },
    ],
  },
];

export function createBlankRubric(): Rubric {
  return {
    id: newId(),
    name: "Nueva rúbrica",
    description: "",
    builtin: false,
    criteria: [
      {
        id: newId(),
        name: "",
        description: "",
        weight: 25,
      },
    ],
  };
}

export function createRubricFromTemplate(
  template: Rubric,
  name?: string,
): Rubric {
  return {
    id: newId(),
    name: name ?? `${template.name} (copia)`,
    description: template.description,
    builtin: false,
    criteria: template.criteria.map((criterion) => ({
      ...criterion,
      id: newId(),
    })),
  };
}
