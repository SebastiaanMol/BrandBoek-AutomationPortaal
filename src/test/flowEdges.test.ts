import { describe, it, expect } from "vitest";
import { buildFlowEdges } from "@/components/flows/FlowCanvas";
import type { Automatisering } from "@/lib/types";

function makeAuto(id: string, targets: string[] = []): Automatisering {
  return {
    id, naam: id, categorie: "Backend Script", doel: "", trigger: "",
    systemen: ["Backend"], stappen: [], afhankelijkheden: "", owner: "",
    status: "Actief", verbeterideeën: "", mermaidDiagram: "",
    koppelingen: targets.map((t) => ({ doelId: t, label: "" })),
    fasen: [], createdAt: "", laatstGeverifieerd: null, geverifieerdDoor: "",
  };
}

describe("buildFlowEdges", () => {
  it("builds edges from koppelingen within the flow", () => {
    const ids = ["a", "b", "c"];
    const autoMap = new Map([
      ["a", makeAuto("a", ["b"])],
      ["b", makeAuto("b", ["c"])],
      ["c", makeAuto("c")],
    ]);
    const edges = buildFlowEdges(ids, autoMap);
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({ from: "a", to: "b" });
    expect(edges[1]).toMatchObject({ from: "b", to: "c" });
  });

  it("ignores koppelingen pointing outside the flow", () => {
    const ids = ["a", "b"];
    const autoMap = new Map([
      ["a", makeAuto("a", ["b", "external"])],
      ["b", makeAuto("b")],
    ]);
    const edges = buildFlowEdges(ids, autoMap);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ from: "a", to: "b" });
  });

  it("falls back to sequential chain when no koppelingen", () => {
    const ids = ["x", "y", "z"];
    const autoMap = new Map([
      ["x", makeAuto("x")],
      ["y", makeAuto("y")],
      ["z", makeAuto("z")],
    ]);
    const edges = buildFlowEdges(ids, autoMap);
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({ from: "x", to: "y" });
    expect(edges[1]).toMatchObject({ from: "y", to: "z" });
  });

  it("returns empty for single automation", () => {
    const ids = ["solo"];
    const autoMap = new Map([["solo", makeAuto("solo")]]);
    expect(buildFlowEdges(ids, autoMap)).toHaveLength(0);
  });
});
