import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { SyncReviewPanel } from "@/components/SyncReviewPanel";
import {
  PageCommandBar,
  PageHeaderAction,
  PageHeaderMetric,
  PageHeaderMetrics,
  PageHeaderShell,
} from "@/components/layout/PageHeader";
import { useApplySourceSyncReview, useGitlabSync, useHubSpotSync } from "@/lib/hooks";
import {
  fetchPendingSyncReviewItems,
  type PaginatedSyncReviewItems,
  type SyncPreviewResult,
  type SyncReviewChangeItem,
  type SyncReviewFilters,
} from "@/lib/storage/edgeFunctions";
import { formatSyncApplyToast, formatSyncPreviewImportedToast } from "@/lib/syncReviewToast";

const DEFAULT_PAGE_SIZE = 50;

const DEFAULT_FILTERS: SyncReviewFilters = {
  source: "all",
  type: "all",
  selected: "all",
  search: "",
};

const EMPTY_SYNC_REVIEW_PAGE: PaginatedSyncReviewItems = {
  items: [],
  total: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  pageCount: 1,
  from: 0,
  to: 0,
};

function hasImportSyncReviewItems(result: SyncPreviewResult): result is SyncPreviewResult & {
  syncRunId: string;
  changeItems: SyncReviewChangeItem[];
} {
  return typeof result.syncRunId === "string" && Array.isArray(result.changeItems) && result.changeItems.length > 0;
}

function isApplyableSyncSource(source: string): source is "hubspot" | "zapier" | "typeform" | "gitlab" {
  return source === "hubspot" || source === "zapier" || source === "typeform" || source === "gitlab";
}

