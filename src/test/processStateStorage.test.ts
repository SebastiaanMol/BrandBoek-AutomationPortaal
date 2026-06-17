import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveProcessState } from "@/lib/storage/processState";

const upsertMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: upsertMock,
    })),
  },
}));

describe("process state storage", () => {
  beforeEach(() => {
    upsertMock.mockReset();
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
});
