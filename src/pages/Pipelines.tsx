import type { ReactNode } from "react";
import { toast } from "sonner";
import { Layers2, RefreshCw } from "lucide-react";
import { usePipelines, useHubSpotPipelinesSync } from "@/lib/hooks";
import { PipelineCard } from "@/components/PipelineCard";

export default function Pipelines(): ReactNode {
  const { data: pipelines = [], isLoading } = usePipelines();
  const syncMutation = useHubSpotPipelinesSync();

  const totalStages = pipelines.reduce((sum, p) => sum + p.stages.length, 0);
  const activePipelines = pipelines.filter(p => p.isActive);
  const inactivePipelines = pipelines.filter(p => !p.isActive);

  async function handleSync(): Promise<void> {
    try {
      const result = await syncMutation.mutateAsync();
      toast.success(`${result.upserted} pipeline(s) gesynchroniseerd`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync mislukt");
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
        {/* Hero */}
        <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-hero mb-8">
          <div className="px-8 py-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                <Layers2 className="w-4 h-4" />
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-primary">
                HubSpot CRM
              </span>
            </div>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                  Pipelines
                </h1>
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                  Alle deal-pipelines vanuit HubSpot CRM, inclusief de bijbehorende stages.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:border-primary/40 transition-colors focus-ring disabled:opacity-50"
                onClick={handleSync}
                disabled={syncMutation.isPending}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                {syncMutation.isPending ? "Bezig…" : "Sync HubSpot"}
              </button>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <StatBadge label="Actief" value={activePipelines.length} />
              <StatBadge label="Pipelines" value={pipelines.length} />
              <StatBadge label="Stages" value={totalStages} />
            </div>
          </div>
        </header>

        {/* Empty state */}
        {pipelines.length === 0 && (
          <div className="card-elevated p-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Geen pipelines gevonden. Klik op Sync om pipelines op te halen vanuit HubSpot.
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-ring disabled:opacity-50"
              onClick={handleSync}
              disabled={syncMutation.isPending}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? "Bezig…" : "Sync HubSpot"}
            </button>
          </div>
        )}

        {/* Active pipelines */}
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

        {/* Inactive pipelines */}
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