export default function Imports(): React.ReactNode {
  const qc = useQueryClient();
  const hubspotSync = useHubSpotSync();
  const gitlabSync = useGitlabSync();
  const applySyncReview = useApplySourceSyncReview();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<SyncReviewFilters>(DEFAULT_FILTERS);

  const syncReviewQuery = useQuery({
    queryKey: ["source-sync-review-items", { page, pageSize: DEFAULT_PAGE_SIZE, ...filters }],
    queryFn: () => fetchPendingSyncReviewItems({ page, pageSize: DEFAULT_PAGE_SIZE, ...filters }),
  });

  const syncReviewPage = syncReviewQuery.data ?? {
    ...EMPTY_SYNC_REVIEW_PAGE,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  };

  function updateFilters(nextFilters: SyncReviewFilters): void {
    setFilters(nextFilters);
    setPage(1);
  }

  async function handleSync(): Promise<void> {
    try {
      const result = await hubspotSync.mutateAsync();
      if (hasImportSyncReviewItems(result)) {
        await qc.invalidateQueries({ queryKey: ["source-sync-review-items"] });
        toast.info(formatSyncPreviewImportedToast("HubSpot", result.changeItems));
        return;
      }

      toast.success(`Geen HubSpot wijzigingen om toe te passen - ${result.proposed ?? result.inserted ?? 0} nieuw voorstel`);
    } catch {
      toast.error("Synchronisatie mislukt. Controleer je HubSpot token via Instellingen.");
    }
  }

  async function handleGitlabSync(): Promise<void> {
    try {
      const result = await gitlabSync.mutateAsync();
      if (hasImportSyncReviewItems(result)) {
        await qc.invalidateQueries({ queryKey: ["source-sync-review-items"] });
        toast.info(formatSyncPreviewImportedToast("GitLab", result.changeItems));
        return;
      }

      toast.success(`Geen GitLab wijzigingen om toe te passen - ${result.proposed ?? result.inserted ?? 0} nieuw voorstel`);
    } catch {
      toast.error("GitLab synchronisatie mislukt. Controleer je token via Instellingen.");
    }
  }

  async function handleApplySyncReview(selectedChangeItemIds: string[]): Promise<void> {
    const selectedItems = syncReviewPage.items.filter((item) => selectedChangeItemIds.includes(item.id));
    if (selectedItems.length === 0) return;

    const groups = new Map<string, {
      source: "hubspot" | "zapier" | "typeform" | "gitlab";
      syncRunId: string;
      ids: string[];
    }>();

    for (const item of selectedItems) {
      if (!item.syncRunId || !isApplyableSyncSource(item.source)) continue;
      const key = `${item.source}:${item.syncRunId}`;
      const group = groups.get(key) ?? { source: item.source, syncRunId: item.syncRunId, ids: [] };
      group.ids.push(item.id);
      groups.set(key, group);
    }

    if (groups.size === 0) {
      toast.error("Geen toepasbare sync-regels geselecteerd");
      return;
    }

    try {
      const results = await Promise.all([...groups.values()].map((group) => applySyncReview.mutateAsync({
        source: group.source,
        syncRunId: group.syncRunId,
        selectedChangeItemIds: group.ids,
      })));
      const aggregated = results.reduce<Partial<SyncPreviewResult>>((acc, result) => {
        acc.inserted = (acc.inserted ?? 0) + (result.inserted ?? 0);
        acc.updated = (acc.updated ?? 0) + (result.updated ?? 0);
        acc.findings = (acc.findings ?? 0) + (result.findings ?? 0);
        acc.skipped = (acc.skipped ?? 0) + (result.skipped ?? 0);
        acc.failed = (acc.failed ?? 0) + (result.failed ?? 0);
        acc.deactivated = (acc.deactivated ?? 0) + (result.deactivated ?? 0);
        acc.applied = (acc.applied ?? 0) + (result.applied ?? 0);
        acc.failedItems = [...(acc.failedItems ?? []), ...(result.failedItems ?? [])];
        return acc;
      }, {});
      toast.success(formatSyncApplyToast(aggregated, selectedChangeItemIds.length));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["source-sync-review-items"] }),
        qc.invalidateQueries({ queryKey: ["pending"] }),
        qc.invalidateQueries({ queryKey: ["automatiseringen"] }),
      ]);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Sync toepassen mislukt");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10 lg:py-10 animate-fade-in">
        <PageHeaderShell
          icon={Upload}
          eyebrow="Imports"
          title="Imports"
          description="Controleer bronwijzigingen uit synchronisaties per pagina en pas alleen de geselecteerde regels toe."
          actions={(
            <>
              <PageHeaderAction onClick={handleSync} disabled={hubspotSync.isPending}>
                <RefreshCw className={`w-3.5 h-3.5 ${hubspotSync.isPending ? "animate-spin" : ""}`} />
                {hubspotSync.isPending ? "Bezig..." : "HubSpot synchroniseren"}
              </PageHeaderAction>
              <PageHeaderAction onClick={handleGitlabSync} disabled={gitlabSync.isPending}>
                <RefreshCw className={`w-3.5 h-3.5 ${gitlabSync.isPending ? "animate-spin" : ""}`} />
                {gitlabSync.isPending ? "Bezig..." : "GitLab synchroniseren"}
              </PageHeaderAction>
            </>
          )}
          metrics={(
            <PageHeaderMetrics>
              <PageHeaderMetric label="open bronwijzigingen" value={syncReviewPage.total} />
              <PageHeaderMetric label="deze pagina" value={syncReviewPage.items.length} />
              <PageHeaderMetric label="pagina" value={`${syncReviewPage.page}/${syncReviewPage.pageCount}`} />
            </PageHeaderMetrics>
          )}
        >
          <PageCommandBar>
            <p className="text-sm text-muted-foreground">
              Filters, selectie en paginering staan in de sync-review inbox hieronder.
            </p>
          </PageCommandBar>
        </PageHeaderShell>

        <SyncReviewPanel
          items={syncReviewPage.items}
          total={syncReviewPage.total}
          page={syncReviewPage.page}
          pageSize={syncReviewPage.pageSize}
          pageCount={syncReviewPage.pageCount}
          from={syncReviewPage.from}
          to={syncReviewPage.to}
          filters={filters}
          isLoading={syncReviewQuery.isLoading}
          isApplying={applySyncReview.isPending}
          onFiltersChange={updateFilters}
          onPageChange={(nextPage) => setPage(Math.min(Math.max(1, nextPage), syncReviewPage.pageCount))}
          onApply={(selectedChangeItemIds) => {
            void handleApplySyncReview(selectedChangeItemIds);
          }}
        />
      </div>
    </div>
  );
}
