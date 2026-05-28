import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Flows from "@/pages/Flows";
import type { Automatisering } from "@/lib/types";

const { automations } = vi.hoisted(() => ({
  automations: [
    {
      id: "hs-webhook",
      naam: "IB ingediend",
      categorie: "HubSpot Workflow",
      doel: "",
      trigger: "",
      systemen: ["HubSpot"],
      stappen: [],
      afhankelijkheden: "",
      owner: "",
      status: "Actief",
      verbeterideeen: "",
      mermaidDiagram: "",
      koppelingen: [],
      fasen: [],
      createdAt: "2026-05-28T00:00:00.000Z",
      laatstGeverifieerd: null,
      geverifieerdDoor: "",
      source: "hubspot",
      hubspotWorkflow: {
        name: "IB ingediend",
        triggers: [{ label: "IB ingediend is true", source: "HubSpot" }],
        actions: [
          {
            index: 1,
            type: "WEBHOOK",
            label: "Webhook",
            webhookPath: "/properties/ib/finished_webhook",
          },
        ],
      },
    },
    {
      id: "gl-endpoint",
      naam: "IB endpoint",
      categorie: "Backend Script",
      doel: "",
      trigger: "",
      systemen: ["GitLab"],
      stappen: [],
      afhankelijkheden: "",
      owner: "",
      status: "Actief",
      verbeterideeen: "",
      mermaidDiagram: "",
      koppelingen: [],
      fasen: [],
      createdAt: "2026-05-28T00:00:00.000Z",
      laatstGeverifieerd: null,
      geverifieerdDoor: "",
      source: "gitlab",
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/properties/ib/finished_webhook",
        handler: "ib_finished_webhook",
        calls: [
          {
            depth: 1,
            kind: "hubspot_repository_call",
            from: "handler",
            to: "repo",
            file: "repo.py",
          },
        ],
      },
    },
  ] satisfies Automatisering[],
}));

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringen: () => ({ data: automations }),
  useAutomatiseringenIncludingLegacyGitlab: () => ({ data: automations }),
  useFlows: () => ({ data: [] }),
  useAllConfirmedAutomationLinks: () => ({ data: [] }),
  useFlowSuggesties: () => ({ data: [] }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/storage/edgeFunctions", () => ({ invokeEdgeFunction: vi.fn() }));

describe("Flows source quality tab", () => {
  it("renders Bronkwaliteit as a third tab with the matrix content", async () => {
    render(
      <MemoryRouter>
        <Flows />
      </MemoryRouter>,
    );

    const sourceQualityTab = screen.getByRole("tab", { name: "Bronkwaliteit" });
    fireEvent.mouseDown(sourceQualityTab);
    fireEvent.click(sourceQualityTab);

    expect(
      await screen.findByRole("heading", { name: "Bronkwaliteit voor procesreizen" }),
    ).toBeInTheDocument();
    expect(screen.getByText("100% webhook-match")).toBeInTheDocument();
    expect(screen.getAllByText("/properties/ib/finished_webhook").length).toBeGreaterThan(0);
  });
});
