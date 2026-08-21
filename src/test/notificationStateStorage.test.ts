import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  upserts: [] as unknown[],
  updates: [] as unknown[],
  tableNames: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      mocks.tableNames.push(table);
      if (table !== "notification_states") return {};

      return {
        select() {
          return makeQuery({ data: mocks.rows, error: null });
        },
        upsert(payload: unknown) {
          mocks.upserts.push(payload);
          return Promise.resolve({ error: null });
        },
        update(payload: unknown) {
          mocks.updates.push(payload);
          return makeQuery({ data: null, error: null });
        },
      };
    },
  },
}));

function makeQuery(result: unknown) {
  const query = {
    eq: () => query,
    in: () => query,
    then: (resolve: (value: unknown) => void) => Promise.resolve(resolve(result)),
  };
  return query;
}

describe("notification state storage", () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.upserts = [];
    mocks.updates = [];
    mocks.tableNames = [];
  });

  it("fetches notification states for the current user", async () => {
    mocks.rows = [
      {
        notification_key: "sentry_linked_error:auto-1:issue-1",
        seen_at: "2026-06-20T10:00:00.000Z",
        archived_at: null,
      },
    ];

    const { fetchNotificationStates } = await import("@/lib/storage/notificationStates");

    await expect(fetchNotificationStates("user-1")).resolves.toEqual([
      {
        notificationKey: "sentry_linked_error:auto-1:issue-1",
        seenAt: "2026-06-20T10:00:00.000Z",
        archivedAt: null,
      },
    ]);
    expect(mocks.tableNames).toContain("notification_states");
  });

  it("upserts seen state for multiple notifications", async () => {
    const { markNotificationsSeen } = await import("@/lib/storage/notificationStates");

    await markNotificationsSeen("user-1", ["key-1", "key-2"], "2026-06-22T10:00:00.000Z");

    expect(mocks.upserts[0]).toEqual([
      {
        user_id: "user-1",
        notification_key: "key-1",
        seen_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T10:00:00.000Z",
      },
      {
        user_id: "user-1",
        notification_key: "key-2",
        seen_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T10:00:00.000Z",
      },
    ]);
  });

  it("archives one notification for the current user", async () => {
    const { archiveNotification } = await import("@/lib/storage/notificationStates");

    await archiveNotification("user-1", "key-1", "2026-06-22T10:00:00.000Z");

    expect(mocks.upserts[0]).toEqual({
      user_id: "user-1",
      notification_key: "key-1",
      seen_at: "2026-06-22T10:00:00.000Z",
      archived_at: "2026-06-22T10:00:00.000Z",
      updated_at: "2026-06-22T10:00:00.000Z",
    });
  });
});
