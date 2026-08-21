import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppLayout } from "@/components/AppLayout";
import { AutomationDetailPanel } from "@/components/process/AutomationDetailPanel";
import Dashboard from "@/pages/Dashboard";
import type { Automation } from "@/data/processData";
import type { Automatisering } from "@/lib/types";

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({
    user: { email: "test@example.com" },
    signOut: vi.fn(),
  }),
}));

vi.mock("@/lib/queryHooks/automations", () => ({
  useAutomatiseringen: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/lib/queryHooks/automationLinks", () => ({
  useAllConfirmedAutomationLinks: () => ({ data: [] }),
  useFlowSuggesties: () => ({ data: [] }),
}));

vi.mock("@/lib/queryHooks/flows", () => ({
  useFlows: () => ({ data: [] }),
}));

vi.mock("@/lib/queryHooks/pipelines", () => ({
  usePipelines: () => ({ data: [] }),
}));

vi.mock("@/lib/queryHooks/portalSettings", () => ({
  usePortalSettings: () => ({ data: { verificatiePeriodeDagen: 90 } }),
}));

vi.mock("@/lib/queryHooks/sentryIssues", () => ({
  useAutomationSentryIssueOverview: () => ({ data: undefined, isLoading: false, error: null }),
}));

vi.mock("@/lib/queryHooks/notificationCenter", () => ({
  useNotificationCenter: () => ({
    model: {
      items: [],
      openItems: [],
      seenItems: [],
      archivedItems: [],
      unseenCount: 0,
    },
    isLoading: false,
    isError: false,
    markOpenNotificationsSeen: vi.fn(),
    archiveNotification: vi.fn(),
  }),
}));

const fullData: Automatisering = {
  id: "auto-1",
  naam: "Test automation",
  categorie: "HubSpot Workflow",
  doel: "Test doel",
  trigger: "Form submitted",
  systemen: [],
  stappen: [],
  afhankelijkheden: "",
  owner: "Jan",
  status: "Actief",
  verbeterideeën: "",
  mermaidDiagram: "",
  koppelingen: [],
  fasen: [],
  createdAt: "2026-01-01T00:00:00Z",
  laatstGeverifieerd: null,
  geverifieerdDoor: "",
};

const canvasAutomation: Automation = {
  id: "auto-1",
  name: "Test automation",
  team: "sales",
  tool: "HubSpot",
  goal: "Test doel",
};

describe("process navigation cleanup", () => {
  it("shows only Procesviewer in the analysis navigation", () => {
    render(
      <MemoryRouter>
        <AppLayout>
          <div />
        </AppLayout>
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: /Processes/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Procesviewer/i })).toHaveAttribute("href", "/procesviewer");
  });

  it("groups Procesreis under Automations instead of Analysis", () => {
    const { container } = render(
      <MemoryRouter>
        <AppLayout>
          <div />
        </AppLayout>
      </MemoryRouter>,
    );

    const groups = [...container.querySelectorAll("nav > div")];
    const automationsGroup = groups.find((group) =>
      group.querySelector("p")?.textContent === "Automations",
    );
    const analysisGroup = groups.find((group) =>
      group.querySelector("p")?.textContent === "Analysis",
    );

    expect(automationsGroup).toHaveTextContent("Procesreis");
    expect(analysisGroup).not.toHaveTextContent("Procesreis");
  });

  it("shows the sidebar collapse action as a full footer item below settings", () => {
    const { container } = render(
      <MemoryRouter>
        <AppLayout>
          <div />
        </AppLayout>
      </MemoryRouter>,
    );

    const settings = screen.getByRole("link", { name: /Settings/i });
    const collapse = screen.getByRole("button", { name: /Inklappen/i });

    expect(collapse).toHaveTextContent("Inklappen");
    expect(collapse.className).toContain("px-2.5");
    expect(settings.compareDocumentPosition(collapse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector("[data-testid='sidebar-user-profile']")).not.toContainElement(collapse);

    fireEvent.click(collapse);

    expect(screen.queryByText("Inklappen")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Uitklappen/i })).toBeInTheDocument();
  });

  it("points dashboard process actions to the Procesviewer", () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /Zonder koppeling/i })).toHaveAttribute("href", "/procesviewer");
    expect(screen.getByRole("link", { name: /Proces-canvas openen/i })).toHaveAttribute("href", "/procesviewer");
  });

  it("points automation canvas links to the Procesviewer", () => {
    render(
      <MemoryRouter>
        <AutomationDetailPanel
          automation={canvasAutomation}
          fullData={fullData}
          steps={[]}
          branchConnections={[]}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /View on canvas/i })).toHaveAttribute("href", "/procesviewer");
  });
});
