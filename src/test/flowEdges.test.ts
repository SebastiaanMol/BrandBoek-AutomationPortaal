import { describe, it, expect } from "vitest";
import { buildFlowEdges } from "@/lib/flowEdges";
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

function makeWebhookSender(id: string, path: string): Automatisering {
  return {
    ...makeAuto(id),
    source: "hubspot",
    categorie: "HubSpot Workflow",
    webhookPaths: [path],
  };
}

function makeGitLabReceiver(id: string, endpoint: string): Automatisering {
  return {
    ...makeAuto(id),
    source: "gitlab",
    categorie: "Backend Script",
    gitlabEndpoint: { method: "POST", endpoint, handler: "handler" },
  };
}

describe("buildFlowEdges", () => {
  it("does not build edges from legacy koppelingen", () => {
    const ids = ["a", "b", "c"];
    const autoMap = new Map([
      ["a", makeAuto("a", ["b"])],
      ["b", makeAuto("b", ["c"])],
      ["c", makeAuto("c")],
    ]);
    const edges = buildFlowEdges(ids, autoMap);
    expect(edges).toEqual([]);
  });

  it("ignores koppelingen pointing outside the flow", () => {
    const ids = ["a", "b"];
    const autoMap = new Map([
      ["a", makeAuto("a", ["b", "external"])],
      ["b", makeAuto("b")],
    ]);
    const edges = buildFlowEdges(ids, autoMap);
    expect(edges).toEqual([]);
  });

  it("does not fall back to a sequential chain", () => {
    const ids = ["x", "y", "z"];
    const autoMap = new Map([
      ["x", makeAuto("x")],
      ["y", makeAuto("y")],
      ["z", makeAuto("z")],
    ]);
    const edges = buildFlowEdges(ids, autoMap);
    expect(edges).toEqual([]);
  });

  it("builds process journey edges only from confirmed exact webhook matches", () => {
    const ids = ["hubspot", "other", "gitlab"];
    const autoMap = new Map([
      ["hubspot", makeWebhookSender("hubspot", "/wefact/hubspot/upsert_debtor")],
      ["other", makeAuto("other")],
      ["gitlab", makeGitLabReceiver("gitlab", "/wefact/hubspot/upsert_debtor")],
    ]);
    const edges = buildFlowEdges(ids, autoMap, [
      { sourceId: "hubspot", targetId: "gitlab" },
    ]);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      from: "hubspot",
      to: "gitlab",
      label: "",
      evidence: { level: "confirmed", label: "100% webhook-match", score: 100 },
    });
  });

  it("ignores confirmed links without an exact webhook match", () => {
    const ids = ["a", "b"];
    const autoMap = new Map([
      ["a", makeWebhookSender("a", "/api/customer")],
      ["b", makeGitLabReceiver("b", "/customer")],
    ]);
    const edges = buildFlowEdges(ids, autoMap, [
      { sourceId: "a", targetId: "b" },
    ]);

    expect(edges).toEqual([]);
  });

  it("returns empty for single automation", () => {
    const ids = ["solo"];
    const autoMap = new Map([["solo", makeAuto("solo")]]);
    expect(buildFlowEdges(ids, autoMap)).toHaveLength(0);
  });
});
