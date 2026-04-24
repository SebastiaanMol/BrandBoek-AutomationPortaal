import { useNavigate } from "react-router-dom";
import { ChevronRight, Layers2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import type { Pipeline } from "@/lib/types";

export const PIPELINE_COLORS = [
  { from: "#3b5bff", to: "#6e8eff", tint: "#eff2ff", textHex: "#3b5bff" },
  { from: "#7c3aed", to: "#a78bfa", tint: "#f5f3ff", textHex: "#7c3aed" },
  { from: "#d97706", to: "#fcd34d", tint: "#fffbeb", textHex: "#d97706" },
  { from: "#16a34a", to: "#4ade80", tint: "#f0fdf4", textHex: "#16a34a" },
  { from: "#ea580c", to: "#fb923c", tint: "#fff7ed", textHex: "#ea580c" },
] as const;

interface PipelineCardProps {
  pipeline: Pipeline;
  index: number;
}

export function PipelineCard({ pipeline, index }: PipelineCardProps) {
  const navigate = useNavigate();
  const color = PIPELINE_COLORS[index % PIPELINE_COLORS.length];
  const stageCount = pipeline.stages.length;

  return (
    <button
      type="button"
      onClick={() => navigate(`/pipelines/${pipeline.pipelineId}`)}
      className="card-elevated overflow-hidden w-full text-left focus-ring hover:brightness-105 transition-[filter] duration-150"
    >
      {/* Gradient header */}
      <div
        className="p-4"
        style={{ background: `linear-gradient(135deg, ${color.from} 0%, ${color.to} 100%)` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            <Layers2 className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-snug truncate">
              {pipeline.naam}
            </p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
              HubSpot CRM · {stageCount} stage{stageCount === 1 ? "" : "s"}
            </p>
          </div>
          <ChevronRight
            className="w-4 h-4 flex-shrink-0"
            style={{ color: "rgba(255,255,255,0.8)" }}
          />
        </div>
      </div>
      {/* Footer */}
      <div className="px-4 py-2.5">
        <p className="text-[10px] text-muted-foreground">
          Gesynchroniseerd{" "}
          {format(new Date(pipeline.syncedAt), "d MMM yyyy, HH:mm", { locale: nl })}
        </p>
      </div>
    </button>
  );
}
