import { describe, expect, it } from "vitest";
import { buildFlowSuggestionAiPrompt } from "@/lib/flowSuggestionPromptBuilder";
import type { FlowSuggestionGroup } from "@/lib/flowSuggestionGroups";
import type { Automatisering } from "@/lib/types";

describe("flowSuggestionPromptBuilder", () => {
  it("builds a prompt with strict proof guardrails and raw source context", () => {
    const prompt = buildFlowSuggestionAiPrompt({
      group: makeGroup(),
      automations: [makeAutomation("hs"), makeAutomation("gl")],
      endpointEvidence: "/backend/process-deal",
    });

    expect(prompt).toContain("Je mag geen webhook-bewijs verzinnen");
    expect(prompt).toContain("confirmedTransitions");
    expect(prompt).toContain('"fromId": "hs"');
    expect(prompt).toContain('"normalizedEndpoint": "/backend/process-deal"');
    expect(prompt).toContain('"source": "hubspot"');
  });

  it("redacts token-like fields from raw automation data", () => {
    const automation = makeAutomation("zap");
    automation.importProposal = {
      zap: { id: "zap-1", title: "Zap" },
      token: "secret",
      nested: { authorization: "Bearer x" },
    };

    const prompt = buildFlowSuggestionAiPrompt({
      group: makeGroup(),
      automations: [automation],
      endpointEvidence: "/hook",
    });

    expect(prompt).toContain("[REDACTED]");
    expect(prompt).not.toContain("Bearer x");
    expect(prompt).not.toContain("secret");
  });
});

function makeGroup(): FlowSuggestionGroup {
  return {
    id: "hs__gl",
    nodes: [
      { id: "hs", naam: "HubSpot workflow", categorie: "HubSpot Workflow", source: "hubspot" },
      { id: "gl", naam: "Backend endpoint", categorie: "Backend Script", source: "gitlab" },
    ],
    suggestions: [
      {
        fromId: "hs",
        toId: "gl",
        fromNaam: "HubSpot workflow",
        toNaam: "Backend endpoint",
        fromCategorie: "HubSpot Workflow",
        toCategorie: "Backend Script",
        fromSource: "hubspot",
        toSource: "gitlab",
        zekerheid: "webhook",
        redenering: "Webhook-match: /backend/process-deal",
        confirmed: false,
        rejected: false,
      },
    ],
    webhookCount: 1,
    aiCount: 0,
    confirmedCount: 0,
    totalCount: 1,
    structureType: "lineair",
    structureSummary: "Deze kandidaat lijkt een lineaire stapvolgorde.",
  };
}

function makeAutomation(id: string): Automatisering {
  return {
    id,
    naam: id === "hs" ? "HubSpot workflow" : "Backend endpoint",
    categorie: id === "hs" ? "HubSpot Workflow" : "Backend Script",
    doel: "Doel",
    trigger: "Trigger",
    systemen: id === "hs" ? ["HubSpot"] : ["GitLab", "HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-28T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    source: id === "hs" ? "hubspot" : "gitlab",
    webhookPaths: id === "hs" ? ["/backend/process-deal"] : [],
    gitlabEndpoint:
      id === "gl"
        ? { method: "POST", endpoint: "/backend/process-deal", handler: "processDeal" }
        : undefined,
  } as unknown as Automatisering;
}
