import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BlankData, RenderExtras } from "../types";

type Props = NodeProps & {
  data: BlankData & Partial<RenderExtras>;
};

export function BlankNode({ data, selected }: Props) {
  return (
    <div className={`flow-node blank-node ${selected ? "is-selected" : ""}`}>
      <div className="node-accent blank-accent" />

      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className="node-handle target-handle"
      />

      <div className="node-head">
        <span className="node-icon blank-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none">
            <rect
              x="3.2"
              y="3.2"
              width="13.6"
              height="13.6"
              rx="2.6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeDasharray="2.8 2.2"
            />
          </svg>
        </span>
        <div className="node-titles">
          <span className="node-kind-label">NODO VACÍO</span>
          <span className="node-title">{data.name || "Nodo vacío"}</span>
        </div>
      </div>

      <p className="node-preview">
        {data.note || "Sin contenido. Usalo como marcador o puente del flujo."}
      </p>

      <div className="node-foot">
        <span className="node-chip">sin ejecución</span>
        <span className="node-handle-hint">puente →</span>
      </div>

      <Handle
        id="out"
        type="source"
        position={Position.Right}
        className="node-handle source-handle"
      />
    </div>
  );
}
