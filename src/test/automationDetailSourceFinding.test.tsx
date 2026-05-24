import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AutomationDetailPage from "@/pages/AutomationDetailPage";
import type { Automatisering } from "@/lib/types";

const automation = {
  id: "AUTO-TF-001",
  naam: "Typeform intake",
  categorie: "Typeform",
  doel: "Verzamelt intakegegevens.",
  trigger: "",
  systemen: ["Typeform"],
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
  sourceFindings: [
    {
      id: "finding-typeform-missing",
      automationId: "AUTO-TF-001",
      source: "typeform",
      externalId: "form-123",
      type: "source_missing",
      severity: "critical",
      message: "Deze automation kan niet meer worden teruggevonden bij Typeform.",
      firstSeenAt: "2026-05-18T09:00:00.000Z",
      lastSeenAt: "2026-05-21T10:30:00.000Z",
    },
  ],
} as Automatisering;

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringen: () => ({ data: [automation], isLoading: false }),
  useAutomatiseringenIncludingLegacyGitlab: () => ({ data: [automation] }),
  useFlows: () => ({ data: [] }),
  useAllConfirmedAutomationLinks: () => ({ data: [] }),
  useSetCleanupDeleteCandidate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("automation detail source finding alert", () => {
  it("shows a prominent source_missing warning above the automation details", () => {
    render(
      <MemoryRouter initialEntries={["/automations/AUTO-TF-001"]}>
        <Routes>
          <Route path="/automations/:id" element={<AutomationDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    screen.getByRole("alert");
    screen.getByText("Deze automation kan niet meer worden teruggevonden bij Typeform.");
    screen.getByText(/Voor het eerst gezien/i);
    screen.getByText(/Laatst bevestigd/i);
  });
});
