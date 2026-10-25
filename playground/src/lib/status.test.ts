import { describe, expect, it } from "vitest";
import { STATUS_COLORS, toAgentStatus } from "./status";

describe("toAgentStatus", () => {
  it("maps submitted and working to working", () => {
    expect(toAgentStatus("submitted")).toBe("working");
    expect(toAgentStatus("working")).toBe("working");
  });

  it("maps terminal states", () => {
    expect(toAgentStatus("completed")).toBe("completed");
    expect(toAgentStatus("failed")).toBe("failed");
    expect(toAgentStatus("canceled")).toBe("failed");
  });

  it("falls back to idle", () => {
    expect(toAgentStatus(undefined)).toBe("idle");
  });
});

describe("STATUS_COLORS", () => {
  it("uses the CSS design tokens", () => {
    expect(STATUS_COLORS.completed).toBe("var(--status-completed)");
    expect(STATUS_COLORS["input-required"]).toBe("var(--status-input)");
  });
});
