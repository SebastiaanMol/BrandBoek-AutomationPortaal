import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    lastSyncedAt: "2026-05-26T09:30:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    source,
  } as Automatisering;
}

const defaultAutomations: Automatisering[] = [
  makeAutomation("AUTO-DISABLED", "Uitgeschakelde import", "zapier", "Uitgeschakeld", "Zapier Zap", ["Zapier"]),
  {
    ...makeAutomation("AUTO-HUBSPOT", "HubSpot workflow", "hubspot", "Actief", "HubSpot Workflow", ["HubSpot"]),
    doel: "Zet de deal klaar voor opvolging.",
    trigger: "Deal stage is afspraak ingepland",
    hubspotWorkflow: {
      name: "HubSpot workflow",
      objectType: "deal",
      enrollmentType: "DEAL_BASED",
      shouldReEnroll: false,
      triggers: [{ label: "Deal stage is afspraak ingepland", source: "HubSpot" }],
      actions: [
        { index: 1, type: "SET_PROPERTY", label: "Update deal" },
        { index: 2, type: "WEBHOOK", label: "Webhook", webhookPath: "/sales/leads/hubspot/trustoo" },
      ],
    },
    webhookPaths: ["/sales/leads/hubspot/trustoo"],
  } as Automatisering,
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

let automations: Automatisering[] = defaultAutomations;

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
  beforeEach(() => {
    automations = defaultAutomations;
    sessionStorage.clear();
  });

  it("uses the process journey overview shell", () => {
    renderOverview();

    screen.getByRole("heading", { name: "Automation beheer" });
    screen.getByText("4 automations");
    screen.getByLabelText("2 actief");
    screen.getByLabelText("1 uitgeschakeld");
    screen.getByLabelText("4 bronnen");
    screen.getByLabelText("1 waarschuwing");
    expect(screen.queryByText("Zoekbare catalogus")).not.toBeInTheDocument();
  });

  it("keeps source tabs, search and filters inside one catalog card", () => {
    renderOverview();

    const catalog = screen.getByRole("region", { name: "Automations catalogus" });
    within(catalog).getByRole("tab", { name: /Alle 4/i });
    within(catalog).getByRole("tab", { name: /HubSpot 1/i });
    within(catalog).getByPlaceholderText("Zoek op naam, bron, trigger of beschrijving...");
    within(catalog).getByRole("button", { name: /Filters/i });
    expect(screen.queryByText("Kies een bron om de lijst te beperken. De status en source blijven bewust gescheiden.")).not.toBeInTheDocument();
  });

  it("renders a compact catalog with separate name, source, status, last seen and actions columns", () => {
    renderOverview();

    screen.getByRole("columnheader", { name: "Naam" });
    screen.getByRole("columnheader", { name: "Source" });
    screen.getByRole("columnheader", { name: "Status" });
    screen.getByRole("columnheader", { name: "Gesynchroniseerd" });
    screen.getByRole("columnheader", { name: "Acties" });

    const row = screen.getByRole("row", { name: /HubSpot workflow/i });
    within(row).getByText("Active");
    within(row).getByText("HubSpot");
    within(row).getByText("Gesynchroniseerd");
    within(row).getByText("26 mei 2026");
    within(row).getByText("Zet de deal klaar voor opvolging.");

    const openLink = within(row).getByRole("link", { name: "Open HubSpot workflow" });
    expect(openLink).toHaveAttribute("href", "/automations/AUTO-HUBSPOT");
    expect(within(row).queryByText("Raw data")).not.toBeInTheDocument();
    expect(within(row).queryByText("Open in HubSpot")).not.toBeInTheDocument();
    expect(within(row).queryByText("Edit")).not.toBeInTheDocument();
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

  it("shows active filter chips under the search bar", () => {
    renderOverview();

    fireEvent.change(screen.getByPlaceholderText("Zoek op naam, bron, trigger of beschrijving..."), {
      target: { value: "HubSpot" },
    });

    screen.getByText("Zoek: HubSpot");
    screen.getByRole("button", { name: "Filters wissen" });
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
    screen.getByRole("columnheader", { name: "Gesynchroniseerd" });
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

  it("treats incomplete source data findings as catalog source warnings", async () => {
    automations = [
      {
        ...makeAutomation("AUTO-INCOMPLETE", "Zapier mist stappen", "zapier", "Actief", "Zapier Zap", ["Zapier"]),
        sourceFindings: [
          {
            id: "finding-incomplete",
            automationId: "AUTO-INCOMPLETE",
            source: "zapier",
            type: "source_data_incomplete",
            severity: "warning",
            message: "Zapier step flow ontbreekt.",
            firstSeenAt: "2026-05-18T08:00:00.000Z",
            lastSeenAt: "2026-05-21T08:00:00.000Z",
          },
        ],
      } as Automatisering,
      makeAutomation("AUTO-COMPLETE", "HubSpot compleet", "hubspot", "Actief", "HubSpot Workflow", ["HubSpot"]),
    ];

    renderOverview();

    const row = screen.getByRole("row", { name: /Zapier mist stappen/i });
    within(row).getByText("Bronwaarschuwing");
    within(row).getByText("Zapier step flow ontbreekt.");

    fireEvent.click(screen.getByRole("button", { name: /Filters/i }));
    fireEvent.click(screen.getByText("Alle bronwaarschuwingen"));
    fireEvent.click(screen.getByText("Met bronwaarschuwing"));

    screen.getByRole("row", { name: /Zapier mist stappen/i });
    await waitFor(() => {
      expect(screen.queryByRole("row", { name: /HubSpot compleet/i })).not.toBeInTheDocument();
    });
  });

  it("expands one automation row at a time with a trigger action outcome process line", async () => {
    renderOverview();

    fireEvent.click(screen.getByRole("button", { name: "Toon proceslijn voor HubSpot workflow" }));

    screen.getByText("Trigger");
    expect(screen.getAllByText("Acties").length).toBeGreaterThanOrEqual(2);
    screen.getByText("Outcome");
    screen.getByText("Deal stage is afspraak ingepland");
    screen.getByText("HubSpot workflow geeft data door via POST webhook naar Backend endpoint.");
    screen.getByText("Backend endpoint: Uitvoering buiten HubSpot");
    screen.getByText("1 webhook");
    screen.getByRole("link", { name: "Open volledige details van HubSpot workflow" });

    fireEvent.click(screen.getByRole("button", { name: "Toon proceslijn voor Typeform formulier" }));

    await waitFor(() => {
      expect(screen.queryByText("HubSpot workflow geeft data door via POST webhook naar Backend endpoint.")).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("Typeform formulier houdt het proces actueel.").length).toBeGreaterThanOrEqual(2);
  });

  it("expands an automation when the row itself is clicked", () => {
    renderOverview();

    fireEvent.click(screen.getByRole("row", { name: /HubSpot workflow/i }));

    screen.getByText("Trigger");
    screen.getByText("Deal stage is afspraak ingepland");
    screen.getByText("HubSpot workflow geeft data door via POST webhook naar Backend endpoint.");
  });

  it("renders a window of rows for large catalogs while search still covers all automations", async () => {
    automations = Array.from({ length: 160 }, (_, index) =>
      makeAutomation(
        `AUTO-${index}`,
        `Automation ${index}`,
        index % 2 === 0 ? "hubspot" : "zapier",
        "Actief",
        index % 2 === 0 ? "HubSpot Workflow" : "Zapier Zap",
        index % 2 === 0 ? ["HubSpot"] : ["Zapier"],
      ),
    );

    renderOverview();

    expect(screen.queryByRole("row", { name: /Automation 159/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Zoek op naam, bron, trigger of beschrijving..."), {
      target: { value: "Automation 159" },
    });

    await waitFor(() => {
      screen.getByRole("row", { name: /Automation 159/i });
    });
  });

  it("restores automation catalog state from navigation memory", () => {
    sessionStorage.setItem("automationNavigator.navigation.automations", JSON.stringify({
      pathname: "/alle",
      search: "",
      hash: "",
      scrollY: 0,
      updatedAt: Date.now(),
      data: {
        sourceFilter: "hubspot",
        query: "workflow",
        statusFilter: "Actief",
        sortOrder: "naam",
        expandedAutomationId: "AUTO-HUBSPOT",
        filtersOpen: true,
      },
    }));

    renderOverview();

    expect(screen.getByPlaceholderText("Zoek op naam, bron, trigger of beschrijving...")).toHaveValue("workflow");
    screen.getByText("Zoek: workflow");
    screen.getByText("Status: Actief");
    screen.getByText("Sortering: Naam");
    screen.getByRole("row", { name: /HubSpot workflow/i });
    expect(screen.queryByRole("row", { name: /GitLab backend/i })).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Verberg proceslijn voor HubSpot workflow" });
  });

  it("remembers automation catalog state before opening a detail page", () => {
    Object.defineProperty(window, "scrollY", { value: 333, configurable: true });
    renderOverview();

    fireEvent.change(screen.getByPlaceholderText("Zoek op naam, bron, trigger of beschrijving..."), {
      target: { value: "HubSpot" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Toon proceslijn voor HubSpot workflow" }));
    fireEvent.click(screen.getByRole("link", { name: "Open HubSpot workflow" }));

    const stored = JSON.parse(sessionStorage.getItem("automationNavigator.navigation.automations") ?? "{}");

    expect(stored.pathname).toBe("/");
    expect(stored.scrollY).toBe(333);
    expect(stored.data).toMatchObject({
      sourceFilter: "alle",
      query: "HubSpot",
      expandedAutomationId: "AUTO-HUBSPOT",
      focusAutomationId: "AUTO-HUBSPOT",
    });
  });
});
