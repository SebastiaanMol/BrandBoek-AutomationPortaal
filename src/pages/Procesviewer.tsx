import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Workflow, Pencil, Eye, Check, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { usePipelines, useProcessState, useAutomatiseringen } from "@/lib/hooks";
import { useRenameCustomPipeline } from "@/lib/queryHooks/pipelines";
import { buildProcessStateFromSaved } from "@/lib/processStateMapping";
import { Sentry } from "@/lib/sentry";
import { buildLaneKeys, filterValidActiveLanes, getLaneConfig, stagesToProcessState } from "@/data/processData";
import type { ProcessState } from "@/data/processData";
import type { Automatisering } from "@/lib/types";
import { ProcessviewerDetailPanel } from "@/components/procesviewer/ProcessviewerDetailPanel";
import { BpmnLegend } from "@/components/procesviewer/BpmnLegend";
import { BpmnToolbar } from "@/components/procesviewer/BpmnToolbar";
import { ProcessCanvas } from "@/components/process/ProcessCanvas";
import { ProcessenEditor } from "@/components/process/ProcessenEditor";

type Mode = "view" | "edit";

function hasSavedProcessSteps(savedState: { steps?: unknown[] } | null | undefined): boolean {
  return Array.isArray(savedState?.steps) && savedState.steps.length > 0;
}

function toCanvasAutomation(a: Automatisering, link?: { fromStepId: string; toStepId: string }) {
  return {
    id:         a.id,
    name:       a.naam,
    team:       "sales" as const,
    tool:       a.source ?? "",
    goal:       a.doel ?? "",
    link:       a.externalId ?? undefined,
    fromStepId: link?.fromStepId,
    toStepId:   link?.toStepId,
  };
}

