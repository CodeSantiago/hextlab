import { describe, expect, it } from "vitest";
import { newId } from "./id";

describe("newId", () => {
  it("returns a non-empty unique value", () => {
    const first = newId();
    const second = newId();

    expect(first.length).toBeGreaterThan(0);
    expect(first).not.toBe(second);
  });
});
