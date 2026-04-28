import { ChevronDown, Eye } from "lucide-react";
import { ProcessCanvas } from "./ProcessCanvas";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const selectedPipeline = pipelines.find(p => p.pipelineId === selectedPipelineId);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header with pipeline dropdown */}
      <div className="shrink-0 px-6 py-3 border-b border-border bg-card flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
              {selectedPipeline?.naam ?? "Pipeline"}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {pipelines.map((p) => (
              <DropdownMenuItem
                key={p.pipelineId}
                onClick={() => onSelectPipeline(p.pipelineId)}
                className={p.pipelineId === selectedPipelineId ? "font-semibold" : ""}
              >
                {p.naam}
              </DropdownMenuItem>
            ))}
            {pipelines.length === 0 && (
              <DropdownMenuItem disabled>
                Geen pipelines gevonden
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <h1 className="text-base font-bold">Bekijken</h1>
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
