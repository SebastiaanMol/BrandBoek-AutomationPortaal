import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Pipeline, PipelineStage } from "@/lib/types";
import { PipelineMatrix } from "@/components/PipelineMatrix";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");

  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function makeStage(overrides: Partial<PipelineStage> = {}): PipelineStage {
  return {
    stage_id: "stage-1",
    label: "Stage",
    display_order: 0,
    metadata: {},
    ...overrides,
  };
}

function makePipeline(overrides: Partial<Pipeline> = {}): Pipeline {
  return {
    pipelineId: "pipeline-1",
    naam: "Sales pipeline",
    stages: [],
    syncedAt: "2026-05-01T08:00:00.000Z",
    updatedAt: "2026-05-02T09:00:00.000Z",
    beschrijving: null,
    isActive: true,
    source: "hubspot",
    ...overrides,
  };
}

describe("PipelineMatrix", () => {
  it("renders pipeline rows with source, status, stage counts, and stage previews", () => {
    const pipelines: Pipeline[] = [
      makePipeline({
        pipelineId: "sales",
        naam: "Sales pipeline",
        source: "hubspot",
        isActive: true,
        stages: [
          makeStage({ stage_id: "qualified", label: "Qualified", display_order: 20 }),
          makeStage({ stage_id: "new", label: "Nieuw", display_order: 10 }),
        ],
      }),
      makePipeline({
        pipelineId: "intern",
        naam: "Intern onboarding",
        source: "custom",
        isActive: false,
        stages: [],
        updatedAt: "2026-05-06T13:00:00.000Z",
      }),
    ];

    render(<PipelineMatrix pipelines={pipelines} />);

    expect(screen.getByText("Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Bron")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Stages")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Laatste update")).toBeInTheDocument();

    const salesRow = screen.getByRole("button", { name: "Open Sales pipeline" });
    expect(within(salesRow).getByText("HubSpot")).toBeInTheDocument();
    expect(within(salesRow).getByText("Actief")).toBeInTheDocument();
    expect(within(salesRow).getByText("2 stages")).toBeInTheDocument();
    expect(within(salesRow).getByLabelText("Stage-preview voor Sales pipeline")).toHaveTextContent("Nieuw");
    expect(within(salesRow).getByLabelText("Stage-preview voor Sales pipeline")).toHaveTextContent("Qualified");
    expect(within(salesRow).getByText("Gesynchroniseerd")).toBeInTheDocument();

    const onboardingRow = screen.getByRole("button", { name: "Open Intern onboarding" });
    expect(within(onboardingRow).getByText("Intern proces")).toBeInTheDocument();
    expect(within(onboardingRow).getByText("Inactief")).toBeInTheDocument();
    expect(within(onboardingRow).getByText("0 stages")).toBeInTheDocument();
    expect(within(onboardingRow).getByLabelText("Stage-preview voor Intern onboarding")).toHaveTextContent("Geen stages");
    expect(within(onboardingRow).getByText("Laatst bijgewerkt")).toBeInTheDocument();
  });

  it("navigates to the pipeline detail page when a row is clicked", () => {
    render(<PipelineMatrix pipelines={[makePipeline({ pipelineId: "sales-123", naam: "Sales pipeline" })]} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Sales pipeline" }));

    expect(navigateMock).toHaveBeenCalledWith("/pipelines/sales-123");
  });
});
