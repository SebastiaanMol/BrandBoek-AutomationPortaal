import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useAutomatiseringen, usePipelines, useProcessState } from "@/lib/hooks";
import { ProcessenView } from "@/components/process/ProcessenView";
import { ProcessenEditor } from "@/components/process/ProcessenEditor";
import { stagesToProcessState } from "@/data/processData";
import type { Automation, ProcessState, TeamKey } from "@/data/processData";
import type { SavedProcessState } from "@/lib/supabaseStorage";
import type { Automatisering, KlantFase } from "@/lib/types";

const FASE_TO_TEAM: Record<KlantFase, TeamKey> = {
  Marketing:   "marketing",
  Sales:       "sales",
  Onboarding:  "onboarding",
  Boekhouding: "boekhouding",
  Offboarding: "management",
};

function toCanvasAutomation(
  a: Automatisering,
  savedLink?: { fromStepId: string; toStepId: string },
): Automation {
  return {
    id:         a.id,
    name:       a.naam,
    team:       FASE_TO_TEAM[a.fasen?.[0]] ?? "management",
    tool:       a.systemen?.[0] ?? "Anders",
    goal:       a.doel ?? "",
    fromStepId: savedLink?.fromStepId,
    toStepId:   savedLink?.toStepId,
  };
}

type Mode = "view" | "edit";

export default function Processen(): ReactNode {
  const [mode, setMode]                       = useState<Mode>("view");
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);

  const { data: pipelines = [] }      = usePipelines();
  const { data: dbAutomations = [] }  = useAutomatiseringen();

  // Auto-select first pipeline
  useEffect(() => {
    if (!selectedPipelineId && pipelines.length > 0) {
      setSelectedPipelineId(pipelines[0].pipelineId);
    }
  }, [pipelines, selectedPipelineId]);

  const currentPipeline = pipelines.find(p => p.pipelineId === selectedPipelineId) ?? null;

  // Fetch canvas state for view mode only
  const { data: savedState, isLoading: stateLoading } = useProcessState(
    mode === "view" ? selectedPipelineId : null,
  );

  // Convert SavedProcessState → ProcessState; fall back to pipeline stages when no canvas saved yet
  function toProcessState(saved: SavedProcessState | null | undefined): ProcessState | null {
    if (saved) return {
      steps:       saved.steps       as ProcessState["steps"],
      connections: saved.connections as ProcessState["connections"],
      automations: dbAutomations.map(a => toCanvasAutomation(a, saved.autoLinks[a.id])),
    };
    if (currentPipeline && currentPipeline.stages.length > 0) {
      return stagesToProcessState(currentPipeline);
    }
    return null;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] min-h-0">
      {/* Tab header */}
      <div className="shrink-0 px-6 pt-3 border-b border-border bg-card">
        <div className="flex gap-0">
          <button
            type="button"
            onClick={() => setMode("view")}
            className={[
              "px-4 py-2 text-[11px] font-semibold border-b-2 transition-colors",
              mode === "view"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            Bekijken
          </button>
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={[
              "px-4 py-2 text-[11px] font-semibold border-b-2 transition-colors",
              mode === "edit"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            Bewerken
          </button>
        </div>
      </div>

      {/* Content */}
      {mode === "view" ? (
        <ProcessenView
          pipelines={pipelines}
          selectedPipelineId={selectedPipelineId}
          canvasState={toProcessState(savedState)}
          isLoading={stateLoading}
          onSelectPipeline={setSelectedPipelineId}
          onSwitchToEdit={() => setMode("edit")}
        />
      ) : selectedPipelineId ? (
        <ProcessenEditor
          pipelineId={selectedPipelineId}
          onSwitchPipeline={setSelectedPipelineId}
        />
      ) : (
        <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
          Geen pipeline geselecteerd.
        </div>
      )}
    </div>
  );
}
