import { describe, it, expect } from "vitest";
import { detectFlows } from "@/lib/detectFlows";

const auto = (id: string, targets: string[] = []) => ({
  id,
  koppelingen: targets.map((t) => ({ doelId: t, label: "" })),
});

describe("detectFlows", () => {
  it("returns empty array when no automations", () => {
    expect(detectFlows([], [])).toEqual([]);
  });

  it("ignores isolated automations (no links)", () => {
    const result = detectFlows([auto("a"), auto("b")], []);
    expect(result).toEqual([]);
  });

  it("ignores old koppelingen because procesreizen require webhook-proof links", () => {
    const result = detectFlows([auto("a", ["b"]), auto("b", ["c"]), auto("c")], []);
    expect(result).toEqual([]);
  });

  it("detects a chain via confirmed automation_links", () => {
    const result = detectFlows(
      [auto("x"), auto("y"), auto("z")],
      [{ sourceId: "x", targetId: "y" }, { sourceId: "y", targetId: "z" }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].automationIds).toEqual(["x", "y", "z"]);
  });

  it("detects two independent chains", () => {
    const result = detectFlows(
      [auto("a"), auto("b"), auto("c"), auto("d")],
      [{ sourceId: "a", targetId: "b" }, { sourceId: "c", targetId: "d" }],
    );
    expect(result).toHaveLength(2);
    const sorted = result.map((r) => r.automationIds.join(",")).sort();
    expect(sorted).toEqual(["a,b", "c,d"]);
  });

  it("topological order: source comes before target", () => {
    const result = detectFlows([auto("b"), auto("a")], [{ sourceId: "a", targetId: "b" }]);
    expect(result).toHaveLength(1);
    expect(result[0].automationIds[0]).toBe("a");
    expect(result[0].automationIds[1]).toBe("b");
  });

  it("ignores koppelingen to automations not in the input list", () => {
    const result = detectFlows([auto("a", ["unknown"])], []);
    expect(result).toEqual([]);
  });

  it("handles a branching automation (one source → two targets)", () => {
    const result = detectFlows(
      [auto("a"), auto("b"), auto("c")],
      [{ sourceId: "a", targetId: "b" }, { sourceId: "a", targetId: "c" }],
    );
    expect(result).toHaveLength(1);
    // All three IDs present; a comes first
    expect(result[0].automationIds[0]).toBe("a");
    expect(result[0].automationIds).toContain("b");
    expect(result[0].automationIds).toContain("c");
  });

  it("handles automation linked by both koppeling and confirmedLink (no duplicate edge)", () => {
    // A→B exists in both koppelingen and confirmedLinks — should not break topo sort
    const result = detectFlows(
      [auto("a", ["b"]), auto("b")],
      [{ sourceId: "a", targetId: "b" }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].automationIds).toEqual(["a", "b"]);
  });
});
