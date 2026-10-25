import { Handle, Position, type NodeProps } from "@xyflow/react";
import { STATUS_COLORS } from "../lib/status";
import type { RenderExtras, TriggerData } from "../types";

type Props = NodeProps & {
  data: TriggerData & Partial<RenderExtras>;
};

export function TriggerNode({ data, selected }: Props) {
  const status = data.status ?? "idle";
  const color = STATUS_COLORS[status];

  return (
    <div
      className={`flow-node trigger-node ${selected ? "is-selected" : ""} ${
        status === "working" ? "is-working" : ""
      }`}
    >
      <div className="node-accent" style={{ backgroundColor: color }} />

      <div className="node-head">
        <span className="node-icon trigger-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none">
            <path
              d="M11.2 2.5L4.8 11h4.6l-.6 6.5 6.4-8.5h-4.6l.6-6.5z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="node-titles">
          <span className="node-kind-label">TRIGGER</span>
          <span className="node-title">{data.name || "Trigger manual"}</span>
        </div>
        {status !== "idle" && (
          <span
            className={`status-indicator ${status}`}
            title={`Estado: ${status}`}
            aria-label={`Estado: ${status}`}
          >
            <i style={{ backgroundColor: color }} />
          </span>
        )}
      </div>

      <p className="node-preview">
        {data.input ? data.input : "Sin pedido inicial configurado…"}
      </p>

      <div className="node-foot">
        <span className="node-chip">POST message/send</span>
        <span className="node-handle-hint">salida →</span>
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
