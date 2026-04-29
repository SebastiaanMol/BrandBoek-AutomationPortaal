import { GripVertical, X, Check, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProcessStep } from "@/data/processData";
import type { PipelineStage } from "@/lib/types";
import type { DriftRename } from "@/lib/processDrift";
import { TEAM_CONFIG } from "@/data/processData";

interface StepStagingPanelProps {
  driftNew:        PipelineStage[];
  driftRenamed:    DriftRename[];
  parkedSteps:     ProcessStep[];
  onApplyRename:   (stepId: string, newLabel: string) => void;
  onDismissRename: (stepId: string) => void;
}

export function StepStagingPanel({
  driftNew, driftRenamed, parkedSteps, onApplyRename, onDismissRename,
}: StepStagingPanelProps) {
  const isEmpty = driftNew.length === 0 && driftRenamed.length === 0 && parkedSteps.length === 0;

  function handleDragStartNew(e: React.DragEvent, stage: PipelineStage) {
    const step: ProcessStep = {
      id:     `stage-${stage.stage_id}`,
      label:  stage.label,
      team:   "sales",
      column: 0,
      type:   "task",
    };
    e.dataTransfer.setData("stagedStep", JSON.stringify(step));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragStartParked(e: React.DragEvent, step: ProcessStep) {
    e.dataTransfer.setData("stagedStep", JSON.stringify(step));
    e.dataTransfer.effectAllowed = "move";
  }

  if (isEmpty) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          Geen stappen in de bak.<br />
          Klik rechts op een stap om hem te parkeren.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-border">

      {/* ── Nieuw in HubSpot ─────────────────────────────────────────── */}
      {driftNew.length > 0 && (
        <div>
          <div className="px-4 py-3 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-foreground">Nieuw in HubSpot</span>
            <Badge variant="secondary" className="ml-auto text-[10px] bg-amber-50 text-amber-700 border-amber-200">
              {driftNew.length}
            </Badge>
          </div>
          <p className="px-4 pb-2 text-[11px] text-muted-foreground">Sleep naar de canvas om te plaatsen</p>
          <div className="divide-y divide-border">
            {driftNew.map(stage => (
              <div
                key={stage.stage_id}
                draggable
                onDragStart={e => handleDragStartNew(e, stage)}
                className="flex items-center gap-3 px-4 py-2.5 cursor-grab active:cursor-grabbing hover:bg-amber-50/50 transition-colors group"
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover:text-amber-400 transition-colors" />
                <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span className="text-sm text-foreground truncate">{stage.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Hernoemd in HubSpot ─────────────────────────────────────── */}
      {driftRenamed.length > 0 && (
        <div>
          <div className="px-4 py-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Hernoemd in HubSpot</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">{driftRenamed.length}</Badge>
          </div>
          <div className="divide-y divide-border">
            {driftRenamed.map(r => (
              <div key={r.stepId} className="px-4 py-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground line-through truncate">{r.oldLabel}</p>
                  <p className="text-sm text-foreground font-medium truncate">→ {r.newLabel}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onApplyRename(r.stepId, r.newLabel)}
                    className="h-6 w-6 rounded flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    title="Toepassen"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismissRename(r.stepId)}
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-secondary/70 transition-colors text-muted-foreground"
                    title="Negeren"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Geparkeerd ───────────────────────────────────────────────── */}
      {parkedSteps.length > 0 && (
        <div>
          <div className="px-4 py-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Geparkeerd</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">{parkedSteps.length}</Badge>
          </div>
          <p className="px-4 pb-2 text-[11px] text-muted-foreground">Sleep terug naar de canvas</p>
          <div className="divide-y divide-border">
            {parkedSteps.map(step => {
              const cfg = TEAM_CONFIG[step.team] ?? TEAM_CONFIG["sales"];
              return (
                <div
                  key={step.id}
                  draggable
                  onDragStart={e => handleDragStartParked(e, step)}
                  className="flex items-center gap-3 px-4 py-2.5 cursor-grab active:cursor-grabbing hover:bg-secondary/50 transition-colors group"
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground/70 transition-colors" />
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.dot }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{step.label}</p>
                    <p className="text-[11px] text-muted-foreground">{cfg.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
