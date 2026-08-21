import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAllProcessStates, saveProcessState, updateProcessManualStatus } from "@/lib/storage/processState";

const upsertMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: selectMock,
      upsert: upsertMock,
      update: vi.fn(() => ({
        eq: eqMock,
      })),
    })),
  },
}));

describe("process state storage", () => {
  beforeEach(() => {
    upsertMock.mockReset();
    selectMock.mockReset();
    eqMock.mockReset();
  });

  it("does not silently save without artifacts when the artifacts column is missing", async () => {
    const missingArtifactsError = {
      code: "PGRST204",
      message: "Could not find the 'artifacts' column of 'process_state'",
    };
    upsertMock
      .mockResolvedValueOnce({ error: missingArtifactsError })
      .mockResolvedValueOnce({ error: null });

    await expect(saveProcessState("pipe-1", {
      steps: [],
      connections: [],
      autoLinks: {},
      parkedSteps: [],
      artifacts: [
        {
          id: "artifact-manual",
          type: "manualExceptionBlock",
          title: "Manual",
          position: { x: 10, y: 20 },
        },
      ],
    })).rejects.toBe(missingArtifactsError);

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0]).toEqual(expect.objectContaining({
      artifacts: expect.any(Array),
    }));
  });

  it("fetches all process states keyed by pipeline id with updatedAt metadata", async () => {
    selectMock.mockResolvedValueOnce({
      data: [
        {
          id: "pipe-1",
          steps: [{ id: "stage-1" }],
          connections: [],
          auto_links: { auto1: { fromStepId: "stage-1", toStepId: "stage-2" } },
          parked_steps: [],
          active_lanes: ["sales"],
          custom_lanes: [],
          flow_links: {},
          attachments: [],
          artifacts: [],
          manual_status: "in_review",
          updated_at: "2026-06-24T09:00:00.000Z",
        },
        {
          id: "pipe-2",
          steps: [],
          connections: [],
          auto_links: {},
          parked_steps: [],
          active_lanes: [],
          custom_lanes: [],
          flow_links: {},
          attachments: [],
          artifacts: [],
          manual_status: null,
          updated_at: null,
        },
      ],
      error: null,
    });

    const result = await fetchAllProcessStates();

    expect(selectMock).toHaveBeenCalledWith(expect.stringContaining("updated_at"));
    expect(result["pipe-1"]).toEqual(expect.objectContaining({
      steps: [{ id: "stage-1" }],
      autoLinks: { auto1: { fromStepId: "stage-1", toStepId: "stage-2" } },
      updatedAt: "2026-06-24T09:00:00.000Z",
      manualStatus: "in_review",
    }));
    expect(result["pipe-2"]).toEqual(expect.objectContaining({
      manualStatus: "niet_ingericht",
    }));
  });

  it("stores a manual process status without requiring a full process model", async () => {
    upsertMock.mockResolvedValueOnce({ error: null });

    await updateProcessManualStatus("pipe-1", "procesflow_gereed");

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "pipe-1",
        manual_status: "procesflow_gereed",
        updated_at: expect.any(String),
      }),
      { onConflict: "id" },
    );
    expect(upsertMock.mock.calls[0][0]).not.toHaveProperty("steps");
    expect(upsertMock.mock.calls[0][0]).not.toHaveProperty("connections");
    expect(upsertMock.mock.calls[0][0]).not.toHaveProperty("auto_links");
  });
});
