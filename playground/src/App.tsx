import { MarkerType, useEdgesState, useNodesState } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "./components/Canvas";
import { NodeInspector } from "./components/NodeInspector";
import { ProjectsSidebar } from "./components/ProjectsSidebar";
import { RubricsModal } from "./components/RubricsModal";
import { SettingsModal } from "./components/SettingsModal";
import { TracePanel } from "./components/TracePanel";
import {
  DEFAULT_INSTRUCTIONS,
  DEFAULT_PRICING,
  DEFAULT_TOPIC,
  LEGACY_STORAGE_KEYS,
  MAX_ITERATIONS,
  MOCK_PROVIDER_ID,
  STORAGE_KEYS,
  loopLevelForIterations,
} from "./config";
import { defaultFlowEdges, defaultFlowNodes } from "./data/flow";
import { RUBRIC_TEMPLATES } from "./data/rubrics";
import {
  checkHostHealth,
  deleteHostAgent,
  fetchPresets,
  fetchProviders,
  syncFlowAgents,
  upsertHostAgent,
} from "./lib/host";
import { createProject, loadWorkspace, saveWorkspace } from "./lib/projects";
import { applyRubricToNodes } from "./lib/rubrics";
import { executeFlow } from "./lib/runner";
import type {
  AgentCard,
  AgentData,
  AgentStatus,
  FlowEdge,
  FlowNode,
  FlowNodeData,
  NodeKind,
  Pricing,
  Project,
  Provider,
  ProviderKind,
  ProviderPreset,
  Rubric,
  RunResult,
  RunState,
  TraceStep,
} from "./types";

const FALLBACK_MOCK_PROVIDER: Provider = {
  id: MOCK_PROVIDER_ID,
  kind: "mock",
  name: "Mock (sin red)",
  baseUrl: "",
  models: ["mock"],
  hasKey: false,
  keyPreview: "",
  builtin: true,
};

const PREVIOUS_DEFAULT_PRICING: Pricing = {
  inputPer1K: 0.003,
  outputPer1K: 0.006,
};

