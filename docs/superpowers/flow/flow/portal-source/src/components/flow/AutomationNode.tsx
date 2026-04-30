import { Handle, Position, type NodeProps } from "reactflow";
import { ATOMIC_AUTOMATIONS, SYSTEMS, type SystemKey } from "@/data/portal";
import { Layers } from "lucide-react";

export interface AutomationNodeData {
  automationId: string;
  index: number;
  reusedCount: number; // # other processes using this
}

export const AutomationNode = ({ data, selected }: NodeProps<AutomationNodeData>) => {
  const a = ATOMIC_AUTOMATIONS[data.automationId];
  if (!a) return null;
  const sys = SYSTEMS[a.system as SystemKey];

  const statusDot =
    a.status === "active"
      ? "bg-success"
      : a.status === "paused"
      ? "bg-warning"
      : "bg-destructive";

  return (
    <div
      className={`group relative w-[280px] rounded-xl bg-card border transition-all duration-200 ease-base ${
        selected
          ? "border-primary shadow-glow"
          : "border-border shadow-sm hover:shadow-md hover:-translate-y-0.5"
      }`}
      style={{ ["--sys" as string]: `hsl(var(${sys.hue}))` }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="h-1 w-full rounded-t-xl" style={{ background: `var(--sys)` }} />
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-bold flex-shrink-0"
              style={{
                background: `color-mix(in oklab, var(--sys) 14%, transparent)`,
                color: `var(--sys)`,
              }}
            >
              {String(data.index + 1).padStart(2, "0")}
            </span>
            <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground truncate">
              {sys.label}
            </span>
          </div>
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot} flex-shrink-0`} />
        </div>

        <h3 className="text-sm font-semibold text-foreground leading-snug mb-1.5">
          {a.name}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {a.description}
        </p>

        <div className="mt-3 flex items-center justify-between text-[11px]">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Layers className="w-3 h-3" />
            {a.steps.length} stap{a.steps.length === 1 ? "" : "pen"}
          </span>
          {data.reusedCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary-soft text-primary font-semibold"
              title={`Hergebruikt in ${data.reusedCount} andere proces${data.reusedCount === 1 ? "" : "sen"}`}
            >
              ↻ {data.reusedCount}
            </span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
