import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GitLabEndpointCheck from "@/pages/GitLabEndpointCheck";
import type { Automatisering } from "@/lib/types";

const { automations } = vi.hoisted(() => {
  const baseAutomation = (overrides: Partial<Automatisering>): Automatisering => ({
    id: "auto",
    naam: "Automation",
    categorie: "Anders",
    doel: "",
    trigger: "",
    systemen: [],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-29T00:00:00.000Z",
    laatstGeverifieerd: "2026-05-29T00:00:00.000Z",
    geverifieerdDoor: "Tester",
    lastSyncedAt: "2026-05-29T00:00:00.000Z",
    ...overrides,
  } as Automatisering);

  const automations = [
    baseAutomation({
      id: "hs-create",
      naam: "Create new deal",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      hubspotWorkflow: {
        name: "Create new deal",
        triggers: [{ label: "Deal meets criteria", source: "HubSpot" }],
        actions: [
          {
            index: 1,
            type: "WEBHOOK",
            label: "Send webhook",
            webhookMethod: "POST",
            webhookPath: "/operations/hubspot/create_new_deal",
          },
        ],
      },
    }),
    baseAutomation({
      id: "gl-create",
      naam: "New create deal",
      source: "gitlab",
      categorie: "Backend Script",
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/create_new_deal",
        handler: "new_create_deal",
        api_file: "app/api/operations.py",
        calls: [],
      },
    }),
    baseAutomation({
      id: "gl-unmatched",
      naam: "Check pipeline usage",
      source: "gitlab",
      categorie: "Backend Script",
      gitlabEndpoint: {
        method: "GET",
        endpoint: "/internal/check_pipeline_usage",
        handler: "check_pipeline_usage",
        calls: [],
      },
    }),
    baseAutomation({
      id: "gl-missing",
      naam: "Legacy helper without endpoint",
      source: "gitlab",
      categorie: "Backend Script",
      gitlabFilePath: "legacy/helper.py",
    }),
  ] satisfies Automatisering[];

  return { automations };
});

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringenIncludingLegacyGitlab: () => ({ data: automations, isLoading: false }),
}));

describe("GitLabEndpointCheck page", () => {
  it("shows GitLab endpoint status, paths and process journey linkability", () => {
    render(
      <MemoryRouter>
        <GitLabEndpointCheck />
      </MemoryRouter>,
    );

    screen.getByRole("heading", { name: "GitLab endpoint check" });
    screen.getByText("Tijdelijke developer-pagina om specifieke GitLab endpoint-automations te controleren. Legacy/bestandsrecords blijven zichtbaar als geen endpoint.");
    expect(screen.getAllByText("GitLab endpoint automations").length).toBeGreaterThanOrEqual(1);
    screen.getByText("specifieke endpoint-nodes");
    expect(screen.getAllByText("Geen endpoint").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Niet linkbaar").length).toBeGreaterThanOrEqual(1);

    const linkedRow = screen.getByText("New create deal").closest("tr") as HTMLElement;
    within(linkedRow).getByText("/operations/hubspot/create_new_deal");
    within(linkedRow).getByText("Gekoppeld");
    within(linkedRow).getByRole("link", { name: "Open" });

    fireEvent.click(screen.getByRole("button", { name: "Geen endpoint" }));

    const missingRow = screen.getByText("Legacy helper without endpoint").closest("tr") as HTMLElement;
    expect(within(missingRow).getAllByText("Geen endpoint").length).toBeGreaterThanOrEqual(1);
    within(missingRow).getByText("Dit is een legacy/bestandsrecord zonder specifieke endpoint-node; daarom telt het niet als GitLab automation voor procesreizen.");
  });

  it("shows a clean endpoint automation list by default and puts legacy records behind the no-endpoint filter", () => {
    render(
      <MemoryRouter>
        <GitLabEndpointCheck />
      </MemoryRouter>,
    );

    screen.getByText("New create deal");
    screen.getByText("Check pipeline usage");
    expect(screen.queryByText("Legacy helper without endpoint")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Geen endpoint" }));

    screen.getByText("Legacy helper without endpoint");
    expect(screen.queryByText("New create deal")).not.toBeInTheDocument();
  });
});
