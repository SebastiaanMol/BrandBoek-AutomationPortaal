import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AutomationDetailPage from "@/pages/AutomationDetailPage";
import type { Automatisering } from "@/lib/types";

const automations: Automatisering[] = [
  makeAutomation({
    id: "AUTO-TF-DETAIL",
    naam: "Contactformulier",
    source: "typeform",
    categorie: "Typeform",
    systemen: ["Typeform", "Backend"],
    externalId: "MNWzKwKE",
    koppelingen: [{ doelId: "AUTO-BACKEND", label: "Backend verwerking" }],
    lastSyncedAt: "2026-05-21T14:06:52.744+00:00",
    importProposal: {
      source: "typeform",
      read_only: true,
      typeform: {
        form: {
          id: "MNWzKwKE",
          title: "Contactformulier",
          display_url: "https://brandboekhouders.typeform.com/to/contact",
          hidden_fields: ["utm_source", "hubspot_utk", "gclid"],
          fields: [
            { id: "name", title: "Naam", type: "short_text", required: true },
            { id: "email", title: "E-mailadres", type: "email", required: true },
            {
              id: "help",
              title: "Waar kunnen we je mee helpen?",
              type: "multiple_choice",
              choices: ["BTW-aangifte", "Jaarrekening"],
            },
          ] as any,
        },
        webhooks: [
          {
            tag: "brand-backend",
            enabled: true,
            eventTypes: ["form_response"],
            path: "/typeform/contact",
            host: "automation.brandboekhouders.nl",
          },
        ],
        process: {
          trigger: "Een klant vult het Typeform formulier in.",
          outcome: "Typeform geeft de formulierinzending door aan de volgende verwerking.",
          webhookHandoffs: [
            { method: "POST", path: "/typeform/contact", host: "automation.brandboekhouders.nl" },
          ],
          steps: [],
        },
      },
    },
  }),
  makeAutomation({
    id: "AUTO-TF-NOLINK",
    naam: "Los Typeform formulier",
    source: "typeform",
    categorie: "Typeform",
    systemen: ["Typeform"],
    importProposal: {
      source: "typeform",
      read_only: true,
      typeform: {
        form: {
          id: "no-link",
          title: "Los Typeform formulier",
          fields: [],
          hidden_fields: [],
        },
        webhooks: [],
        process: {
          trigger: "",
          outcome: "",
          webhookHandoffs: [],
          steps: [],
        },
      },
    },
  }),
  makeAutomation({
    id: "AUTO-BACKEND",
    naam: "Backend verwerking",
    source: "gitlab",
    categorie: "Backend Script",
    systemen: ["GitLab", "Backend"],
  }),
  makeAutomation({
    id: "AUTO-HS",
    naam: "HubSpot workflow",
    source: "hubspot",
    categorie: "HubSpot Workflow",
    systemen: ["HubSpot"],
  }),
  makeAutomation({
    id: "AUTO-ZAP",
    naam: "Zapier automation",
    source: "zapier",
    categorie: "Zapier Zap",
    systemen: ["Zapier"],
  }),
];

