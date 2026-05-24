import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AutomationsPage from "@/pages/AutomationsPage";
import type { Automatisering } from "@/lib/types";

function makeAutomation(
  id: string,
  naam: string,
  source: string,
  status: Automatisering["status"],
  categorie: Automatisering["categorie"],
  systemen: Automatisering["systemen"],
): Automatisering {
  return {
    id,
    naam,
    categorie,
    doel: `${naam} houdt het proces actueel.`,
    trigger: "",
    systemen,
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status,
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-21T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    source,
  } as Automatisering;
}

const automations: Automatisering[] = [
  makeAutomation("AUTO-DISABLED", "Uitgeschakelde import", "zapier", "Uitgeschakeld", "Zapier Zap", ["Zapier"]),
  makeAutomation("AUTO-HUBSPOT", "HubSpot workflow", "hubspot", "Actief", "HubSpot Workflow", ["HubSpot"]),
  {
    ...makeAutomation("AUTO-GITLAB", "GitLab backend", "gitlab", "In review", "Backend Script", ["GitLab", "Backend"]),
    sourceFindings: [
      {
        id: "finding-1",
        automationId: "AUTO-GITLAB",
        source: "gitlab",
        externalId: "app/API/example.py::POST /example",
        type: "source_missing",
        severity: "critical",
        message: "Deze automation kan niet meer worden teruggevonden bij GitLab.",
        firstSeenAt: "2026-05-18T08:00:00.000Z",
        lastSeenAt: "2026-05-21T08:00:00.000Z",
      },
    ],
  } as Automatisering,
  makeAutomation("AUTO-TYPEFORM", "Typeform formulier", "typeform", "Actief", "Typeform", ["Typeform"]),
];

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringen: () => ({ data: automations, isLoading: false }),
  useAutomatiseringenIncludingLegacyGitlab: () => ({ data: automations }),
  useFlows: () => ({ data: [] }),
  useAllConfirmedAutomationLinks: () => ({ data: [] }),
  usePortalSettings: () => ({
    data: {
      standaardStatusFilter: "alle",
      standaardSortering: "created_at",
    },
  }),
  useSetCleanupDeleteCandidate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/supabaseStorage", () => ({
  exportToCSV: vi.fn(() => "id,naam\nAUTO-HUBSPOT,HubSpot workflow"),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function renderOverview(): void {
  render(
    <MemoryRouter>
      <AutomationsPage />
    </MemoryRouter>,
  );
}

describe("Automations overview UI", () => {
  it("uses the process journey overview shell", () => {
    renderOverview();

    screen.getByText("Automatiseringsportaal");
    screen.getByRole("heading", { name: "Automation beheer" });
    screen.getByText("Automations");
    screen.getAllByText("Actief");
    screen.getByText("Bronnen");
    screen.getByText("Uitgeschakeld");
  });

  it("renders a calm management list with separate status, source and actions columns", () => {
    renderOverview();

    screen.getByRole("columnheader", { name: "Automation name" });
    screen.getByRole("columnheader", { name: "Status" });
    screen.getByRole("columnheader", { name: "Source" });
    screen.getByRole("columnheader", { name: "Acties" });

    const row = screen.getByRole("row", { name: /HubSpot workflow/i });
    within(row).getByText("Active");
    within(row).getByText("HubSpot");

    const openLink = within(row).getByRole("link", { name: "Open HubSpot workflow" });
    expect(openLink).toHaveAttribute("href", "/automations/AUTO-HUBSPOT");
  });

  it("keeps detailed filters behind a single filters button", () => {
    renderOverview();

    expect(screen.queryByText("Alle categorieen")).not.toBeInTheDocument();
    expect(screen.queryByText("Alle systemen")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Filters/i }));

    screen.getByText("Alle categorieen");
    screen.getByText("Alle systemen");
    screen.getByText("Alle statussen");
    screen.getByText("Alle koppelingen");
    screen.getByText("Aanmaakdatum");
  });

  it("does not show internal ids or category labels in standard overview rows", () => {
    renderOverview();

    const row = screen.getByRole("row", { name: /HubSpot workflow/i });

    expect(within(row).queryByText("AUTO-HUBSPOT")).not.toBeInTheDocument();
    expect(within(row).queryByText("HubSpot Workflow")).not.toBeInTheDocument();
  });

  it("keeps active automations above disabled automations in the visual rows", () => {
    renderOverview();

    const pageText = document.body.textContent ?? "";
    expect(pageText.indexOf("HubSpot workflow")).toBeLessThan(pageText.indexOf("Uitgeschakelde import"));
    expect(pageText.indexOf("Typeform formulier")).toBeLessThan(pageText.indexOf("Uitgeschakelde import"));
  });

  it("filters rows by source without merging source and status", async () => {
    renderOverview();

    fireEvent.click(screen.getByRole("tab", { name: /Typeform/i }));

    screen.getByRole("row", { name: /Typeform formulier/i });
    await waitFor(() => {
      expect(screen.queryByRole("row", { name: /HubSpot workflow/i })).not.toBeInTheDocument();
    });
    screen.getByRole("columnheader", { name: "Status" });
    screen.getByRole("columnheader", { name: "Source" });
  });

  it("shows accessible source warnings and can filter to them", async () => {
    renderOverview();

    const row = screen.getByRole("row", { name: /GitLab backend/i });
    within(row).getByText("Bronwaarschuwing");
    within(row).getByText("Niet gevonden bij GitLab");

    fireEvent.click(screen.getByRole("button", { name: /Filters/i }));
    fireEvent.click(screen.getByText("Alle bronwaarschuwingen"));
    fireEvent.click(screen.getByText("Met bronwaarschuwing"));

    screen.getByRole("row", { name: /GitLab backend/i });
    await waitFor(() => {
      expect(screen.queryByRole("row", { name: /HubSpot workflow/i })).not.toBeInTheDocument();
    });
  });
});
