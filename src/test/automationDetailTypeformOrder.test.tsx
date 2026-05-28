import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AutomationDetailPage from "@/pages/AutomationDetailPage";
import type { Automatisering } from "@/lib/types";

const typeformAutomation: Automatisering = {
  id: "AUTO-TF-ORDER",
  naam: "Onboarding formulier",
  categorie: "Typeform",
  doel: "Typeform formulier verzamelt onboardinginformatie voor Brand.",
  trigger: "Typeform formulier wordt ingevuld",
  systemen: ["Typeform", "Backend"],
  stappen: [],
  afhankelijkheden: "",
  owner: "",
  status: "Actief",
  verbeterideeen: "",
  mermaidDiagram: "",
  koppelingen: [],
  fasen: [],
  createdAt: "2026-05-21T00:00:00.000Z",
  laatstGeverifieerd: null,
  geverifieerdDoor: "",
  source: "typeform",
  importProposal: {
    source: "typeform",
    read_only: true,
    typeform: {
      form: {
        id: "abc123",
        title: "Onboarding formulier",
        fields: [
          {
            id: "choice-1",
            title: "Welke dienstverlening wil de klant bespreken?",
            type: "multiple_choice",
            choices: ["BTW-aangifte", "Jaarrekening"],
          },
        ],
      },
      webhooks: [],
      process: {
        trigger: "Een klant vult het Typeform formulier in.",
        outcome: "Het portaal toont de formulierstructuur read-only.",
        webhookHandoffs: [],
        steps: [],
      },
    },
  },
};

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringen: () => ({ data: [typeformAutomation], isLoading: false }),
  useAutomatiseringenIncludingLegacyGitlab: () => ({ data: [typeformAutomation] }),
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

function renderAutomationDetail(): void {
  render(
    <MemoryRouter initialEntries={["/automations/AUTO-TF-ORDER"]}>
      <Routes>
        <Route path="/automations/:id" element={<AutomationDetailPage />} />
        <Route path="/alle" element={<div>Automations</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AutomationDetailPage Typeform order", () => {
  it("starts Typeform details with the Typeform-specific explanation", () => {
    renderAutomationDetail();

    const typeformTemplate = screen.getByLabelText("Typeform automation detail");
    expect(within(typeformTemplate).getByText("Wat doet dit Typeform formulier?")).toBeInTheDocument();
    expect(within(typeformTemplate).getByText("Formulieropbouw")).toBeInTheDocument();
    expect(within(typeformTemplate).getByText("Welke dienstverlening wil de klant bespreken?")).toBeInTheDocument();
    expect(typeformTemplate.textContent ?? "").not.toContain("POST");
    expect(screen.queryByLabelText("Standaard automation uitleg")).not.toBeInTheDocument();
  });
});
