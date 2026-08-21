import { describe, expect, it } from "vitest";
import { extractPipelineStage } from "../../supabase/functions/_shared/hubspot-workflow-stage";

describe("HubSpot workflow pipeline/stage extraction", () => {
  it("extracts pipeline and stage IDs from enrollment criteria filters", () => {
    const result = extractPipelineStage({
      enrollmentCriteria: {
        listFilterBranch: {
          filters: [
            { property: "pipeline", value: "pipeline-sales" },
            { propertyName: "dealstage", value: "stage-offerte" },
          ],
        },
      },
    });

    expect(result).toEqual({
      pipelineId: "pipeline-sales",
      stageId: "stage-offerte",
    });
  });

  it("extracts HubSpot pipeline and stage aliases from trigger sets", () => {
    const result = extractPipelineStage({
      triggerSets: [
        {
          filters: [
            { propertyName: "hs_pipeline", value: "pipeline-ib" },
            { property: "hs_pipeline_stage", value: "stage-ib-open" },
          ],
        },
      ],
    });

    expect(result).toEqual({
      pipelineId: "pipeline-ib",
      stageId: "stage-ib-open",
    });
  });

  it("walks nested list filter branches", () => {
    const result = extractPipelineStage({
      enrollmentCriteria: {
        listFilterBranch: {
          filterBranches: [
            {
              filters: [{ propertyName: "dealstage", value: "stage-nested" }],
            },
          ],
        },
      },
    });

    expect(result).toEqual({
      pipelineId: null,
      stageId: "stage-nested",
    });
  });
});
