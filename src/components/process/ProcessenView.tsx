import { Eye } from "lucide-react";
import { ProcessCanvas } from "./ProcessCanvas";
import type { Pipeline } from "@/lib/types";
import type { ProcessState } from "@/data/processData";

interface ProcessenViewProps {
  pipelines: Pipeline[];
  selectedPipelineId: string | null;
  canvasState: ProcessState | null;
  isLoading: boolean;
  onSelectPipeline: (id: string) => void;
  onSwitchToEdit: () => void;
}

export function ProcessenView({
  pipelines,
  selectedPipelineId,
  canvasState,
  isLoading,
  onSelectPipeline,
  onSwitchToEdit,
}: ProcessenViewProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Pipeline selector bar */}
      <div className="shrink-0 px-6 py-2.5 border-b border-border bg-card flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mr-1">
          Pipeline:
        </span>
        {pipelines.map((p) => (
          <button
            key={p.pipelineId}
            type="button"
            onClick={() => onSelectPipeline(p.pipelineId)}
            className={[
              "px-3 py-1 rounded-full text-[11px] font-semibold transition-colors",
              selectedPipelineId === p.pipelineId
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            ].join(" ")}
          >
            {p.naam}
          </button>
        ))}
        {pipelines.length === 0 && (
          <span className="text-[11px] text-muted-foreground">
            Geen pipelines gevonden — synchroniseer eerst via Instellingen.
          </span>
        )}
      </div>

      {/* Canvas area */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Proceskaart laden…
          </div>
        ) : !selectedPipelineId ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Selecteer een pipeline om de proceskaart te bekijken.
          </div>
        ) : !canvasState ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Geen stages gevonden voor deze pipeline.
          </div>
        ) : (
          <>
            <div className="process-canvas-wrap border border-border rounded-[var(--radius-outer)] overflow-hidden bg-card shadow-sm">
              <ProcessCanvas
                steps={canvasState.steps}
                connections={canvasState.connections}
                automations={canvasState.automations}
              />
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <Eye className="h-3 w-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Leesmodus — ga naar{" "}
                <button
                  type="button"
                  onClick={onSwitchToEdit}
                  className="font-medium hover:underline"
                >
                  Bewerken
                </button>{" "}
                om wijzigingen te maken.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