const useAutomationsMock = vi.fn();
const useJourneyAutomationsMock = vi.fn();

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringen: () => useAutomationsMock(),
  useAutomatiseringenIncludingLegacyGitlab: () => useJourneyAutomationsMock(),
  useFlows: () => ({ data: [] }),
  useAllConfirmedAutomationLinks: () => ({ data: [] }),
  useFlowSuggesties: () => ({ data: [] }),
  usePipelines: () => ({ data: [] }),
  useSetCleanupDeleteCandidate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("Typeform automation detail template", () => {
  it("uses the Typeform template for Typeform automations", () => {
    renderDetail("AUTO-TF-DETAIL");

    const header = screen.getByRole("banner");
    expect(within(header).getByText("Typeform")).toBeInTheDocument();
    expect(within(header).getByText("Active")).toBeInTheDocument();
    expect(within(header).getByText("Form ID MNWzKwKE")).toBeInTheDocument();
    expect(within(header).getByText("3 velden")).toBeInTheDocument();
    expect(within(header).getByText("3 hidden fields")).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/bewerk/AUTO-TF-DETAIL");
    expect(within(header).getByRole("button", { name: "Raw data" })).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Open in Typeform" })).toHaveAttribute("href", "https://brandboekhouders.typeform.com/to/contact");

    const template = screen.getByLabelText("Typeform automation detail");
    expect(within(template).getByRole("heading", { name: "Wat doet dit Typeform formulier?" })).toBeInTheDocument();
    expect(within(template).getByText(/Dit formulier verzamelt/)).toBeInTheDocument();
    expect(within(template).getByRole("heading", { name: "Formulieropbouw" })).toBeInTheDocument();
    expect(within(template).getByText("Waar kunnen we je mee helpen?")).toBeInTheDocument();
    expect(within(template).getByText("BTW-aangifte")).toBeInTheDocument();
    expect(within(template).getByRole("heading", { name: "Verborgen contextvelden" })).toBeInTheDocument();
    expect(within(template).getByText("hubspot_utk")).toBeInTheDocument();
    expect(within(template).getByRole("heading", { name: "Webhook-overdracht" })).toBeInTheDocument();
    expect(within(template).getAllByText("automation.brandboekhouders.nl/typeform/contact").length).toBeGreaterThan(0);
    expect(within(template).getByRole("heading", { name: "Issues & gaps" })).toBeInTheDocument();
    expect(within(template).getByText("Gekoppelde automations")).toBeInTheDocument();
    expect(within(template).getByRole("link", { name: /Backend verwerking/ })).toHaveAttribute("href", "/automations/AUTO-BACKEND");
    expect(screen.queryByLabelText("Standaard automation uitleg")).not.toBeInTheDocument();
  });

  it("opens raw Typeform data from the detail header", () => {
    renderDetail("AUTO-TF-DETAIL");

    fireEvent.click(screen.getByRole("button", { name: "Raw data" }));

    const dialog = screen.getByRole("dialog", { name: "Raw Typeform data" });
    expect(within(dialog).getByText("Form ID MNWzKwKE")).toBeInTheDocument();
    expect(within(dialog).getByText(/brand-backend/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Kopieer JSON" })).toBeInTheDocument();
  });

  it("shows disabled source action when a Typeform display URL is unavailable", () => {
    renderDetail("AUTO-TF-NOLINK");

    const header = screen.getByRole("banner");
    expect(within(header).getByText("Bronlink niet beschikbaar")).toBeInTheDocument();
    expect(within(header).queryByRole("link", { name: "Open in Typeform" })).not.toBeInTheDocument();
  });

  it("keeps other source templates unchanged", () => {
    renderDetail("AUTO-HS");
    expect(screen.queryByLabelText("Typeform automation detail")).not.toBeInTheDocument();

    renderDetail("AUTO-ZAP");
    expect(screen.queryByLabelText("Typeform automation detail")).not.toBeInTheDocument();
  });
});

function renderDetail(id: string): void {
  vi.mocked(useAutomationsMock).mockReturnValue({ data: automations, isLoading: false });
  vi.mocked(useJourneyAutomationsMock).mockReturnValue({ data: automations });

  render(
    <MemoryRouter initialEntries={[`/automations/${id}`]}>
      <Routes>
        <Route path="/automations/:id" element={<AutomationDetailPage />} />
        <Route path="/alle" element={<div>Automations</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeAutomation(input: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO-TEST",
    naam: "Automation",
    categorie: "Anders",
    doel: "Verwerkt automation data.",
    trigger: "Startsignaal",
    systemen: ["Typeform"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: ["Sales"],
    createdAt: "2026-05-22T08:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...input,
  } as Automatisering;
}
