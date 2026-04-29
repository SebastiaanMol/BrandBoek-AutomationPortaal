import { useEffect, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight, Layers2, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { usePipelines, useDescribePipeline, useSetPipelineActive } from "@/lib/hooks";
import { PIPELINE_COLORS } from "@/components/PipelineCard";

export default function PipelineDetail(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: pipelines = [], isLoading } = usePipelines();
  const describeMutation = useDescribePipeline();
  const setActiveMutation = useSetPipelineActive();

  function handleToggleActive() {
    if (!pipeline) return;
    setActiveMutation.mutate(
      { pipelineId: pipeline.pipelineId, isActive: !pipeline.isActive },
      { onError: () => toast.error("Kon status niet opslaan") },
    );
  }

  const pipelineIndex = pipelines.findIndex((p) => p.pipelineId === id);
  const pipeline = pipelines[pipelineIndex];

  useEffect(() => {
    if (pipeline && !pipeline.beschrijving && !describeMutation.isPending) {
      describeMutation.mutate(pipeline.pipelineId);
    }
    // describeMutation is a stable ref; isPending intentionally omitted to avoid
    // re-firing after the mutation completes (before query invalidation runs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline?.pipelineId, pipeline?.beschrijving]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="min-h-screen bg-background p-8">
        <button
          type="button"
          onClick={() => navigate("/pipelines")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 focus-ring rounded"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar Pipelines
        </button>
        <div className="card-elevated p-12 text-center">
          <p className="text-sm text-muted-foreground">Pipeline niet gevonden.</p>
        </div>
      </div>
    );
  }

  const color = PIPELINE_COLORS[pipelineIndex % PIPELINE_COLORS.length];
  const sortedStages = [...pipeline.stages].sort(
    (a, b) => a.display_order - b.display_order,
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[900px] px-6 py-8 lg:px-10 lg:py-10 animate-fade-in">
        {/* Back button */}
        <button
          type="button"
          onClick={() => navigate("/pipelines")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 focus-ring rounded"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar Pipelines
        </button>

        {/* Hero */}
        <div
          className="rounded-2xl p-6 mb-6"
          style={{
            background: `linear-gradient(135deg, ${color.from} 0%, ${color.to} 100%)`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.2)" }}
              >
                <Layers2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-0.5"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  HubSpot CRM · {sortedStages.length} stages
                </p>
                <h1 className="text-2xl font-bold text-white leading-tight">
                  {pipeline.naam}
                </h1>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <p
                className="text-[10px] text-right"
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                Gesynchroniseerd
                <br />
                {format(new Date(pipeline.syncedAt), "d MMM yyyy, HH:mm", {
                  locale: nl,
                })}
              </p>
              <button
                type="button"
                onClick={handleToggleActive}
                disabled={setActiveMutation.isPending}
                className={[
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors disabled:opacity-60",
                  pipeline.isActive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200",
                ].join(" ")}
              >
                <span className={["w-1.5 h-1.5 rounded-full", pipeline.isActive ? "bg-emerald-500" : "bg-slate-400"].join(" ")} />
                {pipeline.isActive ? "Actief" : "Inactief"}
              </button>
            </div>
          </div>
          {/* AI beschrijving */}
          <div
            className="mt-4 rounded-lg px-3 py-2.5"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles
                className="w-2.5 h-2.5 flex-shrink-0"
                style={{ color: "rgba(255,255,255,0.8)" }}
              />
              <span
                className="text-[9px] font-semibold uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                AI Samenvatting
              </span>
            </div>
            {pipeline.beschrijving ? (
              <p
                className="text-[11px] leading-relaxed"
                style={{ color: "rgba(255,255,255,0.9)" }}
              >
                {pipeline.beschrijving}
              </p>
            ) : (
              <div className="space-y-1.5 animate-pulse">
                <div
                  className="h-2 rounded-full w-full"
                  style={{ background: "rgba(255,255,255,0.25)" }}
                />
                <div
                  className="h-2 rounded-full w-4/5"
                  style={{ background: "rgba(255,255,255,0.25)" }}
                />
                <p
                  className="text-[8px] mt-1"
                  style={{ color: "rgba(255,255,255,0.45)" }}
                >
                  Beschrijving wordt gegenereerd…
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Horizontal flow track */}
        {sortedStages.length > 0 && (
          <div className="card-elevated overflow-hidden mb-4">
            <div className="px-6 py-5" style={{ background: color.tint }}>
              <div className="relative pb-6">
                <div className="absolute top-[9px] left-[9px] right-[9px] h-[2px] rounded-full bg-border" />
                <div
                  className="absolute top-[9px] left-[9px] right-[9px] h-[2px] rounded-full"
                  style={{ background: color.from }}
                />
                <div className="relative flex justify-between">
                  {sortedStages.map((stage, i) => {
                    const isLast = i === sortedStages.length - 1;
                    return (
                      <div key={stage.stage_id} className="flex flex-col items-center">
                        <div
                          className="w-[18px] h-[18px] rounded-full border-2 border-white flex items-center justify-center"
                          style={{
                            background: isLast ? "#16a34a" : color.from,
                            boxShadow: `0 0 0 2px ${isLast ? "#16a34a" : color.from}`,
                          }}
                        >
                          {isLast && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span
                          className="mt-1.5 text-[9px] font-semibold text-center leading-none max-w-[56px] overflow-hidden text-ellipsis whitespace-nowrap"
                          style={{ color: isLast ? "#16a34a" : color.textHex }}
                        >
                          {stage.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Numbered stage list */}
        <div className="card-elevated overflow-hidden">
          <div className="p-4 flex flex-col gap-1.5">
            {sortedStages.map((stage, i) => {
              const isLast = i === sortedStages.length - 1;
              return (
                <div
                  key={stage.stage_id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                  style={{ background: isLast ? "#f0fdf4" : color.tint }}
                >
                  <span
                    className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ background: isLast ? "#16a34a" : color.from }}
                  >
                    {isLast ? (
                      <Check className="w-2.5 h-2.5 text-white" />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span
                    className="text-[11px] font-semibold flex-1 truncate"
                    style={{ color: isLast ? "#16a34a" : color.textHex }}
                  >
                    {stage.label}
                  </span>
                  {!isLast && (
                    <ChevronRight
                      className="w-2.5 h-2.5 flex-shrink-0"
                      style={{ color: color.textHex }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
