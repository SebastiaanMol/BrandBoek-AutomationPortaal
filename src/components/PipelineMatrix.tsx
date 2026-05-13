import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import type { Pipeline } from "@/lib/types";
import { PIPELINE_COLORS } from "@/components/PipelineCard";
import {
  getPipelineDateLabel,
  getPipelineDateValue,
  getPipelineSourceLabel,
  getPreviewStages,
} from "@/lib/pipelineOverview";

export function PipelineMatrix({ pipelines }: { pipelines: Pipeline[] }): ReactNode {
  const navigate = useNavigate();

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="hidden grid-cols-[minmax(0,1.35fr)_8rem_7rem_6rem_minmax(0,1.3fr)_11rem_2rem] items-center gap-4 border-b border-border bg-muted/30 px-4 py-2.5 text-[10px] font-bold uppercase text-muted-foreground md:grid">
        <span>Pipeline</span>
        <span>Bron</span>
        <span>Status</span>
        <span>Stages</span>
        <span>Preview</span>
        <span>Laatste update</span>
        <span aria-hidden="true" />
      </div>

      <div className="divide-y divide-border">
        {pipelines.map((pipeline, index) => {
          const color = PIPELINE_COLORS[index % PIPELINE_COLORS.length];
          const previewStages = getPreviewStages(pipeline);
          const stageCount = pipeline.stages.length;
          const sourceLabel = getPipelineSourceLabel(pipeline);
          const dateLabel = getPipelineDateLabel(pipeline);
          const dateValue = getPipelineDateValue(pipeline);
          const isInactive = !pipeline.isActive;

          return (
            <button
              key={pipeline.pipelineId}
              type="button"
              aria-label={`Open ${pipeline.naam}`}
              onClick={() => navigate(`/pipelines/${pipeline.pipelineId}`)}
              className={[
                "group w-full bg-card px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-ring",
                "grid gap-3 md:grid-cols-[minmax(0,1.35fr)_8rem_7rem_6rem_minmax(0,1.3fr)_11rem_2rem] md:items-center md:gap-4",
                isInactive ? "text-muted-foreground opacity-70" : "text-foreground",
              ].join(" ")}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="h-9 w-1 shrink-0 rounded-full"
                  style={{ background: `linear-gradient(180deg, ${color.from} 0%, ${color.to} 100%)` }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold leading-snug">{pipeline.naam}</p>
                </div>
              </div>

              <span className="text-xs font-semibold text-muted-foreground">
                {sourceLabel}
              </span>

              <span
                className={[
                  "inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  pipeline.isActive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-100 text-slate-500",
                ].join(" ")}
              >
                <span
                  className={[
                    "h-1.5 w-1.5 rounded-full",
                    pipeline.isActive ? "bg-emerald-500" : "bg-slate-400",
                  ].join(" ")}
                />
                {pipeline.isActive ? "Actief" : "Inactief"}
              </span>

              <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                {stageCount} stage{stageCount === 1 ? "" : "s"}
              </span>

              <div
                aria-label={`Stage-preview voor ${pipeline.naam}`}
                className="flex min-w-0 flex-wrap items-center gap-1.5"
              >
                {previewStages.length > 0 ? (
                  previewStages.map((stage) => (
                    <span
                      key={stage.stage_id}
                      className="max-w-full truncate rounded-md px-2 py-1 text-[10px] font-semibold"
                      style={{ backgroundColor: color.tint, color: color.textHex }}
                    >
                      {stage.label}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">Geen stages</span>
                )}
              </div>

              <div className="min-w-0 text-xs text-muted-foreground">
                <p className="font-semibold">{dateLabel}</p>
                <p className="mt-0.5 truncate">
                  {format(new Date(dateValue), "d MMM yyyy, HH:mm", { locale: nl })}
                </p>
              </div>

              <ChevronRight className="hidden h-4 w-4 justify-self-end text-muted-foreground transition-transform group-hover:translate-x-0.5 md:block" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
