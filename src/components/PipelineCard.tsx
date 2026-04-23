import { useState } from "react";
import { ChevronDown, ChevronRight, Check, Layers2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import type { Pipeline } from "@/lib/types";

const PIPELINE_COLORS = [
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
  const [expanded, setExpanded] = useState(false);
  const color = PIPELINE_COLORS[index % PIPELINE_COLORS.length];
  const sortedStages = [...pipeline.stages].sort(
    (a, b) => a.display_order - b.display_order,
  );

  return (
    <div className="card-elevated overflow-hidden">
      {/* Header — click to expand/collapse flow track */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={`pipeline-flow-track-${pipeline.pipelineId}`}
        className="w-full text-left p-4 focus-ring hover:brightness-110 transition-[filter] duration-150"
        style={{
          background: `linear-gradient(135deg, ${color.from} 0%, ${color.to} 100%)`,
        }}
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
              HubSpot CRM · {sortedStages.length} stage
              {sortedStages.length === 1 ? "" : "s"}
            </p>
          </div>
          <ChevronDown
            className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            style={{ color: "rgba(255,255,255,0.8)" }}
          />
        </div>
      </button>

      {/* Expandable horizontal flow track */}
      <div
        id={`pipeline-flow-track-${pipeline.pipelineId}`}
        className={`grid transition-all duration-300 ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
        <div
          className="px-4 py-4 border-b border-border"
          style={{ background: color.tint }}
        >
          {sortedStages.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center">
              Geen stages geconfigureerd
            </p>
          ) : (
            <div className="relative pb-6">
              {/* Track line — background */}
              <div className="absolute top-[9px] left-[9px] right-[9px] h-[2px] rounded-full bg-border" />
              {/* Track line — filled */}
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
          )}
        </div>
        </div>
      </div>

      {/* Stage rows */}
      <div className="p-3 flex flex-col gap-1.5">
        {sortedStages.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-1">
            Geen stages geconfigureerd
          </p>
        ) : (
          sortedStages.map((stage, i) => {
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
                  {isLast ? <Check className="w-2.5 h-2.5 text-white" /> : String(i + 1).padStart(2, "0")}
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
          })
        )}
      </div>

      {/* Footer — sync timestamp */}
      <div className="px-3 pb-3">
        <p className="text-[10px] text-muted-foreground">
          Gesynchroniseerd{" "}
          {format(new Date(pipeline.syncedAt), "d MMM yyyy, HH:mm", {
            locale: nl,
          })}
        </p>
      </div>
    </div>
  );
}
