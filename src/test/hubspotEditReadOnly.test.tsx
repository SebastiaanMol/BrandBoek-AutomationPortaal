import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import BewerkAutomatisering from "@/pages/BewerkAutomatisering";
import type { Automatisering } from "@/lib/types";

const updateAutomationMock = vi.fn();

const hubspotAutomation = makeAutomation({
  id: "AUTO-HS-EDIT",
  naam: "Whatsapp",
  source: "hubspot",
  categorie: "HubSpot Workflow",
  trigger: "Contact is associated to: Any Meeting",
  doel: "HubSpot workflow-uitkomst niet gespecificeerd",
  systemen: ["HubSpot"],
  stappen: ["Webhook action"],
  owner: "Linda",
  status: "Actief",
  hubspotWorkflow: {
    workflowId: "57732512",
    name: "Whatsapp",
    objectType: "contact",
    triggers: [{ label: "Contact is associated to: Any Meeting", source: "HubSpot" }],
    actions: [{ index: 1, type: "WEBHOOK", label: "Webhook", webhookPath: "/whatsapp/webhook" }],
  },
  importProposal: {
    hubspot_workflow: {
      id: "57732512",
      revisionId: "16",
    },
  },
});

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringen: () => ({ data: [hubspotAutomation], isLoading: false }),
  useNextId: () => ({ data: "AUTO-999", isLoading: false }),
  usePortalSettings: () => ({ data: undefined }),
  useSaveAutomatisering: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAutomatisering: () => ({ mutateAsync: updateAutomationMock, isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("HubSpot edit page", () => {
  it("shows HubSpot source fields as read-only and routes edits to HubSpot", () => {
    renderEditPage();

    screen.getByText("HubSpot bronvelden zijn read-only");
    screen.getByText("Pas bronvelden aan in HubSpot en sync daarna opnieuw.");

    const sourcePanel = screen.getByLabelText("HubSpot bronvelden");
    within(sourcePanel).getByText("Whatsapp");
    within(sourcePanel).getByText("Contact is associated to: Any Meeting");
    within(sourcePanel).getByText("Webhook action");
    within(sourcePanel).getByRole("link", { name: "Open in HubSpot" });

    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Trigger")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Flow / Steps")).not.toBeInTheDocument();

    fireEvent.click(within(sourcePanel).getAllByRole("button", { name: "Edit" })[0]);
    within(sourcePanel).getByText("Dit veld komt uit HubSpot. Pas dit aan bij de bron en sync daarna opnieuw.");
  });

  it("keeps HubSpot source fields unchanged when portal metadata is saved", async () => {
    renderEditPage();

    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "Sanne" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(updateAutomationMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "AUTO-HS-EDIT",
      naam: "Whatsapp",
      trigger: "Contact is associated to: Any Meeting",
      doel: "HubSpot workflow-uitkomst niet gespecificeerd",
      stappen: ["Webhook action"],
      source: "hubspot",
      hubspotWorkflow: hubspotAutomation.hubspotWorkflow,
      importProposal: hubspotAutomation.importProposal,
      owner: "Sanne",
    }));
  });
});

function renderEditPage(): void {
  updateAutomationMock.mockResolvedValue(undefined);

  render(
    <MemoryRouter initialEntries={["/bewerk/AUTO-HS-EDIT"]}>
      <Routes>
        <Route path="/bewerk/:id" element={<BewerkAutomatisering />} />
        <Route path="/automations/:id" element={<div>Detail</div>} />
        <Route path="/alle" element={<div>Alle automations</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeAutomation(input: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO-TEST",
    naam: "Automation",
    categorie: "Anders",
    doel: "Doel",
    trigger: "Trigger",
    systemen: ["HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-22T08:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...input,
  } as Automatisering;
}
