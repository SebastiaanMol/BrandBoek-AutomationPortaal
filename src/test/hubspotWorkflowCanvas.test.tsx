import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HubSpotWorkflowCanvas } from "@/components/HubSpotWorkflowCanvas";
import type { Automatisering } from "@/lib/types";

vi.mock("@/lib/hooks", () => ({
  usePipelines: () => ({ data: [] }),
}));

describe("HubSpotWorkflowCanvas", () => {
  it("shows the full HubSpot webhook URL on the action card", () => {
    render(
      <HubSpotWorkflowCanvas
        automation={makeHubSpotAutomation({
          hubspotWorkflow: {
            name: "Create new deal",
            objectType: "deal",
            enrollmentType: "LIST_BASED",
            shouldReEnroll: true,
            triggers: [{ label: "Activiteit Sales Deal Stage is Actief", source: "HubSpot" }],
            actions: [
              {
                index: 1,
                type: "WEBHOOK",
                label: "Webhook",
                webhookMethod: "POST",
                webhookPath: "/operations/hubspot/create_new_deal",
                webhookUrl: "https://composed-month-production.up.railway.app/operations/hubspot/create_new_deal",
              },
            ],
          },
        })}
      />,
    );

    expect(screen.getByText("https://composed-month-production.up.railway.app/operations/hubspot/create_new_deal")).toBeInTheDocument();
  });
});

function makeHubSpotAutomation(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "AUTO-HS-CREATE-DEAL",
    naam: "Create new deal",
    categorie: "HubSpot Workflow",
    doel: "Creates a new deal.",
    trigger: "deal eigenschap",
    systemen: ["HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-21T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    source: "hubspot",
    webhookPaths: ["/operations/hubspot/create_new_deal"],
    ...overrides,
  } as Automatisering;
}
