import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWorkflowMatrixAnalysis } from "@/lib/workflowMatrixAnalysis";
import { exportWorkflowMatrixAnalysisPdf } from "@/lib/workflowMatrixPdfExport";
import type { Automatisering, Pipeline } from "@/lib/types";

const textMock = vi.fn();
const saveMock = vi.fn();
const setFontSizeMock = vi.fn();
const setFontMock = vi.fn();

vi.mock("jspdf", () => ({
  jsPDF: vi.fn(function MockJsPdf() {
    return {
      text: textMock,
      save: saveMock,
      setFontSize: setFontSizeMock,
      setFont: setFontMock,
    };
  }),
}));

function pipeline(): Pipeline {
  return {
    pipelineId: "pipeline-sales",
    naam: "Sales Pipeline",
    source: "hubspot",
    isActive: true,
    syncedAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    beschrijving: null,
    stages: [
      { stage_id: "stage-afspraak", label: "Afspraak gemaakt", display_order: 0, metadata: {} },
      { stage_id: "stage-offerte", label: "Offerte verstuurd", display_order: 1, metadata: {} },
    ],
  };
}

function automation(overrides: Partial<Automatisering> & Record<string, unknown>): Automatisering {
  return {
    id: String(overrides.id ?? "auto-1"),
    naam: String(overrides.naam ?? "Workflow"),
    categorie: "HubSpot Workflow",
    doel: "",
    trigger: "",
    systemen: ["HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  } as Automatisering;
}

describe("exportWorkflowMatrixAnalysisPdf", () => {
  beforeEach(() => {
    textMock.mockClear();
    saveMock.mockClear();
    setFontSizeMock.mockClear();
    setFontMock.mockClear();
  });

  it("writes title, KPIs, risks and saves with date-stamped filename", () => {
    const analysis = buildWorkflowMatrixAnalysis({
      pipelines: [pipeline()],
      automations: [
        automation({ id: "active", naam: "Actieve workflow", stage_id: "stage-afspraak" }),
        automation({ id: "disabled", naam: "Uitgeschakelde workflow", status: "Uitgeschakeld", stage_id: "stage-offerte" }),
      ],
    });

    exportWorkflowMatrixAnalysisPdf(analysis, new Date("2026-07-01T12:00:00.000Z"));

    const writtenText = textMock.mock.calls.map((call) => String(call[0])).join("\n");
    expect(writtenText).toContain("WorkflowMatrix beheeranalyse");
    expect(writtenText).toContain("Totaal workflows: 2");
    expect(writtenText).toContain("Actieve pipeline met inactieve workflows");
    expect(writtenText).toContain("Uitgeschakelde workflow");
    expect(writtenText).toContain("Sales Pipeline");
    expect(saveMock).toHaveBeenCalledWith("workflow-matrix-analyse-2026-07-01.pdf");
  });
});
