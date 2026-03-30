import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Zap, GripVertical, CheckCircle2, ArrowRight, ChevronDown } from "lucide-react";
import type { Automation, ProcessStep } from "@/data/processData";
import { TEAM_CONFIG } from "@/data/processData";

interface UnassignedPanelProps {
  automations: Automation[];
  steps: ProcessStep[];
  onAutomationClick: (a: Automation) => void;
}

export function UnassignedPanel({ automations, steps, onAutomationClick }: UnassignedPanelProps) {
  const [assignedOpen, setAssignedOpen] = useState(false);
  const assigned   = automations.filter(a => a.fromStepId && a.toStepId);
  const unassigned = automations.filter(a => !a.fromStepId || !a.toStepId);

  function stepLabel(id?: string) {
    if (!id) return "—";
    const s = steps.find(x => x.id === id);
    return s ? s.label : id;
  }

  function handleDragStart(e: React.DragEvent, auto: Automation) {
    e.dataTransfer.setData("automationId", auto.id);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col h-full">

      {/* ── Gekoppeld header (collapsible) ─────────────────────────────── */}
      <button
        onClick={() => setAssignedOpen(o => !o)}
        className="w-full px-4 py-3 border-b border-border flex items-center gap-2 hover:bg-secondary/50 transition-colors"
      >
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        <span className="text-sm font-semibold">Gekoppeld</span>
        <Badge variant="secondary" className="ml-auto text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
          {assigned.length}
        </Badge>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${assignedOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* ── Gekoppeld list ──────────────────────────────────────────────── */}
      {assignedOpen && (
        <div className="overflow-y-auto divide-y divide-border border-b border-border" style={{ maxHeight: 240 }}>
          {assigned.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4 px-4">
              Nog geen automations gekoppeld.
            </p>
          )}
          {assigned.map(auto => {
            const cfg = TEAM_CONFIG[auto.team];
            return (
              <div
                key={auto.id}
                onClick={() => onAutomationClick(auto)}
                className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/50 transition-colors"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                  style={{ background: cfg.stroke }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{auto.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {auto.tool} · {auto.goal.length > 30 ? auto.goal.slice(0, 30) + "…" : auto.goal}
                  </p>
                  <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground">
                    <span className="truncate max-w-[80px]">{stepLabel(auto.fromStepId)}</span>
                    <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate max-w-[80px]">{stepLabel(auto.toStepId)}</span>
                  </div>
                </div>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Niet-gekoppeld header ───────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">Niet-gekoppeld</span>
          <Badge variant="secondary" className="ml-auto text-xs">
            {unassigned.length}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Sleep een automation naar een pijl op de flow
        </p>
      </div>

      {/* ── Niet-gekoppeld list ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {unassigned.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8 px-4">
            Alle automations zijn gekoppeld.
          </p>
        )}
        {unassigned.map(auto => {
          const cfg = TEAM_CONFIG[auto.team];
          return (
            <div
              key={auto.id}
              draggable
              onDragStart={e => handleDragStart(e, auto)}
              onClick={() => onAutomationClick(auto)}
              className="flex items-center gap-3 px-4 py-3 cursor-grab active:cursor-grabbing hover:bg-secondary/50 transition-colors group"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground/70 transition-colors" />
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cfg.stroke }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{auto.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {auto.tool} · {auto.goal.length > 36 ? auto.goal.slice(0, 36) + "…" : auto.goal}
                </p>
              </div>
              <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
