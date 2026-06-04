import { describe, expect, it } from "vitest";

import { detectFlows } from "@/lib/detectFlows";

const auto = (
  id: string,
  targets: string[] = [],
  options: { webhookPaths?: string[]; endpoints?: string[] } = {},
) => ({
  id,
  koppelingen: targets.map((t) => ({ doelId: t, label: "" })),
  webhookPaths: options.webhookPaths ?? [],
  endpoints: options.endpoints ?? [],
});

describe("detectFlows", () => {
  it("returns empty array when no automations", () => {
    expect(detectFlows([], [])).toEqual([]);
  });

  it("ignores isolated automations without webhook proof", () => {
    const result = detectFlows([auto("a"), auto("b")], []);
    expect(result).toEqual([]);
  });

  it("ignores old koppelingen because procesreizen require webhook-proof links", () => {
    const result = detectFlows([auto("a", ["b"]), auto("b", ["c"]), auto("c")], []);
    expect(result).toEqual([]);
  });

  it("detects a recursive chain from exact webhook paths", () => {
    const result = detectFlows(
      [
        auto("x", [], { webhookPaths: ["/x-to-y"] }),
        auto("y", [], { endpoints: ["/x-to-y"], webhookPaths: ["/y-to-z"] }),
        auto("z", [], { endpoints: ["/y-to-z"] }),
      ],
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0].automationIds).toEqual(["x", "y", "z"]);
  });

  it("does not detect a flow from a confirmed link without exact webhook proof", () => {
    const result = detectFlows(
      [auto("x"), auto("y")],
      [{ sourceId: "x", targetId: "y" }],
    );

    expect(result).toEqual([]);
  });

  it("detects two independent exact webhook chains", () => {
    const result = detectFlows(
      [
        auto("a", [], { webhookPaths: ["/a-to-b"] }),
        auto("b", [], { endpoints: ["/a-to-b"] }),
        auto("c", [], { webhookPaths: ["/c-to-d"] }),
        auto("d", [], { endpoints: ["/c-to-d"] }),
      ],
      [],
    );

    expect(result).toHaveLength(2);
    const sorted = result.map((r) => r.automationIds.join(",")).sort();
    expect(sorted).toEqual(["a,b", "c,d"]);
  });

  it("orders the sender before the receiver even when input order is reversed", () => {
    const result = detectFlows(
      [
        auto("b", [], { endpoints: ["/a-to-b"] }),
        auto("a", [], { webhookPaths: ["/a-to-b"] }),
      ],
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0].automationIds).toEqual(["a", "b"]);
  });

  it("ignores koppelingen to automations not in the input list", () => {
    const result = detectFlows([auto("a", ["unknown"])], []);
    expect(result).toEqual([]);
  });

  it("keeps branching routes from one webhook sender to two receivers", () => {
    const result = detectFlows(
      [
        auto("a", [], { webhookPaths: ["/a-to-b", "/a-to-c"] }),
        auto("b", [], { endpoints: ["/a-to-b"] }),
        auto("c", [], { endpoints: ["/a-to-c"] }),
      ],
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0].automationIds[0]).toBe("a");
    expect(result[0].automationIds).toContain("b");
    expect(result[0].automationIds).toContain("c");
  });

  it("does not duplicate an exact webhook edge when an old koppeling also exists", () => {
    const result = detectFlows(
      [
        auto("a", ["b"], { webhookPaths: ["/a-to-b"] }),
        auto("b", [], { endpoints: ["/a-to-b"] }),
      ],
      [{ sourceId: "a", targetId: "b" }],
    );

    expect(result).toHaveLength(1);
    expect(result[0].automationIds).toEqual(["a", "b"]);
  });
});
