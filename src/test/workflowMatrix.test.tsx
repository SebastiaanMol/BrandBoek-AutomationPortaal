import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WorkflowMatrix from "@/pages/WorkflowMatrix";

vi.mock("@/lib/queryHooks/pipelines", () => ({
  usePipelines: () => ({
    data: [
      {
        pipelineId: "pipeline-sales",
        naam: "Sales Pipeline",
        source: "hubspot",
        isActive: true,
        syncedAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        beschrijving: null,
        stages: [
          { stage_id: "stage-offerte", label: "Offerte verstuurd", display_order: 2, metadata: {} },
          { stage_id: "stage-afspraak", label: "Afspraak gemaakt", display_order: 1, metadata: {} },
          { stage_id: "stage-geen-trigger", label: "Geen trigger fase", display_order: 3, metadata: {} },
        ],
      },
    ],
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("@/lib/queryHooks/automations", () => ({
  useAutomatiseringen: () => ({
    data: [
      {
        id: "auto-active",
        naam: "Afspraak reminder workflow",
        status: "Actief",
        doel: "Herinner sales aan open afspraken.",
        trigger: "Dealstage is Afspraak gemaakt",
        systemen: ["HubSpot"],
        stappen: ["Controleer dealstage", "Stuur interne reminder"],
        pipeline_id: "pipeline-sales",
        stage_id: "stage-afspraak",
        external_id: "12345",
        hubspotLastRunAt: "2026-06-20T00:00:00.000Z",
        hubspotRunCount365d: 5,
        importProposal: {
          source: "hubspot",
          workflowId: "12345",
        },
      },
      {
        id: "auto-inactive",
        naam: "Offerte chase oud",
        status: "Uitgeschakeld",
        trigger: "Dealstage is Offerte verstuurd",
        systemen: ["HubSpot"],
        pipeline_id: "pipeline-sales",
        stage_id: "stage-offerte",
        hubspotLastRunAt: "2025-01-01T00:00:00.000Z",
        hubspotRunCount365d: 0,
      },
      {
        id: "auto-multi-stage",
        naam: "Multi-stage workflow",
        status: "Actief",
        trigger: "Dealstage is Afspraak gemaakt of Offerte verstuurd",
        systemen: ["HubSpot"],
        pipeline_id: "pipeline-sales",
        stage_id: "stage-afspraak, stage-offerte",
        hubspotLastRunAt: "2026-06-20T00:00:00.000Z",
        hubspotRunCount365d: 12,
      },
      {
        id: "auto-numeric-stage",
        naam: "Offertefase workflow",
        status: "Actief",
        trigger: "HubSpot stage ID 235354027",
        systemen: ["HubSpot"],
        pipeline_id: "pipeline-sales",
        stage_id: "235354027",
        hubspotLastRunAt: "2025-06-01T00:00:00.000Z",
        hubspotRunCount365d: 1,
      },
      {
        id: "auto-other-stage",
        naam: "Niet gekoppeld aan sales",
        status: "Actief",
        trigger: "Andere pipeline",
        systemen: ["HubSpot"],
        pipeline_id: "pipeline-other",
        stage_id: "stage-afspraak",
        hubspotLastRunAt: "2026-06-20T00:00:00.000Z",
        hubspotRunCount365d: 4,
      },
    ],
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

describe("WorkflowMatrix", () => {
  it("groups workflows by stage and marks stages without workflows", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    render(<WorkflowMatrix />);

    const pipeline = screen.getByRole("section", { name: "Sales Pipeline" });
    const stageCards = within(pipeline).getAllByTestId("workflow-stage-card");

    expect(stageCards.map((card) => within(card).getByTestId("stage-title").textContent)).toEqual([
      "Afspraak gemaakt",
      "Offerte verstuurd",
      "Geen trigger fase",
    ]);
    expect(screen.getByText("gekoppeld").previousElementSibling).toHaveTextContent("4");
    expect(screen.getByText("Beheeranalyse")).toBeInTheDocument();
    expect(screen.getByText("Totaal workflows")).toBeInTheDocument();
    expect(screen.getByText("Ongekoppeld")).toBeInTheDocument();
    expect(screen.getByText("Risicosignalen")).toBeInTheDocument();
    expect(screen.getByText("Offertefase workflow")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF exporteren" })).toBeInTheDocument();

    expect(within(stageCards[0]).getByText("Afspraak reminder workflow")).toBeInTheDocument();
    expect(within(stageCards[0]).getByText("Multi-stage workflow")).toBeInTheDocument();
    expect(within(stageCards[0]).getAllByText("Actief")).toHaveLength(2);
    expect(within(stageCards[0]).queryByText("Niet gekoppeld aan sales")).not.toBeInTheDocument();

    expect(within(stageCards[1]).getByText("Offerte chase oud")).toBeInTheDocument();
    expect(within(stageCards[1]).getByText("Multi-stage workflow")).toBeInTheDocument();
    expect(within(stageCards[1]).getByText("Offertefase workflow")).toBeInTheDocument();
    expect(within(stageCards[1]).getByText("Inactief")).toBeInTheDocument();

    expect(within(stageCards[2]).getByText("Geen actieve triggers")).toBeInTheDocument();

    expect(consoleSpy).toHaveBeenCalledWith("Matching stats:", { totalAutos: 5, mapped: 2 });
    consoleSpy.mockRestore();
  });

  it("filters the matrix by status, process gaps and noise", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    render(<WorkflowMatrix />);

    fireEvent.click(screen.getByRole("button", { name: "Alleen inactief" }));
    expect(screen.queryByText("Afspraak reminder workflow")).not.toBeInTheDocument();
    expect(screen.getByText("Offerte chase oud")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Procesgaten" }));
    expect(screen.getAllByTestId("workflow-stage-card")).toHaveLength(1);
    expect(screen.getByText("Geen trigger fase")).toBeInTheDocument();
    expect(screen.getByText("Geen actieve triggers")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ruis" }));
    expect(screen.queryByText("Afspraak reminder workflow")).not.toBeInTheDocument();
    expect(screen.getByText("Offerte chase oud")).toBeInTheDocument();
    expect(screen.getByText("Offertefase workflow")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Alles tonen" }));
    expect(screen.getByText("Afspraak reminder workflow")).toBeInTheDocument();
    expect(screen.getAllByTestId("workflow-stage-card")).toHaveLength(3);

    consoleSpy.mockRestore();
  });

  it("opens a workflow preview panel from a workflow card", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    render(<WorkflowMatrix />);

    fireEvent.click(screen.getByRole("button", { name: /Afspraak reminder workflow/i }));

    const panel = screen.getByRole("dialog", { name: "Workflow preview" });
    expect(within(panel).getByText("Afspraak reminder workflow")).toBeInTheDocument();
    expect(within(panel).getByText("Actief")).toBeInTheDocument();
    expect(within(panel).getByText("12345")).toBeInTheDocument();
    expect(within(panel).getByText("Herinner sales aan open afspraken.")).toBeInTheDocument();
    expect(within(panel).getByText("Dealstage is Afspraak gemaakt")).toBeInTheDocument();
    expect(within(panel).getByText("Controleer dealstage")).toBeInTheDocument();
    expect(within(panel).getByText("Stuur interne reminder")).toBeInTheDocument();
    expect(within(panel).getByText("5")).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Preview sluiten" }));
    expect(screen.queryByRole("dialog", { name: "Workflow preview" })).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
