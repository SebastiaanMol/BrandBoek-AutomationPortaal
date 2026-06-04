import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SourceQualityMatrixTab } from "@/components/flows/SourceQualityMatrixTab";
import type { Automatisering } from "@/lib/types";

describe("SourceQualityMatrixTab", () => {
  it("renders summary cards, source rows, exact matches and unmatched routes", () => {
    renderMatrix();

    expect(screen.getByRole("heading", { name: "Bronkwaliteit voor procesreizen" })).toBeInTheDocument();
    expect(screen.getByText("Webhook-only bewijs")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Automations per bron" })).toBeInTheDocument();
    expect(screen.getAllByText("Incompleet").length).toBeGreaterThan(0);
    expect(screen.getAllByText("HubSpot webhook").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GitLab receiver").length).toBeGreaterThan(0);
    expect(screen.getByText("100% webhook-match")).toBeInTheDocument();
    expect(screen.getAllByText("Zapier loose webhook").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GitLab open endpoint").length).toBeGreaterThan(0);
  });

  it("filters the automation table by source without hiding the matrix", () => {
    renderMatrix();

    fireEvent.click(screen.getByRole("button", { name: "GitLab/API" }));

    const table = screen.getByRole("table");
    expect(within(table).getByText("GitLab receiver")).toBeInTheDocument();
    expect(within(table).getByText("GitLab open endpoint")).toBeInTheDocument();
    expect(within(table).queryByText("HubSpot webhook")).not.toBeInTheDocument();
    expect(screen.getByText("100% webhook-match")).toBeInTheDocument();
  });

  it("keeps detail links on automation rows", () => {
    renderMatrix();

    expect(screen.getByRole("link", { name: "Open HubSpot webhook" })).toHaveAttribute(
      "href",
      "/automations/hs-webhook",
    );
  });

  it("shows ambiguous receiver routes separately from clean matches", () => {
    render(
      <MemoryRouter>
        <SourceQualityMatrixTab automations={[...automations, duplicateReceiver]} />
      </MemoryRouter>,
    );

    expect(screen.queryByText("100% webhook-match")).not.toBeInTheDocument();
    expect(screen.getByText("Dubbele receiver-route")).toBeInTheDocument();
    expect(screen.getAllByText("GitLab duplicate receiver").length).toBeGreaterThan(0);
  });

  it("renders duplicate route evidence without React duplicate key warnings", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <MemoryRouter>
        <SourceQualityMatrixTab automations={[hubspotDuplicateRouteEvidence, gitlabDuplicateRouteTarget]} />
      </MemoryRouter>,
    );

    const keyWarnings = consoleError.mock.calls.filter((call) =>
      call.some((part) => String(part).includes("Encountered two children with the same key")),
    );
    expect(keyWarnings).toHaveLength(0);

    consoleError.mockRestore();
  });
});

function renderMatrix() {
  render(
    <MemoryRouter>
      <SourceQualityMatrixTab automations={automations} />
    </MemoryRouter>,
  );
}

const automations: Automatisering[] = [
  baseAutomation({
    id: "hs-webhook",
    naam: "HubSpot webhook",
    source: "hubspot",
    categorie: "HubSpot Workflow",
    hubspotWorkflow: {
      name: "HubSpot webhook",
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
  }),
  baseAutomation({
    id: "gl-endpoint",
    naam: "GitLab receiver",
    source: "gitlab",
    categorie: "Backend Script",
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/properties/ib/finished_webhook",
      handler: "ib_finished_webhook",
      calls: [{ depth: 1, kind: "hubspot_repository_call", from: "handler", to: "repo", file: "repo.py" }],
    },
  }),
  baseAutomation({
    id: "zap-webhook",
    naam: "Zapier loose webhook",
    source: "zapier",
    categorie: "Zapier Zap",
    importProposal: {
      zap: {
        id: "zap-1",
        title: "Zapier loose webhook",
        process: {
          trigger: "New lead",
          outcome: "Send to API",
          conditions: [],
          emails: [],
          dataLookups: [],
          webhookHandoffs: [{ method: "POST", path: "/sales/leads/hubspot/trustoo" }],
          steps: [],
        },
      },
    },
  }),
  baseAutomation({
    id: "gl-open",
    naam: "GitLab open endpoint",
    source: "gitlab",
    categorie: "Backend Script",
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/operations/hubspot/create_new_deal",
      handler: "create_new_deal",
      calls: [{ depth: 1, kind: "hubspot_repository_call", from: "handler", to: "repo", file: "repo.py" }],
    },
  }),
];

const duplicateReceiver = baseAutomation({
  id: "gl-duplicate",
  naam: "GitLab duplicate receiver",
  source: "gitlab",
  categorie: "Backend Script",
  gitlabEndpoint: {
    method: "POST",
    endpoint: "/properties/ib/finished_webhook",
    handler: "ib_finished_webhook_copy",
    calls: [{ depth: 1, kind: "hubspot_repository_call", from: "handler", to: "repo", file: "repo.py" }],
  },
});

const hubspotDuplicateRouteEvidence = baseAutomation({
  id: "hs-duplicate-route-evidence",
  naam: "HubSpot duplicate route evidence",
  source: "hubspot",
  categorie: "HubSpot Workflow",
  webhookPaths: ["/operations/hubspot/create_new_deal"],
  hubspotWorkflow: {
    name: "HubSpot duplicate route evidence",
    triggers: [{ label: "Deal created", source: "HubSpot" }],
    actions: [
      {
        index: 1,
        type: "WEBHOOK",
        label: "Webhook",
        webhookMethod: "POST",
        webhookPath: "/operations/hubspot/create_new_deal",
      },
    ],
  },
});

const gitlabDuplicateRouteTarget = baseAutomation({
  id: "gl-duplicate-route-target",
  naam: "GitLab duplicate route target",
  source: "gitlab",
  categorie: "Backend Script",
  gitlabEndpoint: {
    method: "POST",
    endpoint: "/operations/hubspot/create_new_deal",
    handler: "create_new_deal",
  },
});

function baseAutomation(overrides: Partial<Automatisering>): Automatisering {
  return {
    id: "auto",
    naam: "Automation",
    categorie: "Anders",
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
    ...overrides,
  };
}
