import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsertPayloads: [] as unknown[],
  upsertResponses: [] as Array<{ error: unknown | null }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      if (table === "automation_links") {
        return {
          upsert(payload: unknown) {
            mocks.upsertPayloads.push(payload);
            return Promise.resolve(mocks.upsertResponses.shift() ?? { error: null });
          },
        };
      }

      return {
        select() {
          return makeQuery({
            data: [
              {
                from_id: "hubspot",
                to_id: "gitlab",
                confidence: 1,
                reasoning: "Webhook-match: HubSpot roept endpoint /hooks/deal aan.",
              },
            ],
            error: null,
          });
        },
        update() {
          return makeQuery({ error: null });
        },
      };
    },
  },
}));

function makeQuery(result: unknown) {
  const query = {
    in: () => query,
    is: () => query,
    eq: () => query,
    gte: () => query,
    ilike: () => query,
    then: (resolve: (value: unknown) => void) => Promise.resolve(resolve(result)),
  };
  return query;
}

describe("accepteerFlowKandidaat", () => {
  beforeEach(() => {
    mocks.upsertPayloads = [];
    mocks.upsertResponses = [];
  });

  it("falls back to legacy exact match_type when the live database has the old check constraint", async () => {
    const { accepteerFlowKandidaat } = await import("@/lib/storage/automationLinks");
    mocks.upsertResponses = [
      {
        error: {
          message: 'new row for relation "automation_links" violates check constraint "automation_links_match_type_check"',
        },
      },
      { error: null },
    ];

    await accepteerFlowKandidaat(["hubspot", "gitlab"], "flow-123");

    expect(mocks.upsertPayloads).toHaveLength(2);
    expect(mocks.upsertPayloads[0]).toEqual([
      {
        source_id: "hubspot",
        target_id: "gitlab",
        match_type: "webhook",
        confirmed: true,
      },
    ]);
    expect(mocks.upsertPayloads[1]).toEqual([
      {
        source_id: "hubspot",
        target_id: "gitlab",
        match_type: "exact",
        confirmed: true,
      },
    ]);
  });
});
