import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Flows from "@/pages/Flows";
import type { Automatisering, Flow } from "@/lib/types";

const { automations, flows } = vi.hoisted(() => {
  const baseAutomation = (overrides: Partial<Automatisering>): Automatisering => ({
    id: "automation",
    naam: "Automation",
    categorie: "HubSpot Workflow",
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
    createdAt: "2026-05-28T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  });

  const automations = [
    baseAutomation({
      id: "start-hubspot",
      naam: "Start HubSpot workflow",
      source: "hubspot",
      systemen: ["HubSpot"],
      webhookPaths: ["/first-hop"],
    }),
    baseAutomation({
      id: "backend-step-one",
      naam: "Backend step one",
      categorie: "Backend Script",
      source: "gitlab",
      systemen: ["GitLab"],
      endpoints: ["/first-hop"],
      webhookPaths: ["/second-hop"],
    }),
    baseAutomation({
      id: "backend-step-two",
      naam: "Backend step two",
      categorie: "Backend Script",
      source: "gitlab",
      systemen: ["GitLab"],
      endpoints: ["/second-hop"],
    }),
  ] satisfies Automatisering[];

  const flows = [
    {
      id: "recursive-flow",
      naam: "Recursive trace overview",
      beschrijving: "Stored with only the starting automation.",
      systemen: ["HubSpot"],
      automationIds: ["start-hubspot"],
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
    },
  ] satisfies Flow[];

  return { automations, flows };
});

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringen: () => ({ data: automations }),
  useAutomatiseringenIncludingLegacyGitlab: () => ({ data: automations }),
  useFlows: () => ({ data: flows }),
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

describe("Flows overview trace count", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("shows the recursive webhook-trace automation count instead of the stored seed count", () => {
    render(
      <MemoryRouter>
        <Flows />
      </MemoryRouter>,
    );

    const row = screen.getByRole("link", { name: /Recursive trace overview/i });

    expect(within(row).getByText("3")).toBeInTheDocument();
    expect(within(row).getByText("HubSpot / GitLab")).toBeInTheDocument();
  });

  it("renders the process journey overview in the compact list layout", () => {
    render(
      <MemoryRouter>
        <Flows />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Procesreizen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tijdlijn/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lijst/i })).toBeInTheDocument();
    expect(screen.getByText("1 procesreis")).toBeInTheDocument();
    expect(screen.getByText("3 automations")).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Procesreizen overzicht" });
    expect(within(table).getByText("Recursive trace overview")).toBeInTheDocument();
    expect(within(table).getByText("Actief")).toBeInTheDocument();

    const sidebar = screen.getByRole("complementary", { name: "Procesreis issues en bronnen" });
    expect(within(sidebar).getByText("Geen actieve issues.")).toBeInTheDocument();
    expect(within(sidebar).getByText("HubSpot")).toBeInTheDocument();
    expect(within(sidebar).getByText("GitLab")).toBeInTheDocument();
  });

  it("restores the remembered process journey tab", async () => {
    sessionStorage.setItem("automationNavigator.navigation.flows", JSON.stringify({
      pathname: "/flows",
      search: "",
      hash: "",
      scrollY: 0,
      updatedAt: Date.now(),
      data: { activeTab: "bronkwaliteit" },
    }));

    render(
      <MemoryRouter>
        <Flows />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Bronkwaliteit voor procesreizen" })).toBeInTheDocument();
  });

  it("remembers the active process journey tab before opening a detail page", () => {
    Object.defineProperty(window, "scrollY", { value: 222, configurable: true });

    render(
      <MemoryRouter>
        <Flows />
      </MemoryRouter>,
    );

    const row = screen.getByRole("link", { name: /Recursive trace overview/i });
    row.click();

    const stored = JSON.parse(sessionStorage.getItem("automationNavigator.navigation.flows") ?? "{}");

    expect(stored.pathname).toBe("/");
    expect(stored.scrollY).toBe(222);
    expect(stored.data).toMatchObject({ activeTab: "procesreizen" });
  });
});
