import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tableCalls: [] as string[],
  inserts: [] as unknown[],
  updates: [] as unknown[],
  selectedRows: [
    {
      id: "item-1",
      concept_journey_id: "journey-1",
      flow_id: null,
      automation_id: "auto-1",
      from_automation_id: "auto-1",
      to_automation_id: "auto-2",
      normalized_path: "/hooks/demo",
      item_type: "wrong_edge",
      status: "open",
      note: "Deze edge klopt niet",
      proposed_action: "Controleer endpoint",
      created_at: "2026-05-29T00:00:00.000Z",
      updated_at: "2026-05-29T00:00:00.000Z",
      resolved_at: null,
    },
  ],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      mocks.tableCalls.push(table);
      return {
        select() {
          return makeQuery({ data: mocks.selectedRows, error: null });
        },
        insert(payload: unknown) {
          mocks.inserts.push(payload);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: mocks.selectedRows[0], error: null }),
            }),
          };
        },
        update(payload: unknown) {
          mocks.updates.push(payload);
          return makeQuery({ error: null });
        },
      };
    },
  },
}));

function makeQuery(result: unknown) {
  const query = {
    eq: () => query,
    or: () => query,
    order: () => query,
    then: (resolve: (value: unknown) => void) => Promise.resolve(resolve(result)),
  };
  return query;
}

describe("process journey review item storage", () => {
  beforeEach(() => {
    mocks.tableCalls = [];
    mocks.inserts = [];
    mocks.updates = [];
  });

  it("fetches review items by concept journey and maps database rows", async () => {
    const { fetchProcessJourneyReviewItems } = await import("@/lib/storage/processJourneyReviewItems");

    const items = await fetchProcessJourneyReviewItems({ conceptJourneyId: "journey-1" });

    expect(mocks.tableCalls).toContain("process_journey_review_items");
    expect(items[0]).toMatchObject({
      id: "item-1",
      conceptJourneyId: "journey-1",
      automationId: "auto-1",
      fromAutomationId: "auto-1",
      toAutomationId: "auto-2",
      normalizedPath: "/hooks/demo",
      itemType: "wrong_edge",
      status: "open",
      note: "Deze edge klopt niet",
      proposedAction: "Controleer endpoint",
    });
  });

  it("creates compact technical review items without changing flow suggestions", async () => {
    const { createProcessJourneyReviewItem } = await import("@/lib/storage/processJourneyReviewItems");

    await createProcessJourneyReviewItem({
      conceptJourneyId: "journey-1",
      automationId: "auto-1",
      fromAutomationId: "auto-1",
      toAutomationId: "auto-2",
      normalizedPath: "/hooks/demo",
      itemType: "wrong_edge",
      note: "Deze edge klopt niet",
      proposedAction: "Controleer endpoint",
    });

    expect(mocks.inserts).toEqual([
      {
        concept_journey_id: "journey-1",
        flow_id: null,
        automation_id: "auto-1",
        from_automation_id: "auto-1",
        to_automation_id: "auto-2",
        normalized_path: "/hooks/demo",
        item_type: "wrong_edge",
        status: "open",
        note: "Deze edge klopt niet",
        proposed_action: "Controleer endpoint",
      },
    ]);
    expect(mocks.tableCalls).not.toContain("automatisering_ai_flows");
    expect(mocks.tableCalls).not.toContain("flows");
  });

  it("resolves and reopens a review item", async () => {
    const { updateProcessJourneyReviewItemStatus } = await import("@/lib/storage/processJourneyReviewItems");

    await updateProcessJourneyReviewItemStatus("item-1", "resolved");
    await updateProcessJourneyReviewItemStatus("item-1", "open");

    expect(mocks.updates[0]).toMatchObject({ status: "resolved" });
    expect(mocks.updates[0]).toHaveProperty("resolved_at");
    expect(mocks.updates[1]).toEqual({ status: "open", resolved_at: null });
  });
});