export default function Procesviewer(): React.ReactNode {
  const { data: allPipelines = [] } = usePipelines();
  const { data: dbAutomations = [] } = useAutomatiseringen();
  const renameCustomPipeline = useRenameCustomPipeline();

  const activePipelines = useMemo(() => allPipelines.filter((p) => p.isActive), [allPipelines]);

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedProcessId, setSelectedProcessId]   = useState<string | null>(null);
  const [mode, setMode]                             = useState<Mode>("view");
  const [editorDirty, setEditorDirty]               = useState(false);

  // Detail panel selection
  const [selectedAutoId, setSelectedAutoId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  // Rename state
  const [renaming, setRenaming]       = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef                = useRef<HTMLInputElement>(null);

  const selectedPipeline = activePipelines.find((p) => p.pipelineId === selectedPipelineId);
  const isCustomPipeline = selectedPipeline?.source === "custom";

  function handlePipelineChange(id: string) {
    setSelectedPipelineId(id);
    setSelectedProcessId(id);
    setMode("view");
    setEditorDirty(false);
    setRenaming(false);
    setSelectedAutoId(null);
    setSelectedStepId(null);
  }

  function startRename() {
    if (!selectedPipeline || !isCustomPipeline) return;
    setRenameValue(selectedPipeline.naam);
    setRenaming(true);
  }

  useEffect(() => {
    if (renaming) renameInputRef.current?.select();
  }, [renaming]);

  function cancelRename() { setRenaming(false); }

  async function commitRename() {
    const trimmed = renameValue.trim();
    if (!selectedPipelineId || !trimmed || trimmed === selectedPipeline?.naam) {
      setRenaming(false);
      return;
    }
    try {
      await renameCustomPipeline.mutateAsync({ pipelineId: selectedPipelineId, naam: trimmed });
    } finally {
      setRenaming(false);
    }
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter")  { e.preventDefault(); commitRename(); }
    if (e.key === "Escape") cancelRename();
  }

  const { data: savedState } = useProcessState(
    mode === "view" ? selectedProcessId : null,
  );

  const derivedProcessState: ProcessState | null = useMemo(() => {
    const currentPipeline = activePipelines.find((p) => p.pipelineId === selectedProcessId);
    if (hasSavedProcessSteps(savedState)) {
      const autos = dbAutomations.map((a) =>
        toCanvasAutomation(a, savedState.autoLinks[a.id]),
      );
      return buildProcessStateFromSaved(savedState, autos);
    }
    if (currentPipeline?.stages?.length) {
      return stagesToProcessState(currentPipeline);
    }
    return null;
  }, [savedState, selectedProcessId, activePipelines, dbAutomations]);

  const processState = derivedProcessState;

  useEffect(() => {
    Sentry.setContext("process_viewer", {
      selectedProcessId,
      selectedProcessName: selectedPipeline?.naam ?? null,
      steps: processState?.steps.length ?? 0,
      connections: processState?.connections.length ?? 0,
      activeLanes: processState?.activeLanes?.length ?? null,
      mode,
    });
  }, [
    selectedProcessId,
    selectedPipeline?.naam,
    processState?.steps.length,
    processState?.connections.length,
    processState?.activeLanes?.length,
    mode,
  ]);

  function handleEnterEdit() {
    if (!selectedProcessId) return;
    setMode("edit");
  }

  function handleLeaveEdit() {
    setMode("view");
    setEditorDirty(false);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] min-h-0">
      {/* Selector bar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-card">
        <Workflow className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* ── Pipeline picker ── */}
        {renaming ? (
          /* Inline rename input */
          <div className="flex items-center gap-1">
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={commitRename}
              className="h-8 w-[200px] rounded-md border border-ring bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              maxLength={80}
            />
            <button
              onMouseDown={(e) => { e.preventDefault(); commitRename(); }}
              disabled={renameCustomPipeline.isPending}
              className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
              title="Opslaan"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); cancelRename(); }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
              title="Annuleren"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : selectedPipeline ? (
          /* Selected: name text (click to rename if custom) + chevron to switch */
          <div className={`flex items-center rounded-md border border-input bg-background text-sm ${mode === "edit" ? "opacity-60 pointer-events-none" : ""}`}>
            <button
              onClick={isCustomPipeline ? startRename : undefined}
              className={`h-8 max-w-[180px] truncate px-3 text-left leading-none ${isCustomPipeline ? "hover:text-foreground cursor-text" : "cursor-default"} text-foreground`}
              title={isCustomPipeline ? "Klik om naam te wijzigen" : selectedPipeline.naam}
              tabIndex={isCustomPipeline ? 0 : -1}
            >
              {selectedPipeline.naam}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-8 w-7 items-center justify-center border-l border-input text-muted-foreground hover:bg-secondary hover:text-foreground rounded-r-md">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px]">
                {activePipelines.map((p) => (
                  <DropdownMenuItem
                    key={p.pipelineId}
                    onSelect={() => handlePipelineChange(p.pipelineId)}
                    className={p.pipelineId === selectedPipelineId ? "font-semibold" : ""}
                  >
                    {p.naam}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          /* Nothing selected: full dropdown */
          <Select value="" onValueChange={handlePipelineChange}>
            <SelectTrigger className="w-[200px] h-8 text-sm">
              <SelectValue placeholder="Kies een pipeline…" />
            </SelectTrigger>
            <SelectContent>
              {activePipelines.map((p) => (
                <SelectItem key={p.pipelineId} value={p.pipelineId}>
                  {p.naam}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}


        <div className="ml-auto flex items-center gap-2">
          {mode === "view" && selectedProcessId && !renaming && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-sm" onClick={handleEnterEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Bewerken
            </Button>
          )}
          {mode === "edit" && (
            <>
              {editorDirty && (
                <span className="text-xs text-amber-600 font-medium">Niet-opgeslagen wijzigingen</span>
              )}
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-sm" onClick={handleLeaveEdit}>
                <Eye className="h-3.5 w-3.5" />
                Terug naar viewer
              </Button>
            </>
          )}
          {!selectedPipeline && !renaming && (
            <span className="text-xs text-muted-foreground">
              Selecteer een pipeline om te beginnen
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {mode === "edit" && selectedProcessId ? (
        <div className="flex-1 min-h-0">
          <ProcessenEditor
            pipelineId={selectedProcessId}
            onSwitchPipeline={handlePipelineChange}
            onDirtyChange={setEditorDirty}
            displayStyle="viewer"
          />
        </div>
      ) : processState ? (
        <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
          <SharedProcessViewerCanvas
            processState={processState}
            onStepClick={(stepId) => { setSelectedStepId(stepId); setSelectedAutoId(null); }}
            onAutomationClick={(automationId) => { setSelectedAutoId(automationId); setSelectedStepId(null); }}
          />
          <ProcessviewerDetailPanel
            selectedAutoId={selectedAutoId}
            selectedStepId={selectedStepId}
            dbAutomations={dbAutomations}
            canvasAutomations={processState.automations}
            steps={processState.steps}
            connections={processState.connections}
            attachments={processState.attachments ?? []}
            customLanes={processState.customLanes ?? []}
            onClose={() => { setSelectedAutoId(null); setSelectedStepId(null); }}
            onSelectAuto={(id) => { setSelectedAutoId(id); setSelectedStepId(null); }}
          />
        </div>
      ) : (
        <EmptyState hasSelection={!!selectedProcessId} />
      )}
    </div>
  );
}

function SharedProcessViewerCanvas({
  processState,
  onStepClick,
  onAutomationClick,
}: {
  processState: ProcessState;
  onStepClick: (stepId: string) => void;
  onAutomationClick: (automationId: string) => void;
}): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const visibleLanes = useMemo(() => {
    const allLaneKeys = buildLaneKeys(processState.customLanes);
    const active = processState.activeLanes?.length
      ? filterValidActiveLanes(processState.activeLanes, processState.customLanes)
      : allLaneKeys;
    return active.filter((lane) => processState.steps.some((step) => step.team === lane));
  }, [processState.activeLanes, processState.customLanes, processState.steps]);

  const legendLanes = useMemo(
    () => visibleLanes.map((key) => {
      const config = getLaneConfig(key, processState.customLanes ?? []);
      return { name: config.label, color: config.stroke };
    }),
    [visibleLanes, processState.customLanes],
  );

  const applyZoom = useCallback((delta: number, clientX?: number, clientY?: number) => {
    setZoom((current) => {
      const next = Math.min(1.8, Math.max(0.45, Number((current + delta).toFixed(2))));
      if (next === current) return current;

      if (clientX !== undefined && clientY !== undefined && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const cx = clientX - rect.left;
        const cy = clientY - rect.top;
        setPan((currentPan) => ({
          x: cx - (cx - currentPan.x) * (next / current),
          y: cy - (cy - currentPan.y) * (next / current),
        }));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      applyZoom(event.deltaY < 0 ? 0.1 : -0.1, event.clientX, event.clientY);
    }
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      const drag = panRef.current;
      if (!drag) return;
      setPan({
        x: drag.panX + event.clientX - drag.startX,
        y: drag.panY + event.clientY - drag.startY,
      });
    }
    function onMouseUp() {
      panRef.current = null;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 24, y: 24 });
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,input,textarea,select,a")) return;
    panRef.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
  }, [pan.x, pan.y]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-h-0 overflow-hidden select-none bg-slate-50"
      data-testid="procesviewer-shared-viewport"
      onMouseDown={handleMouseDown}
      style={{
        backgroundImage: "repeating-linear-gradient(0deg, rgba(15,23,42,0.04) 0px, transparent 1px, transparent 28px), repeating-linear-gradient(90deg, rgba(15,23,42,0.04) 0px, transparent 1px, transparent 28px)",
        backgroundSize: "28px 28px",
        cursor: panRef.current ? "grabbing" : "grab",
      }}
    >
      <div
        data-testid="procesviewer-shared-viewport-inner"
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <ProcessCanvas
          steps={processState.steps}
          connections={processState.connections}
          automations={processState.automations}
          attachments={processState.attachments ?? []}
          artifacts={processState.artifacts ?? []}
          activeLanes={processState.activeLanes}
          customLanes={processState.customLanes}
          displayStyle="viewer"
          readOnly
          showLegend={false}
          onStepClick={(step) => onStepClick(step.id)}
          onAutomationClick={(automation) => onAutomationClick(automation.id)}
        />
      </div>

      <BpmnToolbar
        zoom={zoom}
        onZoomIn={() => applyZoom(0.1)}
        onZoomOut={() => applyZoom(-0.1)}
        onReset={resetView}
        onFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
      />
      <BpmnLegend lanes={legendLanes} />
    </div>
  );
}

function EmptyState({ hasSelection }: { hasSelection: boolean }): React.ReactNode {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Workflow className="h-10 w-10 opacity-20" />
      <p className="text-sm">
        {hasSelection
          ? "Geen procesdata gevonden voor deze pipeline."
          : "Selecteer een pipeline en proces om de viewer te openen."}
      </p>
    </div>
  );
}
