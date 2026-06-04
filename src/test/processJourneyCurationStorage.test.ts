import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  flowInserts: [] as unknown[],
  flowUpdates: [] as unknown[],
  suggestionUpdates: [] as unknown[],
  linkUpserts: [] as unknown[],
  linkResponses: [] as Array<{ error: unknown | null }>,
  insertedFlow: {
    id: "flow-new",
    naam: "Nieuwe procesreis",
    beschrijving: "Beschrijving",
    systemen: ["HubSpot", "GitLab"],
    automation_ids: ["hs", "gl"],
    created_at: "2026-05-29T00:00:00.000Z",
    updated_at: "2026-05-29T00:00:00.000Z",
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      if (table === "flows") {
        return {
          insert(payload: unknown) {
            mocks.flowInserts.push(payload);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: mocks.insertedFlow, error: null }),
              }),
            };
          },
          update(payload: unknown) {
            mocks.flowUpdates.push(payload);
            return makeQuery({ error: null });
          },
        };
      }

      if (table === "automation_links") {
        return {
          upsert(payload: unknown) {
            mocks.linkUpserts.push(payload);
            return Promise.resolve(mocks.linkResponses.shift() ?? { error: null });
          },
        };
      }

      if (table === "automatisering_ai_flows") {
        return {
          update(payload: unknown) {
            mocks.suggestionUpdates.push(payload);
            return makeQuery({ error: null });
          },
        };
      }

      return {};
    },
  },
}));

function makeQuery(result: unknown) {
  const query = {
    eq: () => query,
    gte: () => query,
    ilike: () => query,
    is: () => query,
    then: (resolve: (value: unknown) => void) => Promise.resolve(resolve(result)),
  };
  return query;
}

describe("process journey curation storage", () => {
  beforeEach(() => {
    mocks.flowInserts = [];
    mocks.flowUpdates = [];
    mocks.suggestionUpdates = [];
    mocks.linkUpserts = [];
    mocks.linkResponses = [];
  });

  it("creates one approved flow from a concept journey and confirms only its webhook transitions", async () => {
    const { saveCuratedProcessJourney } = await import("@/lib/storage/processJourneyCuration");

    const result = await saveCuratedProcessJourney({
      kind: "concept",
      title: "Nieuwe procesreis",
      description: "Beschrijving",
      automationIds: ["hs", "gl"],
      systemen: ["HubSpot", "GitLab"],
      transitions: [{ fromId: "hs", toId: "gl" }],
    });

    expect(result).toEqual({ flowId: "flow-new", mode: "created" });
    expect(mocks.flowInserts).toEqual([
      {
        naam: "Nieuwe procesreis",
        beschrijving: "Beschrijving",
        systemen: ["HubSpot", "GitLab"],
        automation_ids: ["hs", "gl"],
      },
    ]);
    expect(mocks.suggestionUpdates).toEqual([
      { confirmed: true, rejected: false },
      { flow_id: "flow-new", confirmed: true, rejected: false },
    ]);
    expect(mocks.linkUpserts).toEqual([
      [
        {
          source_id: "hs",
          target_id: "gl",
          match_type: "webhook",
          confirmed: true,
        },
      ],
    ]);
  });

  it("updates an already approved flow without creating new links", async () => {
    const { saveCuratedProcessJourney } = await import("@/lib/storage/processJourneyCuration");

    const result = await saveCuratedProcessJourney({
      kind: "flow",
      flowId: "flow-existing",
      title: "Nieuwe titel",
      description: "Nieuwe beschrijving",
      automationIds: ["a", "b"],
      systemen: ["HubSpot"],
      transitions: [{ fromId: "a", toId: "b" }],
    });

    expect(result).toEqual({ flowId: "flow-existing", mode: "updated" });
    expect(mocks.flowInserts).toEqual([]);
    expect(mocks.linkUpserts).toEqual([]);
    expect(mocks.suggestionUpdates).toEqual([]);
    expect(mocks.flowUpdates[0]).toMatchObject({
      naam: "Nieuwe titel",
      beschrijving: "Nieuwe beschrijving",
      systemen: ["HubSpot"],
      automation_ids: ["a", "b"],
    });
  });
});
