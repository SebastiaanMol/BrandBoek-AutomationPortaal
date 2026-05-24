import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Layers2, Plus, RefreshCw, Search } from "lucide-react";
import { useCreateCustomPipeline, useHubSpotPipelinesSync, usePipelines } from "@/lib/queryHooks/pipelines";
import { CustomPipelineDialog } from "@/components/CustomPipelineDialog";
import { PipelineMatrix } from "@/components/PipelineMatrix";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import type { CustomPipelineInput } from "@/lib/storage/pipelines";
import { filterPipelinesForOverview, type PipelineFilter } from "@/lib/pipelineOverview";

export default function Pipelines(): ReactNode {
  const { data: pipelines = [], isLoading } = usePipelines();
  const syncMutation = useHubSpotPipelinesSync();
  const createCustomMutation = useCreateCustomPipeline();
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [filter, setFilter] = useState<PipelineFilter>("all");
  const [search, setSearch] = useState("");

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
          <div className="rounded-2xl border border-border overflow-hidden mb-8">
            <header className="relative bg-primary-soft px-8 py-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                  <Layers2 className="w-4 h-4" />
                </span>
                <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-primary">
                  Pipelines
                </span>
              </div>
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                    Pipelines
                  </h1>
                  <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                    Deal-pipelines vanuit HubSpot en handmatige processen buiten HubSpot.
                  </p>
                </div>
                <div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-2">
                  <button
                    type="button"
                    className="inline-flex min-h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 sm:w-44"
                    onClick={handleSync}
                    disabled={syncMutation.isPending}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                    {syncMutation.isPending ? "Bezig..." : "Sync HubSpot"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-44"
                    onClick={() => setCustomDialogOpen(true)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Intern proces
                  </button>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <StatBadge label="Actief" value={activePipelineCount} />
                <StatBadge label="Pipelines" value={pipelines.length} />
                <StatBadge label="Stages" value={totalStages} />
                <StatBadge label="HubSpot" value={hubspotPipelines.length} />
                <StatBadge label="Intern" value={customPipelines.length} />
              </div>
            </header>
            <div className="border-t border-border bg-card px-6">
              <TabsList className="h-auto bg-transparent p-0 gap-0 rounded-none">
                <TabsTrigger value="all" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium">
                  Alles
                </TabsTrigger>
                <TabsTrigger value="hubspot" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium">
                  HubSpot
                </TabsTrigger>
                <TabsTrigger value="custom" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium">
                  Intern
                </TabsTrigger>
                <TabsTrigger value="inactive" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium">
                  Inactief
                </TabsTrigger>
              </TabsList>
            </div>
            <div className="border-t border-border bg-card px-6 py-4">
              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Zoek pipeline"
                  placeholder="Zoek pipeline..."
                  className="pl-9"
                />
              </div>
            </div>
          </div>

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

        {filteredPipelines.length > 0 && <PipelineMatrix pipelines={filteredPipelines} />}
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

const StatBadge = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl bg-card/80 backdrop-blur-sm border border-border px-4 py-2.5">
    <p className="text-xl font-semibold text-foreground tabular-nums leading-tight">
      {value}
    </p>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
      {label}
    </p>
  </div>
);

