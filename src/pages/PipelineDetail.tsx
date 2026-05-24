import { useEffect, useState, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight, Layers2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import {
  useDeleteCustomPipeline,
  useDescribePipeline,
  usePipelines,
  useSetPipelineActive,
  useUpdateCustomPipeline,
} from "@/lib/queryHooks/pipelines";
import { PIPELINE_COLORS } from "@/components/PipelineCard";
import { CustomPipelineDialog } from "@/components/CustomPipelineDialog";
import type { CustomPipelineInput } from "@/lib/storage/pipelines";
import { canDeletePipeline } from "@/lib/storage/pipelines";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function PipelineDetail(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: pipelines = [], isLoading } = usePipelines();
  const describeMutation = useDescribePipeline();
  const setActiveMutation = useSetPipelineActive();
  const updateCustomMutation = useUpdateCustomPipeline();
  const deleteCustomMutation = useDeleteCustomPipeline();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const pipelineIndex = pipelines.findIndex((p) => p.pipelineId === id);
  const pipeline = pipelines[pipelineIndex];
  const isCustom = pipeline?.source === "custom";

  function handleToggleActive() {
    if (!pipeline) return;
    setActiveMutation.mutate(
      { pipelineId: pipeline.pipelineId, isActive: !pipeline.isActive },
      { onError: () => toast.error("Kon status niet opslaan") },
    );
  }

  async function handleUpdateCustomPipeline(input: CustomPipelineInput): Promise<void> {
    if (!pipeline) return;
    try {
      await updateCustomMutation.mutateAsync({ pipelineId: pipeline.pipelineId, ...input });
      setEditOpen(false);
      toast.success("Intern proces bijgewerkt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kon intern proces niet opslaan");
    }
  }

  async function handleDeleteCustomPipeline(): Promise<void> {
    if (!pipeline || !canDeletePipeline(pipeline)) return;
    try {
      await deleteCustomMutation.mutateAsync(pipeline.pipelineId);
      toast.success("Intern proces verwijderd");
      navigate("/pipelines");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kon intern proces niet verwijderen");
    }
  }

  useEffect(() => {
    if (pipeline && pipeline.source === "hubspot" && !pipeline.beschrijving && !describeMutation.isPending) {
      describeMutation.mutate(pipeline.pipelineId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline?.pipelineId, pipeline?.beschrijving, pipeline?.source]);

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
  const sourceLabel = isCustom ? "Intern proces" : "HubSpot";
  const dateLabel = isCustom ? "Laatst bijgewerkt" : "Gesynchroniseerd";
  const dateValue = isCustom ? pipeline.updatedAt : pipeline.syncedAt;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[900px] px-6 py-8 lg:px-10 lg:py-10 animate-fade-in">
        <button
          type="button"
          onClick={() => navigate("/pipelines")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 focus-ring rounded"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar Pipelines
        </button>

        <div
          className="rounded-2xl p-6 mb-6"
          style={{
            background: color.from,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.2)" }}
              >
                <Layers2 className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {sourceLabel}
                  </span>
                  <span
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "rgba(255,255,255,0.7)" }}
                  >
                    {sortedStages.length} stages
                  </span>
                </div>
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
                {dateLabel}
                <br />
                {format(new Date(dateValue), "d MMM yyyy, HH:mm", {
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
              {isCustom && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/25 transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                    Bewerken
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/25 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                    Verwijderen
                  </button>
                </div>
              )}
            </div>
          </div>

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
                {isCustom ? "Beschrijving" : "AI Samenvatting"}
              </span>
            </div>
            {pipeline.beschrijving ? (
              <p
                className="text-[11px] leading-relaxed"
                style={{ color: "rgba(255,255,255,0.9)" }}
              >
                {pipeline.beschrijving}
              </p>
            ) : isCustom ? (
              <p
                className="text-[11px] leading-relaxed"
                style={{ color: "rgba(255,255,255,0.72)" }}
              >
                Geen beschrijving toegevoegd.
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
                  Beschrijving wordt gegenereerd...
                </p>
              </div>
            )}
          </div>
        </div>

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

      <CustomPipelineDialog
        open={editOpen}
        pipeline={pipeline}
        isSaving={updateCustomMutation.isPending}
        onOpenChange={setEditOpen}
        onSubmit={handleUpdateCustomPipeline}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Intern proces verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit verwijdert de pipeline en de opgeslagen canvas-state voor deze pipeline. Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCustomPipeline}
              disabled={deleteCustomMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCustomMutation.isPending ? "Verwijderen..." : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
