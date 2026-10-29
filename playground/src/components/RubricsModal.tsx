import { useState } from "react";
import {
  RUBRIC_TEMPLATES,
  createBlankRubric,
  createRubricFromTemplate,
} from "../data/rubrics";
import { newId } from "../lib/id";
import type { Rubric, RubricCriterion } from "../types";

type RubricsModalProps = {
  open: boolean;
  projectName: string;
  activeRubricId: string | null;
  rubrics: Rubric[];
  onClose: () => void;
  onApply: (rubricId: string | null) => void;
  onSave: (rubric: Rubric) => void;
  onDelete: (rubricId: string) => void;
};

function cleanRubric(rubric: Rubric): Rubric {
  return {
    ...rubric,
    name: rubric.name.trim(),
    description: rubric.description.trim(),
    criteria: rubric.criteria
      .map((criterion) => ({
        ...criterion,
        name: criterion.name.trim(),
        description: criterion.description.trim(),
      }))
      .filter((criterion) => criterion.name.length > 0),
  };
}

export function RubricsModal({
  open,
  projectName,
  activeRubricId,
  rubrics,
  onClose,
  onApply,
  onSave,
  onDelete,
}: RubricsModalProps) {
  const [editing, setEditing] = useState<Rubric | null>(null);
  const [error, setError] = useState("");

  if (!open) return null;

  const available = [...RUBRIC_TEMPLATES, ...rubrics];
  const activeRubric = available.find((rubric) => rubric.id === activeRubricId);

  function startNewRubric() {
    setError("");
    setEditing(createBlankRubric());
  }

  function startFromTemplate(template: Rubric) {
    setError("");
    setEditing(createRubricFromTemplate(template));
  }

  function startEdit(rubric: Rubric) {
    setError("");
    setEditing({
      ...rubric,
      criteria: rubric.criteria.map((criterion) => ({ ...criterion })),
    });
  }

  function updateCriterion(
    criterionId: string,
    patch: Partial<RubricCriterion>,
  ) {
    setEditing((current) =>
      current
        ? {
            ...current,
            criteria: current.criteria.map((criterion) =>
              criterion.id === criterionId
                ? { ...criterion, ...patch }
                : criterion,
            ),
          }
        : current,
    );
  }

  function addCriterion() {
    setEditing((current) =>
      current
        ? {
            ...current,
            criteria: [
              ...current.criteria,
              {
                id: newId(),
                name: "",
                description: "",
                weight: 25,
              },
            ],
          }
        : current,
    );
  }

  function removeCriterion(criterionId: string) {
    setEditing((current) =>
      current && current.criteria.length > 1
        ? {
            ...current,
            criteria: current.criteria.filter(
              (criterion) => criterion.id !== criterionId,
            ),
          }
        : current,
    );
  }

  function save(apply: boolean) {
    if (!editing) return;
    const cleaned = cleanRubric(editing);
    if (!cleaned.name) {
      setError("La rúbrica necesita un nombre.");
      return;
    }
    if (cleaned.criteria.length === 0) {
      setError("Agregá al menos un criterio con nombre.");
      return;
    }
    onSave(cleaned);
    if (apply) {
      onApply(cleaned.id);
    }
    setEditing(null);
    setError("");
  }

  return (
    <div className="oc-backdrop" onClick={onClose}>
      <div
        className="oc-modal rubrics-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Rúbricas"
      >
        {editing ? (
          <div className="oc-content rubrics-content">
            <div className="rubric-editor-head">
              <button
                type="button"
                className="oc-text-btn"
                onClick={() => {
                  setEditing(null);
                  setError("");
                }}
              >
                ← Volver
              </button>
              <span className="rubric-kicker">
                {editing.builtin ? "Plantilla" : "Rúbrica personalizada"}
              </span>
            </div>

            <div className="rubric-editor-fields">
              <label className="rubric-field">
                <span>Nombre</span>
                <input
                  className="rubric-input"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  placeholder="Ej: Revisión de artículos técnicos"
                  autoFocus
                />
              </label>

              <label className="rubric-field">
                <span>Descripción</span>
                <textarea
                  rows={2}
                  value={editing.description}
                  onChange={(e) =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                  placeholder="Para qué sirve esta rúbrica…"
                />
              </label>
            </div>

            <div className="rubric-criteria-head">
              <span>Criterios</span>
              <button
                type="button"
                className="oc-text-btn"
                onClick={addCriterion}
              >
                + Agregar criterio
              </button>
            </div>

            <div className="rubric-criteria">
              {editing.criteria.map((criterion, index) => (
                <div className="rubric-criterion" key={criterion.id}>
                  <div className="rubric-criterion-top">
                    <span className="rubric-criterion-index mono">
                      {index + 1}
                    </span>
                    <input
                      className="rubric-input"
                      value={criterion.name}
                      onChange={(e) =>
                        updateCriterion(criterion.id, {
                          name: e.target.value,
                        })
                      }
                      placeholder="Nombre del criterio"
                      aria-label={`Nombre del criterio ${index + 1}`}
                    />
                    <input
                      className="rubric-weight mono"
                      type="number"
                      min={1}
                      max={100}
                      value={criterion.weight}
                      onChange={(e) =>
                        updateCriterion(criterion.id, {
                          weight: Math.max(
                            1,
                            Math.min(100, Number(e.target.value) || 1),
                          ),
                        })
                      }
                      aria-label={`Peso del criterio ${index + 1}`}
                    />
                    <span className="rubric-weight-label">%</span>
                    <button
                      type="button"
                      className="oc-text-btn danger"
                      onClick={() => removeCriterion(criterion.id)}
                      disabled={editing.criteria.length === 1}
                      title="Quitar criterio"
                      aria-label="Quitar criterio"
                    >
                      ×
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={criterion.description}
                    onChange={(e) =>
                      updateCriterion(criterion.id, {
                        description: e.target.value,
                      })
                    }
                    placeholder="Qué se evalúa y qué se espera…"
                    aria-label={`Descripción del criterio ${index + 1}`}
                  />
                </div>
              ))}
            </div>

            {error && <p className="rubric-error">{error}</p>}

            <footer className="rubric-editor-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditing(null);
                  setError("");
                }}
              >
                Cancelar
              </button>
              <div className="rubric-editor-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => save(false)}
                >
                  Guardar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => save(true)}
                >
                  Guardar y aplicar
                </button>
              </div>
            </footer>
          </div>
        ) : (
          <div className="oc-content rubrics-content">
            <div className="rubric-modal-head">
              <div>
                <h2 className="oc-section-title">Rúbricas</h2>
                <p className="rubric-subtitle">
                  Copiá una plantilla o creá criterios propios. La rúbrica
                  activa se envía a los agentes críticos del proyecto.
                </p>
              </div>
              <button
                type="button"
                className="drawer-close"
                onClick={onClose}
                title="Cerrar"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="oc-banner-box rubric-active-banner">
              <div className="rubric-active-copy">
                <span className="rubric-kicker">Rúbrica del proyecto</span>
                <strong>{activeRubric?.name ?? "Sin rúbrica"}</strong>
                <small>{projectName}</small>
              </div>
              {activeRubric && (
                <button
                  type="button"
                  className="oc-text-btn"
                  onClick={() => onApply(null)}
                >
                  Quitar
                </button>
              )}
            </div>

            <section className="rubric-section">
              <div className="rubric-section-head">
                <h3>Plantillas</h3>
                <span className="rubric-count">{RUBRIC_TEMPLATES.length}</span>
              </div>
              <div className="rubric-grid">
                {RUBRIC_TEMPLATES.map((template) => (
                  <article className="rubric-card" key={template.id}>
                    <div className="rubric-card-head">
                      <strong>{template.name}</strong>
                      <span className="rubric-tag">Plantilla</span>
                    </div>
                    <p>{template.description}</p>
                    <ul className="rubric-criteria-preview">
                      {template.criteria.map((criterion) => (
                        <li key={criterion.id}>
                          <span>{criterion.name}</span>
                          <em className="mono">{criterion.weight}%</em>
                        </li>
                      ))}
                    </ul>
                    <footer>
                      <button
                        type="button"
                        className="oc-action-btn"
                        onClick={() => startFromTemplate(template)}
                      >
                        Usar plantilla
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            </section>

            <section className="rubric-section">
              <div className="rubric-section-head">
                <h3>Mis rúbricas</h3>
                <button
                  type="button"
                  className="oc-action-btn"
                  onClick={startNewRubric}
                >
                  + Nueva rúbrica
                </button>
              </div>

              {rubrics.length === 0 ? (
                <p className="rubric-empty">
                  Todavía no creaste rúbricas propias. Empezá desde una
                  plantilla o desde cero.
                </p>
              ) : (
                <div className="rubric-list">
                  {rubrics.map((rubric) => {
                    const isActive = rubric.id === activeRubricId;
                    return (
                      <article
                        className={`rubric-row ${isActive ? "is-active" : ""}`}
                        key={rubric.id}
                      >
                        <div className="rubric-row-copy">
                          <strong>
                            {rubric.name}
                            {isActive && (
                              <span className="rubric-active-tag">activa</span>
                            )}
                          </strong>
                          <span>
                            {rubric.criteria.length}{" "}
                            {rubric.criteria.length === 1
                              ? "criterio"
                              : "criterios"}
                            {rubric.description
                              ? ` · ${rubric.description}`
                              : ""}
                          </span>
                        </div>
                        <div className="rubric-row-actions">
                          <button
                            type="button"
                            className="oc-text-btn"
                            onClick={() => onApply(isActive ? null : rubric.id)}
                          >
                            {isActive ? "Quitar" : "Aplicar"}
                          </button>
                          <button
                            type="button"
                            className="oc-text-btn"
                            onClick={() => startEdit(rubric)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="oc-text-btn danger"
                            onClick={() => onDelete(rubric.id)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
