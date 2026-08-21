import { describe, expect, it } from "vitest";
import { buildWorkflowMatrixAnalysis } from "@/lib/workflowMatrixAnalysis";
import type { Automatisering, Pipeline } from "@/lib/types";

function pipeline(overrides: Partial<Pipeline> = {}): Pipeline {
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
      { stage_id: "stage-leeg", label: "Lege fase", display_order: 2, metadata: {} },
    ],
    ...overrides,
  };
}

function automation(overrides: Partial<Automatisering> & Record<string, unknown>): Automatisering {
  return {
    id: String(overrides.id ?? "auto-1"),
    naam: String(overrides.naam ?? "Afspraak workflow"),
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

describe("buildWorkflowMatrixAnalysis", () => {
  it("normalizes direct, multi-stage, camelCase, fallback and unmatched stage links", () => {
    const inactivePipeline = pipeline({
      pipelineId: "pipeline-old",
      naam: "Oude Pipeline",
      isActive: false,
      stages: [{ stage_id: "old-stage", label: "Oude fase", display_order: 0, metadata: {} }],
    });

    const result = buildWorkflowMatrixAnalysis({
      pipelines: [pipeline(), inactivePipeline],
      automations: [
        automation({ id: "direct", naam: "Afspraak workflow", stage_id: "stage-afspraak", pipeline_id: "pipeline-sales" }),
        automation({ id: "multi", naam: "Multi workflow", stage_id: "stage-afspraak, stage-offerte", pipeline_id: "pipeline-sales" }),
        automation({ id: "camel", naam: "Camel workflow", stageId: "stage-offerte", pipelineId: "pipeline-sales", status: "Uitgeschakeld" }),
        automation({ id: "fallback", naam: "Offertefase workflow", stage_id: "235354027", pipeline_id: "pipeline-sales" }),
        automation({ id: "unmatched", naam: "Niet te plaatsen", stage_id: "999999999", pipeline_id: "pipeline-sales" }),
        automation({ id: "old-active", naam: "Oude actieve workflow", stage_id: "old-stage", pipeline_id: "pipeline-old" }),
      ],
    });

    expect(result.kpis).toMatchObject({
      totalWorkflows: 6,
      linkedWorkflows: 5,
      unlinkedWorkflows: 1,
      activeWorkflows: 5,
      disabledWorkflows: 1,
      activePipelines: 1,
      inactivePipelines: 1,
      emptyActiveStages: 1,
    });
    expect(result.workflowsByStageId.get("stage-afspraak")?.map((item) => item.id)).toEqual(["direct", "multi"]);
    expect(result.workflowsByStageId.get("stage-offerte")?.map((item) => item.id)).toEqual(["camel", "multi", "fallback"]);
    expect(result.risks.activePipelineInactiveWorkflows.map((item) => item.automation.id)).toEqual(["camel"]);
    expect(result.risks.inactivePipelineActiveWorkflows.map((item) => item.automation.id)).toEqual(["old-active"]);
    expect(result.risks.multiStageWorkflows.map((item) => item.automation.id)).toEqual(["multi"]);
    expect(result.risks.fallbackMatchedWorkflows.map((item) => item.automation.id)).toEqual(["fallback"]);
    expect(result.risks.unmatchedStageWorkflows.map((item) => item.automation.id)).toEqual(["unmatched"]);
    expect(result.pipelineSummaries.find((item) => item.pipeline.pipelineId === "pipeline-sales")).toMatchObject({
      stageCount: 3,
      activeWorkflowCount: 3,
      inactiveWorkflowCount: 1,
      emptyStageCount: 1,
      recommendedAction: "Controleer 1 lege actieve stage en 1 uitgeschakelde workflow.",
    });
  });

  it("flags HubSpot workflows without recent run data or with zero runs", () => {
    const result = buildWorkflowMatrixAnalysis({
      pipelines: [pipeline()],
      automations: [
        automation({ id: "no-run", naam: "No run", stage_id: "stage-afspraak", hubspotLastRunAt: null, hubspotRunCount365d: null }),
        automation({ id: "zero-run", naam: "Zero run", stage_id: "stage-offerte", hubspotLastRunAt: "2026-06-01T00:00:00.000Z", hubspotRunCount365d: 0 }),
      ],
    });

    expect(result.risks.missingRunDataWorkflows.map((item) => item.automation.id)).toEqual(["no-run", "zero-run"]);
  });
});
