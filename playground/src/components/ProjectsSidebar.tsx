import { useState } from "react";
import type { Project } from "../types";

type ProjectsSidebarProps = {
  projects: Project[];
  activeProjectId: string;
  activeNodeCount: number;
  activeRubricName?: string;
  running: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onRenameProject: (projectId: string, name: string) => void;
  onDeleteProject: (projectId: string) => void;
  onOpenRubrics: () => void;
};

export function ProjectsSidebar({
  projects,
  activeProjectId,
  activeNodeCount,
  activeRubricName,
  running,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onOpenRubrics,
}: ProjectsSidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  function startRename(project: Project) {
    if (running) return;
    setRenamingId(project.id);
    setDraftName(project.name);
  }

  function commitRename() {
    if (renamingId) {
      onRenameProject(renamingId, draftName);
    }
    setRenamingId(null);
  }

  return (
    <aside className="projects-sidebar" aria-label="Proyectos">
      <header className="projects-head">
        <span className="projects-title">Proyectos</span>
        <button
          type="button"
          className="projects-add"
          onClick={onCreateProject}
          disabled={running}
          title="Crear proyecto"
          aria-label="Crear proyecto"
        >
          +
        </button>
      </header>

      <div className="projects-list">
        {projects.map((project) => {
          const isActive = project.id === activeProjectId;
          const nodeCount = isActive ? activeNodeCount : project.nodes.length;
          return (
            <div
              key={project.id}
              className={`project-row ${isActive ? "is-active" : ""}`}
              onClick={() => onSelectProject(project.id)}
              onDoubleClick={() => startRename(project)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectProject(project.id);
                }
              }}
              aria-current={isActive ? "true" : undefined}
            >
              <div className="project-main">
                {renamingId === project.id ? (
                  <input
                    className="project-rename-input"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                    disabled={running}
                    aria-label="Nombre del proyecto"
                  />
                ) : (
                  <span className="project-name">{project.name}</span>
                )}
                <span className="project-meta mono">
                  {nodeCount} {nodeCount === 1 ? "nodo" : "nodos"}
                </span>
              </div>

              <div className="project-actions">
                <button
                  type="button"
                  className="project-action"
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(project);
                  }}
                  disabled={running}
                  title="Renombrar proyecto"
                  aria-label="Renombrar proyecto"
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="project-action danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteProject(project.id);
                  }}
                  disabled={running}
                  title="Eliminar proyecto"
                  aria-label="Eliminar proyecto"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <footer className="projects-foot">
        <button
          type="button"
          className="projects-rubric-btn"
          onClick={onOpenRubrics}
          disabled={running}
          title="Administrar rúbricas del proyecto"
        >
          <span className="projects-rubric-icon" aria-hidden="true">
            R
          </span>
          <span className="projects-rubric-copy">
            <strong>Rúbricas</strong>
            <small>{activeRubricName ?? "Sin rúbrica aplicada"}</small>
          </span>
        </button>
      </footer>
    </aside>
  );
}
