import { describe, expect, it } from "vitest";
import {
  getAutomationSourceQualityFindings,
  getAutomationSourceQualityPresentation,
} from "@/lib/automationSourceQuality";
import type { Automatisering } from "@/lib/types";

describe("automation source quality", () => {
  it("marks a HubSpot workflow with trigger, actions and webhook path as process-journey ready", () => {
    const presentation = getAutomationSourceQualityPresentation(makeAutomation({
      source: "hubspot",
      categorie: "HubSpot Workflow",
      hubspotWorkflow: {
        name: "Create deal",
        objectType: "deal",
        triggers: [{ label: "Deal wordt aangemaakt", source: "HubSpot" }],
        actions: [{ index: 1, type: "WEBHOOK", label: "Webhook", webhookPath: "/api/create-deal" }],
      },
      webhookPaths: ["/api/create-deal"],
    }));

    expect(presentation.qualityStatus).toBe("ready");
    expect(presentation.isProcessJourneyReady).toBe(true);
    expect(presentation.missingEvidence).toEqual([]);
    expect(presentation.sourceSpecificChecks.filter((check) => check.status === "pass")).toHaveLength(4);
  });

  it("reports incomplete HubSpot source data when trigger and actions are missing", () => {
    const findings = getAutomationSourceQualityFindings(makeAutomation({
      source: "hubspot",
      categorie: "HubSpot Workflow",
      hubspotWorkflow: {
        name: "Incomplete workflow",
        triggers: [],
        actions: [],
      },
    }));

    expect(findings.map((finding) => finding.key)).toEqual([
      "hubspot_triggers",
      "hubspot_actions",
    ]);
    expect(findings.every((finding) => finding.type === "source_data_incomplete")).toBe(true);
  });

  it("reports incomplete Zapier source data when step flow or webhook handoff evidence is missing", () => {
    const presentation = getAutomationSourceQualityPresentation(makeAutomation({
      source: "zapier",
      categorie: "Zapier Zap",
      importProposal: {
        zap: {
          id: "zap-1",
          title: "Zap zonder stappen",
          process: {
            trigger: "",
            outcome: "",
            conditions: [],
            emails: [],
            dataLookups: [],
            webhookHandoffs: [],
            steps: [],
          },
        },
      },
      webhookPaths: ["/api/zapier/handoff"],
    }));

    expect(presentation.qualityStatus).toBe("incomplete");
    expect(presentation.isProcessJourneyReady).toBe(false);
    expect(presentation.missingEvidence.map((item) => item.key)).toEqual([
      "zapier_steps",
      "zapier_webhook_handoff",
    ]);
  });

  it("reports incomplete GitLab source data when endpoint and handler are missing", () => {
    const presentation = getAutomationSourceQualityPresentation(makeAutomation({
      source: "gitlab",
      categorie: "Backend Script",
      gitlabEndpoint: {
        calls: [],
      },
    }));

    expect(presentation.qualityStatus).toBe("incomplete");
    expect(presentation.isProcessJourneyReady).toBe(false);
    expect(presentation.missingEvidence.map((item) => item.key)).toContain("gitlab_endpoint");
    expect(presentation.missingEvidence.map((item) => item.key)).toContain("gitlab_handler");
  });

  it("reports incomplete Typeform source data when no active webhook is known", () => {
    const presentation = getAutomationSourceQualityPresentation(makeAutomation({
      source: "typeform",
      categorie: "Typeform",
      importProposal: {
        typeform: {
          form: {
            id: "form-1",
            title: "Intake",
            fields: [{ id: "field-1", title: "Naam", type: "short_text" }],
          },
          webhooks: [{ tag: "inactive", enabled: false, eventTypes: ["form_response"] }],
        },
      },
    }));

    expect(presentation.qualityStatus).toBe("incomplete");
    expect(presentation.missingEvidence.map((item) => item.key)).toEqual(["typeform_active_webhook"]);
  });

  it("handles a minimal automation with safe fallback checks", () => {
    const presentation = getAutomationSourceQualityPresentation(makeAutomation({
      source: undefined,
      categorie: "Anders",
    }));

    expect(presentation.qualityStatus).toBe("unknown");
    expect(presentation.isProcessJourneyReady).toBe(false);
    expect(presentation.summary).toContain("geen bron");
  });
});

function makeAutomation(input: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO-TEST",
    naam: "Automation",
    categorie: "Anders",
    doel: "Verwerkt automation data.",
    trigger: "",
    systemen: ["Anders"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-22T08:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...input,
  } as Automatisering;
}
