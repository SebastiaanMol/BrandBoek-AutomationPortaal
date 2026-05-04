import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Layers2, Plus, RefreshCw } from "lucide-react";
import { useCreateCustomPipeline, useHubSpotPipelinesSync, usePipelines } from "@/lib/queryHooks/pipelines";
import { PipelineCard } from "@/components/PipelineCard";
import { CustomPipelineDialog } from "@/components/CustomPipelineDialog";
import type { CustomPipelineInput } from "@/lib/storage/pipelines";

type PipelineFilter = "all" | "hubspot" | "custom" | "inactive";

export default function Pipelines(): ReactNode {
  const { data: pipelines = [], isLoading } = usePipelines();
  const syncMutation = useHubSpotPipelinesSync();
  const createCustomMutation = useCreateCustomPipeline();
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [filter, setFilter] = useState<PipelineFilter>("all");

  const totalStages = pipelines.reduce((sum, p) => sum + p.stages.length, 0);
  const hubspotPipelines = pipelines.filter(p => p.source === "hubspot");
  const customPipelines = pipelines.filter(p => p.source === "custom");
  const activePipelineCount = pipelines.filter(p => p.isActive).length;
  const filteredPipelines = pipelines.filter((pipeline) => {
    if (filter === "hubspot") return pipeline.source === "hubspot";
    if (filter === "custom") return pipeline.source === "custom";
    if (filter === "inactive") return !pipeline.isActive;
    return true;
  });
  const activePipelines = filteredPipelines.filter(p => p.isActive);
  const inactivePipelines = filteredPipelines.filter(p => !p.isActive);

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
        <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-hero mb-8">
          <div className="px-8 py-8">
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
          </div>
        </header>

        {pipelines.length > 0 && (
          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card/80 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Weergave</p>
              <p className="text-xs text-muted-foreground">Filter op bron of status.</p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 rounded-xl border border-border bg-muted/40 p-1.5 sm:inline-grid sm:w-auto sm:grid-cols-4">
              <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
                Alles
              </FilterButton>
              <FilterButton active={filter === "hubspot"} onClick={() => setFilter("hubspot")}>
                HubSpot
              </FilterButton>
              <FilterButton active={filter === "custom"} onClick={() => setFilter("custom")}>
                Intern
              </FilterButton>
              <FilterButton active={filter === "inactive"} onClick={() => setFilter("inactive")}>
                Inactief
              </FilterButton>
            </div>
          </div>
        )}

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
              Geen pipelines gevonden voor deze filter.
            </p>
          </div>
        )}

        {activePipelines.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-foreground mb-3">Actieve pipelines</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {activePipelines.map((pipeline, i) => (
                <PipelineCard key={pipeline.pipelineId} pipeline={pipeline} index={i} />
              ))}
            </div>
          </div>
        )}

        {inactivePipelines.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">Inactieve pipelines</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 opacity-60">
              {inactivePipelines.map((pipeline, i) => (
                <PipelineCard key={pipeline.pipelineId} pipeline={pipeline} index={activePipelines.length + i} />
              ))}
            </div>
          </div>
        )}
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

const FilterButton = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      "min-h-8 min-w-[78px] rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      active
        ? "border border-primary/40 bg-primary text-primary-foreground shadow-sm"
        : "border border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground",
    ].join(" ")}
  >
    {children}
  </button>
);
