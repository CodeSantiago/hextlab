import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  addEdge,
  reconnectEdge,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type HandleType,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";
import type {
  AgentStatus,
  FlowEdge,
  FlowNode,
  NodeKind,
  Provider,
} from "../types";
import { newId } from "../lib/id";
import { AgentNode } from "./AgentNode";
import { BlankNode } from "./BlankNode";
import { TriggerNode } from "./TriggerNode";

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  writer: AgentNode,
  critic: AgentNode,
  blank: BlankNode,
};

function styleEdge(edge: FlowEdge): FlowEdge {
  const isLoop =
    edge.sourceHandle === "loop-out" || edge.targetHandle === "loop-in";
  return {
    ...edge,
    label: isLoop ? "rehacer" : undefined,
    type: isLoop ? "smoothstep" : "default",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    interactionWidth: 26,
  };
}

type CanvasProps = {
  flowKey: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  statuses: Record<string, AgentStatus>;
  providers: Provider[];
  selectedNodeId: string | null;
  running: boolean;
  hasTrigger: boolean;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onSetEdges: (updater: (edges: FlowEdge[]) => FlowEdge[]) => void;
  onSelectNode: (nodeId: string | null) => void;
  onAddNode: (kind: NodeKind) => void;
  onResetDefault: () => void;
  onClearCanvas: () => void;
};

export function Canvas({
  flowKey,
  nodes,
  edges,
  statuses,
  providers,
  selectedNodeId,
  running,
  hasTrigger,
  onNodesChange,
  onEdgesChange,
  onSetEdges,
  onSelectNode,
  onAddNode,
  onResetDefault,
  onClearCanvas,
}: CanvasProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const providerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of providers) {
      map.set(p.id, p.name);
    }
    return map;
  }, [providers]);

  const decoratedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const status = statuses[node.id] ?? "idle";
        const selected = node.id === selectedNodeId;
        if (node.data.kind === "writer" || node.data.kind === "critic") {
          return {
            ...node,
            selected,
            data: {
              ...node.data,
              status,
              providerName:
                providerMap.get(node.data.providerId) ?? node.data.providerId,
            },
          };
        }
        return {
          ...node,
          selected,
          data: { ...node.data, status },
        };
      }),
    [nodes, statuses, selectedNodeId, providerMap],
  );

  const decoratedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...styleEdge(edge),
        animated: running,
      })),
    [edges, running],
  );

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target) return;
    onSetEdges((eds) =>
      addEdge(
        styleEdge({
          ...connection,
          id: `e-${connection.source}-${connection.target}-${newId().slice(0, 5)}`,
        }),
        eds,
      ),
    );
  }

  function handleReconnect(oldEdge: FlowEdge, connection: Connection) {
    if (!connection.source || !connection.target) return;
    onSetEdges((eds) =>
      reconnectEdge(oldEdge, connection, eds, {
        shouldReplaceId: false,
      }).map(styleEdge),
    );
  }

  function handleReconnectEnd(
    event: MouseEvent | TouchEvent,
    edge: FlowEdge,
    handleType: HandleType,
    connectionState: FinalConnectionState,
  ) {
    void event;
    void handleType;
    if (connectionState.isValid) return;
    onSetEdges((eds) => eds.filter((item) => item.id !== edge.id));
  }

  function handleRemoveEdge(edge: FlowEdge) {
    onSetEdges((eds) => eds.filter((item) => item.id !== edge.id));
  }

  function pickKind(kind: NodeKind) {
    onAddNode(kind);
    setMenuOpen(false);
  }

  return (
    <div className="canvas">
      <ReactFlow
        key={flowKey}
        nodes={decoratedNodes}
        edges={decoratedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        onReconnectEnd={handleReconnectEnd}
        onEdgeDoubleClick={(_, edge) => handleRemoveEdge(edge)}
        reconnectRadius={18}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => {
          onSelectNode(null);
          setMenuOpen(false);
        }}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        minZoom={0.35}
        maxZoom={1.6}
        nodesDraggable={!running}
        nodesConnectable={!running}
        deleteKeyCode={running ? null : ["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.1}
          color="var(--canvas-dots)"
        />
        <Controls showInteractive={false} />

        <Panel position="top-left" className="canvas-toolbar">
          <div className="add-node-wrapper">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={running}
            >
              <span className="plus-glyph">+</span> Crear nodo
            </button>

            {menuOpen && (
              <div className="node-picker-popover" role="menu">
                <div className="popover-header">Elegí el tipo de nodo</div>

                <button
                  type="button"
                  className="picker-option"
                  onClick={() => pickKind("trigger")}
                  disabled={hasTrigger}
                  title={
                    hasTrigger
                      ? "Ya existe un nodo Trigger en el canvas"
                      : "Agrega un disparador manual"
                  }
                >
                  <span className="picker-badge trigger">T</span>
                  <span className="picker-copy">
                    <strong>Trigger manual</strong>
                    <small>
                      {hasTrigger
                        ? "Ya hay un Trigger en el flujo"
                        : "Punto de entrada con el pedido inicial"}
                    </small>
                  </span>
                </button>

                <button
                  type="button"
                  className="picker-option"
                  onClick={() => pickKind("writer")}
                >
                  <span className="picker-badge writer">W</span>
                  <span className="picker-copy">
                    <strong>Agente Escritor (A2A)</strong>
                    <small>
                      Redacta o reescribe borradores según tu tarea y modelo LLM
                    </small>
                  </span>
                </button>

                <button
                  type="button"
                  className="picker-option"
                  onClick={() => pickKind("critic")}
                >
                  <span className="picker-badge critic">C</span>
                  <span className="picker-copy">
                    <strong>Agente Crítico (A2A)</strong>
                    <small>
                      Evalúa borradores con puntajes y decide aprobar o rehacer
                    </small>
                  </span>
                </button>

                <button
                  type="button"
                  className="picker-option"
                  onClick={() => pickKind("blank")}
                >
                  <span className="picker-badge blank">·</span>
                  <span className="picker-copy">
                    <strong>Nodo vacío</strong>
                    <small>
                      Marcador sin ejecución; puede ir entre agentes como puente
                    </small>
                  </span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onResetDefault}
            disabled={running}
            title="Restaurar el flujo de ejemplo (Trigger → Writer ↔ Critic)"
          >
            Plantilla base
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClearCanvas}
            disabled={running || nodes.length === 0}
            title="Vaciar todos los nodos del canvas"
          >
            Vaciar
          </button>
        </Panel>

        {nodes.length === 0 && (
          <Panel position="top-center" className="canvas-empty-hint">
            <p>
              El canvas está vacío. Usá <strong>+ Crear nodo</strong> para armar
              tu flujo A2A o cargá la <strong>Plantilla base</strong>.
            </p>
          </Panel>
        )}

        <Panel position="bottom-center" className="canvas-edge-hint">
          <span>
            Cable: arrastrá un extremo para reconectar · doble clic o{" "}
            <kbd>Supr</kbd> para borrarlo
          </span>
        </Panel>
      </ReactFlow>
    </div>
  );
}
