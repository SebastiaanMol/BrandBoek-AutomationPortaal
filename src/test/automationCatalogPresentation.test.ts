import { describe, expect, it } from "vitest";
import {
  getAutomationCatalogPreviewPresentation,
  getAutomationCatalogRowPresentation,
} from "@/lib/automationCatalogPresentation";
import type { Automatisering } from "@/lib/types";

describe("automation catalog presentation", () => {
  it("builds source-aware row presentation for HubSpot automations", () => {
    const presentation = getAutomationCatalogRowPresentation(makeAutomation({
      id: "AUTO-HS",
      naam: "Create deal",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      lastSyncedAt: "2026-05-26T09:30:00.000Z",
      hubspotLastRunAt: "2026-05-21T10:00:00.000Z",
      hubspotRunCount365d: 42,
      hubspotWorkflow: {
        name: "Create deal",
        objectType: "deal",
        triggers: [{ label: "Deal wordt aangemaakt", source: "HubSpot" }],
        actions: [{ index: 1, type: "WEBHOOK", label: "Webhook", webhookPath: "/sales/deals" }],
      },
    }));

    expect(presentation).toMatchObject({
      displayName: "Create deal",
      sourceLabel: "HubSpot",
      statusLabel: "Active",
      lastSeenLabel: "Gesynchroniseerd",
      lastSeenDetail: "26 mei 2026",
    });
    expect(presentation.shortDescription).toContain("HubSpot");
    expect("preview" in presentation).toBe(false);
  });

  it("builds catalog preview only when requested", () => {
    const presentation = getAutomationCatalogPreviewPresentation(makeAutomation({
      id: "AUTO-HS",
      naam: "Create deal",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      hubspotWorkflow: {
        name: "Create deal",
        objectType: "deal",
        triggers: [{ label: "Deal wordt aangemaakt", source: "HubSpot" }],
        actions: [{ index: 1, type: "WEBHOOK", label: "Webhook", webhookPath: "/sales/deals" }],
      },
    }));

    expect(presentation.triggerLabel).toBe("Deal wordt aangemaakt");
  });

  it("uses Zapier last_changed when available", () => {
    const presentation = getAutomationCatalogRowPresentation(makeAutomation({
      id: "AUTO-ZAP",
      naam: "Zap opvolging",
      source: "zapier",
      categorie: "Zapier Zap",
      lastSyncedAt: "2026-05-26T09:30:00.000Z",
      importProposal: {
        source: "zapier",
        zapier_export: {
          sanitized_nodes: {
            "1": {
              id: 1,
              parent_id: null,
              last_changed: "2026-04-27T08:35:30+00:00",
            },
          },
        },
      },
    }));

    expect(presentation.sourceLabel).toBe("Zapier");
    expect(presentation.lastSeenLabel).toBe("Gesynchroniseerd");
    expect(presentation.lastSeenDetail).toBe("26 mei 2026");
  });

  it("uses GitLab sync and commit evidence safely", () => {
    const presentation = getAutomationCatalogRowPresentation(makeAutomation({
      id: "AUTO-GL",
      naam: "Backend endpoint",
      source: "gitlab",
      categorie: "Backend Script",
      lastSyncedAt: "2026-05-05T08:44:32.673Z",
      gitlabLastCommit: "c2fdbd671d33f04f9b838892e4f6a22a9dc22ff1",
    }));

    expect(presentation.sourceLabel).toBe("GitLab");
    expect(presentation.lastSeenLabel).toBe("Gesynchroniseerd");
    expect(presentation.lastSeenDetail).toBe("5 mei 2026");
  });

  it("uses Typeform updated metadata before sync fallback", () => {
    const presentation = getAutomationCatalogRowPresentation(makeAutomation({
      id: "AUTO-TF",
      naam: "Contactformulier",
      source: "typeform",
      categorie: "Typeform",
      lastSyncedAt: "2026-05-21T14:06:52.744+00:00",
      importProposal: {
        source: "typeform",
        typeform_api: {
          form: {
            last_updated_at: "2025-11-07T08:24:30+00:00",
          },
        },
      },
    }));

    expect(presentation.sourceLabel).toBe("Typeform");
    expect(presentation.lastSeenLabel).toBe("Gesynchroniseerd");
    expect(presentation.lastSeenDetail).toBe("21 mei 2026");
  });

  it("shows active source warning and safe minimal fallback", () => {
    const presentation = getAutomationCatalogRowPresentation(makeAutomation({
      id: "AUTO-MIN",
      naam: "Minimale automation",
      source: undefined,
      sourceFindings: [
        {
          id: "finding-1",
          automationId: "AUTO-MIN",
          source: "zapier",
          type: "source_missing",
          severity: "critical",
          message: "Niet meer gevonden bij Zapier.",
          firstSeenAt: "2026-05-20T08:00:00.000Z",
          lastSeenAt: "2026-05-21T08:00:00.000Z",
        },
      ],
    }));

    expect(presentation.sourceLabel).toBe("Handmatig");
    expect(presentation.lastSeenLabel).toBe("Gesynchroniseerd");
    expect(presentation.lastSeenDetail).toBe("Geen synchronisatiedatum");
    expect(presentation.warning).toBe("Niet meer gevonden bij Zapier.");
    expect(presentation.shortDescription).toBeTruthy();
  });

  it("shows source data incomplete findings as catalog warnings", () => {
    const presentation = getAutomationCatalogRowPresentation(makeAutomation({
      id: "AUTO-GAP",
      naam: "GitLab endpoint zonder handler",
      source: "gitlab",
      sourceFindings: [
        {
          id: "finding-2",
          automationId: "AUTO-GAP",
          source: "gitlab",
          type: "source_data_incomplete",
          severity: "warning",
          message: "Brondata mist endpoint of handler voor procesreisvorming.",
          firstSeenAt: "2026-05-20T08:00:00.000Z",
          lastSeenAt: "2026-05-21T08:00:00.000Z",
        },
      ],
    }));

    expect(presentation.warning).toBe("Brondata mist endpoint of handler voor procesreisvorming.");
  });
});

function makeAutomation(input: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO-TEST",
    naam: "Automation",
    categorie: "Anders",
    doel: "Verwerkt automation data.",
    trigger: "Startsignaal",
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
