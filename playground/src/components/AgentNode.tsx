import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MOCK_PROVIDER_ID } from "../config";
import { STATUS_COLORS } from "../lib/status";
import type { AgentData, RenderExtras } from "../types";

type Props = NodeProps & {
  data: AgentData & Partial<RenderExtras>;
};

export function AgentNode({ id, data, selected }: Props) {
  const status = data.status ?? "idle";
  const color = STATUS_COLORS[status];
  const isWriter = data.kind === "writer";
  const roleLabel = isWriter ? "ESCRITOR · A2A" : "CRÍTICO · A2A";
  const skillId = isWriter ? "write" : "review";
  const modelLabel =
    data.providerId === MOCK_PROVIDER_ID || !data.providerId
      ? "mock (sin red)"
      : `${data.providerName ?? data.providerId} · ${data.model}`;

  return (
    <div
      className={`flow-node agent-node role-${data.kind} ${
        selected ? "is-selected" : ""
      } ${status === "working" ? "is-working" : ""}`}
    >
      <div className="node-accent" style={{ backgroundColor: color }} />

      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className="node-handle target-handle"
      />

      <div className="node-head">
        <span className={`node-icon role-icon-${data.kind}`} aria-hidden="true">
          {isWriter ? (
            <svg viewBox="0 0 20 20" fill="none">
              <path
                d="M13.8 3.5l2.7 2.7-8.8 8.8-3.7 1 1-3.7 8.8-8.8z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none">
              <path
                d="M10 2.6l6 2.4v4.6c0 4-2.5 6.8-6 7.8-3.5-1-6-3.8-6-7.8V5l6-2.4z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M7.5 10.2l1.8 1.8 3.4-3.6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>

        <div className="node-titles">
          <span className="node-kind-label">{roleLabel}</span>
          <span className="node-title">{data.name}</span>
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
        {data.instructions || "Sin instrucciones personalizadas…"}
      </p>

      <div className="node-foot">
        <span className="node-chip mono" title={modelLabel}>
          {modelLabel}
        </span>
        <span className="node-endpoint mono" title={`/agents/${id}/`}>
          skill:{skillId}
        </span>
      </div>

      <Handle
        id="out"
        type="source"
        position={Position.Right}
        className="node-handle source-handle"
      />

      {isWriter ? (
        <Handle
          id="loop-in"
          type="target"
          position={Position.Bottom}
          className="node-handle loop-handle"
        />
      ) : (
        <Handle
          id="loop-out"
          type="source"
          position={Position.Bottom}
          className="node-handle loop-handle"
        />
      )}
    </div>
  );
}