function loadSavedPricing(): Pricing {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.pricing) ??
      localStorage.getItem(LEGACY_STORAGE_KEYS.pricing);
    if (!raw) return DEFAULT_PRICING;
    const parsed = JSON.parse(raw) as Partial<Pricing>;
    if (
      typeof parsed.inputPer1K === "number" &&
      typeof parsed.outputPer1K === "number"
    ) {
      if (
        parsed.inputPer1K === PREVIOUS_DEFAULT_PRICING.inputPer1K &&
        parsed.outputPer1K === PREVIOUS_DEFAULT_PRICING.outputPer1K
      ) {
        return DEFAULT_PRICING;
      }
      return {
        inputPer1K: parsed.inputPer1K,
        outputPer1K: parsed.outputPer1K,
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_PRICING;
}

export default function App() {
  const initialWorkspace = useMemo(() => loadWorkspace(), []);
  const initialProject = useMemo(
    () =>
      initialWorkspace.projects.find(
        (project) => project.id === initialWorkspace.activeProjectId,
      ) ?? initialWorkspace.projects[0],
    [initialWorkspace],
  );
  const [projects, setProjects] = useState<Project[]>(
    initialWorkspace.projects,
  );
  const [customRubrics, setCustomRubrics] = useState<Rubric[]>(
    initialWorkspace.rubrics,
  );
  const [activeProjectId, setActiveProjectId] = useState(
    initialWorkspace.activeProjectId,
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(
    initialProject.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(
    initialProject.edges,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [rubricsOpen, setRubricsOpen] = useState(false);

  const [hostOnline, setHostOnline] = useState<boolean | null>(null);
  const [providers, setProviders] = useState<Provider[]>([
    FALLBACK_MOCK_PROVIDER,
  ]);
  const [presets, setPresets] = useState<Record<ProviderKind, ProviderPreset>>(
    {} as Record<ProviderKind, ProviderPreset>,
  );
  const [pricing, setPricing] = useState<Pricing>(() => loadSavedPricing());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<
    "general" | "servers" | "providers" | "models"
  >("general");

  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const [cards, setCards] = useState<Record<string, AgentCard>>({});
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [tracesOpen, setTracesOpen] = useState(true);
  const [autoExpandTrace, setAutoExpandTrace] = useState(true);
  const [showComparison, setShowComparison] = useState(true);

  const [runState, setRunState] = useState<RunState>("idle");
  const [runMessage, setRunMessage] = useState("");
  const [iteration, setIteration] = useState(0);
  const [maxIterations, setMaxIterations] = useState(MAX_ITERATIONS);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [previousRun, setPreviousRun] = useState<RunResult | null>(null);

  const running = runState === "running";
  const runAbortRef = useRef<AbortController | null>(null);

  const activeProject = useMemo(
    () =>
      projects.find((project) => project.id === activeProjectId) ?? projects[0],
    [projects, activeProjectId],
  );

  const activeRubric = useMemo(() => {
    const rubricId = activeProject?.rubricId;
    if (!rubricId) return undefined;
    return [...RUBRIC_TEMPLATES, ...customRubrics].find(
      (rubric) => rubric.id === rubricId,
    );
  }, [activeProject, customRubrics]);

  const runNodes = useMemo(
    () => applyRubricToNodes(nodes, activeRubric),
    [nodes, activeRubric],
  );

  const refreshHost = useCallback(async () => {
    const ok = await checkHostHealth();
    setHostOnline(ok);
    if (!ok) return;
    try {
      const [loadedProviders, loadedPresets] = await Promise.all([
        fetchProviders(),
        fetchPresets(),
      ]);
      setProviders(loadedProviders);
      setPresets(loadedPresets);
      await syncFlowAgents(runNodes);
    } catch {
      // ignore
    }
  }, [runNodes]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshHost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedNodeId(null);
        setSettingsOpen(false);
        setRubricsOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const merged = projects.map((project) =>
      project.id === activeProjectId ? { ...project, nodes, edges } : project,
    );
    saveWorkspace({
      projects: merged,
      activeProjectId,
      rubrics: customRubrics,
    });
  }, [nodes, edges, projects, activeProjectId, customRubrics]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.pricing, JSON.stringify(pricing));
    } catch {
      // ignore
    }
  }, [pricing]);

  const selectedNode = useMemo(
    () =>
      selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : undefined,
    [nodes, selectedNodeId],
  );

  const hasTrigger = useMemo(
    () => nodes.some((n) => n.data.kind === "trigger"),
    [nodes],
  );

  function handleAddNode(kind: NodeKind) {
    const countOfKind = nodes.filter((n) => n.data.kind === kind).length + 1;
    const id = `${kind}-${Date.now().toString(36).slice(-4)}`;
    const xBase = 90 + nodes.length * 300;
    const yBase = 180 + (nodes.length % 2) * 40;

    let newNode: FlowNode;
    if (kind === "trigger") {
      newNode = {
        id,
        type: "trigger",
        position: { x: 80, y: 190 },
        data: {
          kind: "trigger",
          name: "Trigger manual",
          input: DEFAULT_TOPIC,
        },
      };
    } else if (kind === "blank") {
      newNode = {
        id,
        type: "blank",
        position: { x: xBase, y: yBase },
        data: {
          kind: "blank",
          name: `Nodo vacío ${countOfKind > 1 ? countOfKind : ""}`.trim(),
          note: "",
        },
      };
    } else {
      const isWriter = kind === "writer";
      const data: AgentData = {
        kind,
        name: isWriter
          ? `Writer Agent ${countOfKind > 1 ? countOfKind : ""}`.trim()
          : `Critic Agent ${countOfKind > 1 ? countOfKind : ""}`.trim(),
        instructions: DEFAULT_INSTRUCTIONS[kind],
        providerId: "mock",
        model: "mock",
        temperature: null,
      };
      newNode = {
        id,
        type: kind,
        position: { x: xBase, y: yBase },
        data,
      };
      if (hostOnline) {
        void upsertHostAgent(id, data);
      }
    }

    const last = nodes[nodes.length - 1];
    const nextEdges: FlowEdge[] = [...edges];
    if (last && (kind === "writer" || kind === "critic")) {
      nextEdges.push({
        id: `e-${last.id}-${id}`,
        source: last.id,
        sourceHandle: "out",
        target: id,
        targetHandle: "in",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
        },
      });
      if (kind === "critic" && last.data.kind === "writer") {
        nextEdges.push({
          id: `e-${id}-${last.id}-loop`,
          source: id,
          sourceHandle: "loop-out",
          target: last.id,
          targetHandle: "loop-in",
          label: "rehacer",
          type: "smoothstep",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
          },
        });
      }
    }

    setNodes([...nodes, newNode]);
    if (nextEdges.length !== edges.length) {
      setEdges(nextEdges);
    }
    setSelectedNodeId(id);
  }

  function handleUpdateNode(nodeId: string, patch: Partial<FlowNodeData>) {
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== nodeId) return node;
        const nextData = { ...node.data, ...patch } as FlowNodeData;
        if (
          hostOnline &&
          (nextData.kind === "writer" || nextData.kind === "critic")
        ) {
          void upsertHostAgent(nodeId, nextData);
        }
        return { ...node, data: nextData };
      }),
    );
  }

  function handleDeleteNode(nodeId: string) {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) =>
      prev.filter((e) => e.source !== nodeId && e.target !== nodeId),
    );
    void deleteHostAgent(nodeId);
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  }

  function handleResetDefault() {
    setNodes(defaultFlowNodes);
    setEdges(defaultFlowEdges);
    setStatuses({});
    setSelectedNodeId(null);
    if (hostOnline) {
      void syncFlowAgents(applyRubricToNodes(defaultFlowNodes, activeRubric));
    }
  }

  function handleClearCanvas() {
    for (const node of nodes) {
      if (node.data.kind === "writer" || node.data.kind === "critic") {
        void deleteHostAgent(node.id);
      }
    }
    setNodes([]);
    setEdges([]);
    setStatuses({});
    setSelectedNodeId(null);
  }

  function resetProjectSession() {
    setStatuses({});
    setCards({});
    setSteps([]);
    setRunState("idle");
    setRunMessage("");
    setIteration(0);
    setLastRun(null);
    setPreviousRun(null);
    setSelectedNodeId(null);
  }

  function snapshotActiveProject(list: Project[]): Project[] {
    return list.map((project) =>
      project.id === activeProjectId
        ? { ...project, nodes, edges, updatedAt: Date.now() }
        : project,
    );
  }

  function handleSelectProject(projectId: string) {
    if (running || projectId === activeProjectId) return;
    const target = projects.find((project) => project.id === projectId);
    if (!target) return;
    const synced = snapshotActiveProject(projects);
    setProjects(synced);
    setActiveProjectId(projectId);
    setNodes(target.nodes);
    setEdges(target.edges);
    resetProjectSession();
  }

  function handleCreateProject() {
    if (running) return;
    const project = createProject(`Proyecto ${projects.length + 1}`);
    setProjects([...snapshotActiveProject(projects), project]);
    setActiveProjectId(project.id);
    setNodes([]);
    setEdges([]);
    resetProjectSession();
  }

  function handleRenameProject(projectId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setProjects(
      snapshotActiveProject(projects).map((project) =>
        project.id === projectId
          ? { ...project, name: trimmed, updatedAt: Date.now() }
          : project,
      ),
    );
  }

  function handleDeleteProject(projectId: string) {
    if (running) return;
    const target = projects.find((project) => project.id === projectId);
    if (!target) return;
    if (
      !window.confirm(
        `¿Eliminar el proyecto "${target.name}"? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    for (const node of target.nodes) {
      if (node.data.kind === "writer" || node.data.kind === "critic") {
        void deleteHostAgent(node.id);
      }
    }

    const remaining = snapshotActiveProject(projects).filter(
      (project) => project.id !== projectId,
    );
    if (remaining.length === 0) {
      const fresh = createProject("Proyecto 1");
      setProjects([fresh]);
      setActiveProjectId(fresh.id);
      setNodes([]);
      setEdges([]);
      resetProjectSession();
      return;
    }

    setProjects(remaining);
    if (projectId === activeProjectId) {
      const next = remaining[0];
      setActiveProjectId(next.id);
      setNodes(next.nodes);
      setEdges(next.edges);
      resetProjectSession();
    }
  }

  function handleApplyRubric(rubricId: string | null) {
    setProjects(
      snapshotActiveProject(projects).map((project) =>
        project.id === activeProjectId
          ? { ...project, rubricId, updatedAt: Date.now() }
          : project,
      ),
    );
  }

  function handleSaveRubric(rubric: Rubric) {
    setCustomRubrics((prev) => {
      const exists = prev.some((item) => item.id === rubric.id);
      if (exists) {
        return prev.map((item) => (item.id === rubric.id ? rubric : item));
      }
      return [...prev, rubric];
    });
  }

  function handleDeleteRubric(rubricId: string) {
    const rubric = customRubrics.find((item) => item.id === rubricId);
    if (!rubric) return;
    if (!window.confirm(`¿Eliminar la rúbrica "${rubric.name}"?`)) return;
    setCustomRubrics((prev) => prev.filter((item) => item.id !== rubricId));
    setProjects((prev) =>
      prev.map((project) =>
        project.rubricId === rubricId
          ? { ...project, rubricId: null, updatedAt: Date.now() }
          : project,
      ),
    );
  }

  async function handleRunFlow() {
    if (running) return;
    const controller = new AbortController();
    runAbortRef.current = controller;
    setRunState("running");
    setRunMessage("");
    setSteps([]);
    setIteration(1);
    setTracesOpen(true);
    if (lastRun) {
      setPreviousRun(lastRun);
    }

    try {
      const result = await executeFlow({
        nodes: runNodes,
        edges,
        maxIterations,
        pricing,
        signal: controller.signal,
        callbacks: {
          onResetStatuses: () => setStatuses({}),
          onStatusChange: (nodeId, status) =>
            setStatuses((curr) => ({ ...curr, [nodeId]: status })),
          onCardLoaded: (nodeId, card) =>
            setCards((curr) => ({ ...curr, [nodeId]: card })),
          onStep: (step) => setSteps((curr) => [...curr, step]),
          onIteration: (iter) => setIteration(iter),
        },
      });
      if (controller.signal.aborted) return;
      setLastRun(result);
      setRunState(result.status);
      setRunMessage(result.message);
      setHostOnline(true);
    } catch (err) {
      if (controller.signal.aborted) {
        setRunState("idle");
        setRunMessage("Run cancelado.");
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setRunState("failed");
      setRunMessage(msg);
    } finally {
      if (runAbortRef.current === controller) {
        runAbortRef.current = null;
      }
    }
  }

  function handleCancelRun() {
    runAbortRef.current?.abort();
    setRunState("idle");
    setRunMessage("Run cancelado.");
  }

  return (
    <div className="workspace-shell">
      {/* Slim Borderless Top Bar */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">HextLab</span>
          <span className="topbar-project">/ {activeProject.name}</span>

          {(running || runMessage) && (
            <span
              className={`run-status-inline ${running ? "running" : runState}`}
            >
              {running
                ? `Intento ${iteration} · nivel ${loopLevelForIterations(maxIterations).label}…`
                : runMessage}
            </span>
          )}
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="topbar-btn"
            onClick={() => {
              setSettingsTab("general");
              setSettingsOpen(true);
            }}
          >
            Settings
          </button>

          <button
            type="button"
            className={`topbar-btn ${tracesOpen ? "is-active" : ""}`}
            onClick={() => setTracesOpen((v) => !v)}
            aria-expanded={tracesOpen}
            aria-controls={tracesOpen ? "trace-panel" : undefined}
          >
            Activity
            {steps.length > 0 && (
              <span className="topbar-count">{steps.length}</span>
            )}
          </button>

          {running ? (
            <button
              type="button"
              className="topbar-run-btn is-cancel"
              onClick={handleCancelRun}
            >
              ■ Cancelar
            </button>
          ) : (
            <button
              type="button"
              className="topbar-run-btn"
              onClick={() => void handleRunFlow()}
              disabled={nodes.length === 0}
            >
              ▶ Run
            </button>
          )}
        </div>
      </header>

      {/* Full-bleed Stage */}
      <div className="stage">
        <ProjectsSidebar
          projects={projects}
          activeProjectId={activeProject.id}
          activeNodeCount={nodes.length}
          activeRubricName={activeRubric?.name}
          running={running}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          onOpenRubrics={() => setRubricsOpen(true)}
        />

        <div className="stage-canvas">
          <Canvas
            flowKey={activeProject.id}
            nodes={nodes}
            edges={edges}
            statuses={statuses}
            providers={providers}
            selectedNodeId={selectedNode?.id ?? null}
            running={running}
            hasTrigger={hasTrigger}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onSetEdges={setEdges}
            onSelectNode={setSelectedNodeId}
            onAddNode={handleAddNode}
            onResetDefault={handleResetDefault}
            onClearCanvas={handleClearCanvas}
          />

          <NodeInspector
            node={selectedNode}
            providers={providers}
            disabled={running}
            onClose={() => setSelectedNodeId(null)}
            onUpdateNode={handleUpdateNode}
            onDeleteNode={handleDeleteNode}
            onOpenProviders={() => {
              setSettingsTab("providers");
              setSettingsOpen(true);
            }}
          />
        </div>

        {tracesOpen && (
          <TracePanel
            steps={steps}
            autoExpandLast={autoExpandTrace}
            previousRun={previousRun}
            lastRun={lastRun}
            showComparison={showComparison}
            onClose={() => setTracesOpen(false)}
          />
        )}
      </div>

      {rubricsOpen && (
        <RubricsModal
          open
          projectName={activeProject.name}
          activeRubricId={activeProject.rubricId}
          rubrics={customRubrics}
          onClose={() => setRubricsOpen(false)}
          onApply={handleApplyRubric}
          onSave={handleSaveRubric}
          onDelete={handleDeleteRubric}
        />
      )}

      <SettingsModal
        open={settingsOpen}
        initialSection={settingsTab}
        providers={providers}
        presets={presets}
        pricing={pricing}
        maxIterations={maxIterations}
        autoExpandTrace={autoExpandTrace}
        showComparison={showComparison}
        hostOnline={hostOnline}
        cards={cards}
        onClose={() => setSettingsOpen(false)}
        onProvidersChanged={async () => {
          const updated = await fetchProviders();
          setProviders(updated);
        }}
        onPricingChange={setPricing}
        onMaxIterationsChange={setMaxIterations}
        onAutoExpandTraceChange={setAutoExpandTrace}
        onShowComparisonChange={setShowComparison}
        onReconnectHost={refreshHost}
      />
    </div>
  );
}
