import { describe, expect, it } from "vitest";
import { buildAutomationSentryContext } from "@/lib/sentry";
import type { Automatisering } from "@/lib/types";

const automation: Automatisering = {
  id: "AUTO-123",
  naam: "HubSpot deal sync",
  categorie: "HubSpot Workflow",
  doel: "Sync deal stage",
  trigger: "Deal stage changed",
  systemen: ["HubSpot"],
  stappen: ["Read deal", "Update portal"],
  afhankelijkheden: "HubSpot token",
  owner: "Sales",
  status: "Actief",
  verbeterideeën: "",
  mermaidDiagram: "",
  koppelingen: [],
  fasen: ["Sales"],
  createdAt: "2026-06-18T00:00:00.000Z",
  laatstGeverifieerd: null,
  geverifieerdDoor: "",
  source: "hubspot",
  externalId: "workflow-456",
  pipelineId: "pipe-1",
  stageId: "stage-2",
  webhookPaths: ["/webhook/deal"],
  sourceFindings: [
    {
      id: "finding-1",
      automationId: "AUTO-123",
      source: "hubspot",
      type: "missing_trigger",
      severity: "blocking",
      message: "Trigger ontbreekt",
      firstSeenAt: "2026-06-18T00:00:00.000Z",
      lastSeenAt: "2026-06-18T00:00:00.000Z",
    },
  ],
};

describe("automation Sentry context", () => {
  it("keeps automation diagnostics searchable without sending full payloads", () => {
    expect(buildAutomationSentryContext(automation, "update")).toEqual({
      tags: {
        area: "automation",
        automation_action: "update",
        automation_id: "AUTO-123",
        automation_source: "hubspot",
        automation_status: "Actief",
      },
      contexts: {
        automation: {
          id: "AUTO-123",
          name: "HubSpot deal sync",
          source: "hubspot",
          externalId: "workflow-456",
          status: "Actief",
          systems: ["HubSpot"],
          pipelineId: "pipe-1",
          stageId: "stage-2",
          sourceFindings: 1,
          webhookPaths: 1,
        },
      },
    });
  });
});
