import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Layers2, Plus, RefreshCw, Search } from "lucide-react";
import { useCreateCustomPipeline, useHubSpotPipelinesSync, usePipelines } from "@/lib/queryHooks/pipelines";
import { CustomPipelineDialog } from "@/components/CustomPipelineDialog";
import { PipelineMatrix } from "@/components/PipelineMatrix";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  PageCommandBar,
  PageHeaderAction,
  PageHeaderMetric,
  PageHeaderMetrics,
  PageHeaderShell,
} from "@/components/layout/PageHeader";
import type { CustomPipelineInput } from "@/lib/storage/pipelines";
import { filterPipelinesForOverview, type PipelineFilter } from "@/lib/pipelineOverview";
import {
  readNavigationMemory,
  readNavigationMemoryData,
  rememberCurrentRoute,
  restoreNavigationScroll,
} from "@/lib/navigationMemory";

interface PipelineNavigationMemory {
  filter?: PipelineFilter;
  search?: string;
  focusPipelineId?: string;
}

export default function Pipelines(): ReactNode {
  const { data: pipelines = [], isLoading } = usePipelines();
  const syncMutation = useHubSpotPipelinesSync();
  const createCustomMutation = useCreateCustomPipeline();
  const rememberedPipelineNavigation = useMemo(
    () => readNavigationMemoryData<PipelineNavigationMemory>("pipelines"),
    [],
  );
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [filter, setFilter] = useState<PipelineFilter>(
    isPipelineFilter(rememberedPipelineNavigation?.filter) ? rememberedPipelineNavigation.filter : "all",
  );
  const [search, setSearch] = useState(
    typeof rememberedPipelineNavigation?.search === "string" ? rememberedPipelineNavigation.search : "",
  );
  const restoredScrollRef = useRef(false);

  const totalStages = pipelines.reduce((sum, p) => sum + p.stages.length, 0);
  const hubspotPipelines = pipelines.filter(p => p.source === "hubspot");
  const customPipelines = pipelines.filter(p => p.source === "custom");
  const activePipelineCount = pipelines.filter(p => p.isActive).length;
  const filteredPipelines = useMemo(
    () => filterPipelinesForOverview(pipelines, filter, search),
    [pipelines, filter, search],
  );

  async function handleSync(): Promise<void> {
    try {
      const result = await syncMutation.mutateAsync();
      toast.success(`${result.upserted} pipeline(s) gesynchroniseerd`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync mislukt");
    }
  }

  async function handleCreateCustomPipeline(input: CustomPipelineInput): Promise<void> {
    try {
      await createCustomMutation.mutateAsync(input);
      setCustomDialogOpen(false);
      toast.success("Intern proces toegevoegd");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kon intern proces niet opslaan");
    }
  }

  const rememberPipelineNavigation = useCallback((focusPipelineId?: string) => {
    rememberCurrentRoute("pipelines", {
      filter,
      search,
      focusPipelineId,
    } satisfies PipelineNavigationMemory);
  }, [filter, search]);

  useEffect(() => {
    if (restoredScrollRef.current || isLoading) return;
    const memory = readNavigationMemory("pipelines");
    if (!memory || memory.scrollY <= 0) return;
    restoredScrollRef.current = true;
    restoreNavigationScroll("pipelines");
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Laden...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10 lg:py-10 animate-fade-in">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as PipelineFilter)}>
          <PageHeaderShell
            icon={Layers2}
            eyebrow="Pipelines"
            title="Pipelines"
            description="Deal-pipelines vanuit HubSpot en handmatige processen buiten HubSpot."
            actions={(
              <>
                <PageHeaderAction onClick={handleSync} disabled={syncMutation.isPending}>
                  <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                  {syncMutation.isPending ? "Bezig..." : "Sync HubSpot"}
                </PageHeaderAction>
                <PageHeaderAction onClick={() => setCustomDialogOpen(true)}>
                  <Plus className="w-3.5 h-3.5" />
                  Intern proces
                </PageHeaderAction>
              </>
            )}
            metrics={(
              <PageHeaderMetrics>
                <PageHeaderMetric label="actief" value={activePipelineCount} />
                <PageHeaderMetric label="pipelines" value={pipelines.length} />
                <PageHeaderMetric label="stages" value={totalStages} />
                <PageHeaderMetric label="HubSpot" value={hubspotPipelines.length} />
                <PageHeaderMetric label="intern" value={customPipelines.length} />
              </PageHeaderMetrics>
            )}
          >
            <PageCommandBar>
              <TabsList className="h-9 bg-muted/60 p-1">
                <TabsTrigger value="all" className="h-7 rounded-md px-3 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  Alles
                </TabsTrigger>
                <TabsTrigger value="hubspot" className="h-7 rounded-md px-3 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  HubSpot
                </TabsTrigger>
                <TabsTrigger value="custom" className="h-7 rounded-md px-3 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  Intern
                </TabsTrigger>
                <TabsTrigger value="inactive" className="h-7 rounded-md px-3 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  Inactief
                </TabsTrigger>
              </TabsList>
              <div className="relative w-full max-w-md lg:w-[360px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Zoek pipeline"
                  placeholder="Zoek pipeline..."
                  className="h-9 pl-9"
                />
              </div>
            </PageCommandBar>
          </PageHeaderShell>

        {pipelines.length === 0 && (
          <div className="card-elevated p-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Geen pipelines gevonden. Synchroniseer HubSpot of voeg een intern proces toe.
            </p>
            <div className="grid w-full max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                onClick={handleSync}
                disabled={syncMutation.isPending}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                {syncMutation.isPending ? "Bezig..." : "Sync HubSpot"}
              </button>
              <button
                type="button"
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-ring"
                onClick={() => setCustomDialogOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Intern proces toevoegen
              </button>
            </div>
          </div>
        )}

        {pipelines.length > 0 && filteredPipelines.length === 0 && (
          <div className="card-elevated p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Geen pipelines gevonden voor deze filter of zoekopdracht.
            </p>
          </div>
        )}

        {filteredPipelines.length > 0 && (
          <PipelineMatrix
            pipelines={filteredPipelines}
            onOpenPipeline={rememberPipelineNavigation}
          />
        )}
        </Tabs>
      </div>

      <CustomPipelineDialog
        open={customDialogOpen}
        isSaving={createCustomMutation.isPending}
        onOpenChange={setCustomDialogOpen}
        onSubmit={handleCreateCustomPipeline}
      />
    </div>
  );
}

function isPipelineFilter(value: unknown): value is PipelineFilter {
  return value === "all" || value === "hubspot" || value === "custom" || value === "inactive";
}

