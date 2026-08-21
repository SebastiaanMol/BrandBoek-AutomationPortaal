import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchPendingSyncReviewItems } from "@/lib/storage/edgeFunctions";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const row = {
  id: "change-1",
  sync_run_id: "sync-1",
  source: "hubspot",
  external_id: "ext-1",
  automation_id: null,
  change_type: "new_automation",
  status: "pending",
  title: "Nieuwe automation",
  summary: "Nieuw gevonden",
  impact: "Wordt direct toegevoegd",
  old_value_sanitized: null,
  new_value_sanitized: {},
  payload_sanitized: {},
  selected_by_default: true,
};

function createQuery(count = 123) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(async () => ({ data: [row], error: null, count })),
  };
  return query;
}

describe("fetchPendingSyncReviewItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests pending review items with server-side pagination, filters, and exact count", async () => {
    const query = createQuery();
    vi.mocked(supabase.from).mockReturnValue(query);

    const result = await fetchPendingSyncReviewItems({
      page: 2,
      pageSize: 50,
      source: "hubspot",
      type: "warnings",
      selected: "selected",
      search: "deal",
    });

    expect(supabase.from).toHaveBeenCalledWith("source_sync_change_items");
    expect(query.select).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
    expect(query.in).toHaveBeenCalledWith("status", ["pending", "failed"]);
    expect(query.eq).toHaveBeenCalledWith("source", "hubspot");
    expect(query.in).toHaveBeenCalledWith("change_type", [
      "source_data_incomplete",
      "source_missing",
      "legacy_gitlab_record",
    ]);
    expect(query.eq).toHaveBeenCalledWith("selected_by_default", true);
    expect(query.or).toHaveBeenCalledWith("title.ilike.%deal%,external_id.ilike.%deal%");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(query.range).toHaveBeenCalledWith(50, 99);
    expect(result.total).toBe(123);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(50);
    expect(result.pageCount).toBe(3);
    expect(result.from).toBe(51);
    expect(result.to).toBe(100);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].externalId).toBe("ext-1");
  });

  it("maps failed review items so the Imports page can show retryable errors", async () => {
    const query = createQuery(1);
    query.range = vi.fn(async () => ({
      data: [{
        ...row,
        status: "failed",
        error_message_sanitized: "Nieuwe automation uit sync-review aanmaken: duplicate key",
      }],
      error: null,
      count: 1,
    }));
    vi.mocked(supabase.from).mockReturnValue(query);

    const result = await fetchPendingSyncReviewItems({ page: 1, pageSize: 50 });

    expect(result.items[0]).toMatchObject({
      status: "failed",
      errorMessage: "Nieuwe automation uit sync-review aanmaken: duplicate key",
    });
  });

  it("falls back to returned item count when Supabase count is missing", async () => {
    const query = createQuery(null as unknown as number);
    vi.mocked(supabase.from).mockReturnValue(query);

    const result = await fetchPendingSyncReviewItems({ page: 1, pageSize: 50 });

    expect(result.total).toBe(1);
    expect(result.from).toBe(1);
    expect(result.to).toBe(1);
  });
});
