import type { AgentStatus, TaskState } from "../types";

export const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "var(--status-idle)",
  working: "var(--status-working)",
  completed: "var(--status-completed)",
  failed: "var(--status-failed)",
  "input-required": "var(--status-input)",
};

export function toAgentStatus(state: TaskState | undefined): AgentStatus {
  switch (state) {
    case "submitted":
    case "working":
      return "working";
    case "input-required":
      return "input-required";
    case "completed":
      return "completed";
    case "failed":
    case "canceled":
      return "failed";
    default:
      return "idle";
  }
}
