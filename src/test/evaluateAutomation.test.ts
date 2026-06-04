import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

describe("evaluateAutomation", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("invokes the evaluate-automation edge function through the shared Supabase client", async () => {
    invokeMock.mockResolvedValue({
      data: {
        automation_id: "auto-1",
        automation_name: "Automation",
        toStepId: "step-2",
        branchId: "branch-1",
        branchLabel: "Matched",
        reason: "condition_match",
        evaluated_at: "2026-06-03T00:00:00.000Z",
      },
      error: null,
    });

    const { evaluateAutomation } = await import("@/lib/evaluateAutomation");

    const result = await evaluateAutomation("auto-1", { deal: { status: "won" } });

    expect(invokeMock).toHaveBeenCalledWith("evaluate-automation", {
      body: { automation_id: "auto-1", payload: { deal: { status: "won" } } },
    });
    expect(result.toStepId).toBe("step-2");
  });
});
