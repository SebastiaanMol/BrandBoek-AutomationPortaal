import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useBlocker } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RotateCcw, Save, ImageDown, FileDown, ChevronDown, HelpCircle, X, Rows3, Plus, Pencil, Download, Upload } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProcessCanvas } from "@/components/process/ProcessCanvas";
import { UnassignedPanel } from "@/components/process/UnassignedPanel";
import { AutomationDetailPanel } from "@/components/process/AutomationDetailPanel";
import { StepDialog } from "@/components/process/StepDialog";
import type { ProcessStep, Automation, TeamKey, ProcessState, CustomLane } from "@/data/processData";
import {
  buildLaneKeys,
  CUSTOM_LANE_PALETTE,
  filterValidActiveLanes,
  getLaneConfig,
  initialState,
  isPresetLaneKey,
  stagesToProcessState,
  TEAM_CONFIG,
  TEAM_ORDER,
  upsertCustomLaneConfig,
} from "@/data/processData";
import { useAutomatiseringen } from "@/lib/queryHooks/automations";
import { usePipelines } from "@/lib/queryHooks/pipelines";
import { useProcessState } from "@/lib/queryHooks/processState";
import type { Automatisering, KlantFase } from "@/lib/types";
import { saveProcessState } from "@/lib/storage/processState";
import { detectDrift } from "@/lib/processDrift";
import { StepStagingPanel } from "@/components/process/StepStagingPanel";
import { exportProcessCanvasPdf, exportProcessCanvasPng } from "@/lib/processExport";
import { exportProcessBackup, importProcessBackup } from "@/lib/processBackup";
import { buildSavedProcessState, restoreSavedProcessState } from "@/lib/processStateMapping";

const FASE_TO_TEAM: Record<KlantFase, TeamKey> = {
  Marketing:   "marketing",
  Sales:       "sales",
  Onboarding:  "onboarding",
  Boekhouding: "boekhouding",
  Offboarding: "management",
};

function toCanvasAutomation(a: Automatisering, existing?: Automation): Automation {
  return {
    id:         a.id,
    name:       a.naam,
    team:       FASE_TO_TEAM[a.fasen?.[0]] ?? "management",
    tool:       a.systemen?.[0] ?? "Anders",
    goal:       a.doel ?? "",
    fromStepId: existing?.fromStepId,
    toStepId:   existing?.toStepId,
  };
}

interface ProcessenEditorProps {
  pipelineId: string;
  onSwitchPipeline: (id: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  displayStyle?: "viewer";
}

export function ProcessenEditor({ pipelineId, onSwitchPipeline, onDirtyChange, displayStyle }: ProcessenEditorProps) {

  const queryClient = useQueryClient();
  const [state, setState]     = useState<ProcessState>(initialState);
  const [saved, setSaved]     = useState<ProcessState>(initialState);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const blocker = useBlocker(isDirty);
  const [loading, setLoading] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const savedLinksRef        = useRef<Record<string, { fromStepId: string; toStepId: string }>>({});
  const savedParkedStepsRef  = useRef<ProcessStep[]>([]);
  const fileInputRef         = useRef<HTMLInputElement>(null);

  const [parkedSteps, setParkedSteps]           = useState<ProcessStep[]>([]);
  const [rightTab, setRightTab]                 = useState<"automations" | "stappen">("automations");
  const [dismissedRenames, setDismissedRenames] = useState<Set<string>>(new Set());
  const [activeLanes, setActiveLanes]           = useState<string[]>([...TEAM_ORDER]);
  const [customLanes, setCustomLanes]           = useState<CustomLane[]>([]);
  const [newLaneDialogOpen, setNewLaneDialogOpen] = useState(false);
  const [newLaneName, setNewLaneName]             = useState("");
  const [renameLaneKey, setRenameLaneKey]         = useState<string | null>(null);
  const [renameLaneName, setRenameLaneName]       = useState("");

  const { data: allPipelines = [] } = usePipelines();
  const pipelines = allPipelines.filter(p => p.isActive);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [pendingPipelineId, setPendingPipelineId] = useState<string | null>(null);

  function handleSwitchPipeline(newId: string) {
    if (newId === pipelineId) return;
    if (isDirty) {
      setPendingPipelineId(newId);
      setConfirmSwitch(true);
    } else {
      onSwitchPipeline(newId);
    }
  }

  const { data: savedState, isLoading: stateLoading } = useProcessState(pipelineId);

  // Reset state when pipeline changes — seed with stages so the canvas isn't blank while loading
  useEffect(() => {
    const pipeline = pipelines.find(p => p.pipelineId === pipelineId) ?? null;
    const baseState = pipeline && pipeline.stages.length > 0
      ? stagesToProcessState(pipeline)
      : initialState;
    savedLinksRef.current = {};
    setState(baseState);
    setSaved(baseState);
    setParkedSteps([]);
    setDismissedRenames(new Set());
    setActiveLanes([...TEAM_ORDER]);
    setCustomLanes([]);
    setIsDirty(false);
    setLoading(true);
  }, [pipelineId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply saved state when data loads
  useEffect(() => {
    if (stateLoading) return;
    setLoading(false);
    if (!savedState) {
      // No saved canvas — initialize from stages if available
      const pipeline = pipelines.find(p => p.pipelineId === pipelineId) ?? null;
      if (pipeline && pipeline.stages.length > 0) {
        const stagesState = stagesToProcessState(pipeline);
        setState(stagesState);
        setSaved(stagesState);
      }
      return;
    }
    savedLinksRef.current = savedState.autoLinks;
    setState(prev => ({
      ...prev,
      steps:       savedState.steps       as ProcessState["steps"],
      connections: savedState.connections as ProcessState["connections"],
    }));
    setSaved(s => ({
      ...s,
      steps:       savedState.steps       as ProcessState["steps"],
      connections: savedState.connections as ProcessState["connections"],
    }));
    const restoredParked = savedState.parkedSteps as ProcessStep[];
    setParkedSteps(restoredParked);
    savedParkedStepsRef.current = restoredParked;
    const restoredCustom = (savedState.customLanes ?? []) as CustomLane[];
    setCustomLanes(restoredCustom);
    if (savedState.activeLanes) {
      setActiveLanes(filterValidActiveLanes(savedState.activeLanes, restoredCustom));
    } else {
      setActiveLanes(buildLaneKeys(restoredCustom));
    }
    setIsDirty(false);
  }, [savedState, stateLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load real automations from Supabase and merge with saved links ──────────
  const { data: dbAutomations } = useAutomatiseringen();
  useEffect(() => {
    if (!dbAutomations) return;
    if (loading) return; // wait for fetchProcessState to populate savedLinksRef
    setState(prev => ({
      ...prev,
      automations: dbAutomations.map(a => {
        const existing  = prev.automations.find(x => x.id === a.id);
        const savedLink = savedLinksRef.current[a.id];
        return toCanvasAutomation(a, existing ?? (savedLink ? { ...savedLink } as Automation : undefined));
      }),
    }));
  }, [dbAutomations, loading]);

  // UI state
  const [selectedAuto, setSelectedAuto] = useState<Automation | null>(null);
  const [editingStep, setEditingStep]   = useState<ProcessStep | null>(null);
  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [stepDefaults, setStepDefaults] = useState<{ team?: string; column?: number; row?: number; type?: ProcessStep["type"] }>({});

  // Notify parent when dirty state changes
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // ── Dirty tracking helper ──────────────────────────────────────────────────
  function update(fn: (s: ProcessState) => ProcessState) {
    setState(prev => { const next = fn(prev); setIsDirty(true); return next; });
  }

  // ── Save / Reset ───────────────────────────────────────────────────────────
  async function handleSave() {
    try {
      await saveProcessState(
        pipelineId,
        buildSavedProcessState(state, parkedSteps, activeLanes, customLanes),
      );
      setSaved(state);
      savedParkedStepsRef.current = parkedSteps;
      setIsDirty(false);
      toast.success("Proceskaart opgeslagen");
      queryClient.invalidateQueries({ queryKey: ["processState", pipelineId] });
    } catch (err) {
      console.error(err);
      toast.error("Opslaan mislukt — controleer de database");
    }
  }

  function handleReset() {
    setState(prev => restoreSavedProcessState(prev, saved));
    setParkedSteps(savedParkedStepsRef.current);
    setIsDirty(false);
    toast.info("Teruggezet naar opgeslagen versie");
  }

  async function exportPng() {
    try {
      await exportProcessCanvasPng();
      toast.success("PNG gedownload");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export mislukt");
      if (!(err instanceof Error) || err.message !== "Canvas niet gevonden") console.error(err);
    }
  }

  async function exportPdf() {
    try {
      await exportProcessCanvasPdf();
      toast.success("PDF gedownload");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export mislukt");
      if (!(err instanceof Error) || err.message !== "Canvas niet gevonden") console.error(err);
    }
  }

  function handleExportBackup() {
    const pipeline = pipelines.find(p => p.pipelineId === pipelineId);
    const autoLinks: Record<string, { fromStepId: string; toStepId: string }> = {};
    state.automations.forEach(a => {
      if (a.fromStepId && a.toStepId) {
        autoLinks[a.id] = { fromStepId: a.fromStepId, toStepId: a.toStepId };
      }
    });
    exportProcessBackup(pipeline?.naam ?? pipelineId, {
      steps:       state.steps,
      connections: state.connections,
      autoLinks,
      parkedSteps,
      activeLanes,
      customLanes,
    });
    toast.success("Backup gedownload als JSON");
  }

  async function handleImportBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    try {
      const savedState = await importProcessBackup(file);
      const restoredAutos = state.automations.map(a => ({
        ...a,
        fromStepId: savedState.autoLinks[a.id]?.fromStepId,
        toStepId:   savedState.autoLinks[a.id]?.toStepId,
      }));
      setState(prev => ({
        ...prev,
        steps:       savedState.steps       as ProcessStep[],
        connections: savedState.connections as ProcessState["connections"],
        automations: restoredAutos,
      }));
      const restoredCustomLanes = savedState.customLanes as CustomLane[] | undefined;
      if (restoredCustomLanes) setCustomLanes(restoredCustomLanes);
      if (savedState.activeLanes) {
        setActiveLanes(filterValidActiveLanes(savedState.activeLanes, restoredCustomLanes ?? []));
      }
      setParkedSteps(savedState.parkedSteps as ProcessStep[]);
      setIsDirty(true);
      toast.success("Backup geladen — controleer en klik Opslaan om op te slaan");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Importeren mislukt");
    }
  }

  // ── Step handlers ──────────────────────────────────────────────────────────
  const handleStepClick = useCallback((step: ProcessStep) => {
    if (step.type === "start" || step.type === "end") return;
    setEditingStep(step);
    setStepDialogOpen(true);
  }, []);

  function handleSaveStep(step: ProcessStep) {
    update(s => ({
      ...s,
      steps: s.steps.find(x => x.id === step.id)
        ? s.steps.map(x => x.id === step.id ? step : x)
        : [...s.steps, step],
    }));
    toast.success(editingStep ? "Stap bijgewerkt" : "Stap toegevoegd");
    setEditingStep(null);
  }

  function handleDeleteStep(id: string) {
    update(s => ({
      steps: s.steps.filter(x => x.id !== id),
      connections: s.connections.filter(c => c.fromStepId !== id && c.toStepId !== id),
      automations: s.automations.map(a =>
        a.fromStepId === id || a.toStepId === id
          ? { ...a, fromStepId: undefined, toStepId: undefined }
          : a,
      ),
    }));
    toast.success("Stap verwijderd");
  }

  function handleAddStep(team: string, column: number, row: number, type: ProcessStep["type"] = "task") {
    if (type === "start" || type === "end") {
      update(s => ({
        ...s,
        steps: [...s.steps, {
          id:     `ev-${type}-${Date.now()}`,
          label:  type === "start" ? "Start" : "Einde",
          team,
          column,
          type,
        }],
      }));
      return;
    }
    setStepDefaults({ team, column, row, type });
    setEditingStep(null);
    setStepDialogOpen(true);
  }

  function handleAddEventStep(type: "start" | "end") {
    if (type === "start") {
      // Find existing start events and stack the new one below the last one
      update(s => {
        const existingStarts = s.steps.filter(x => x.type === "start");
        const last = existingStarts.length > 0
          ? existingStarts.reduce((a, b) => (b.row ?? 0) > (a.row ?? 0) ? b : a)
          : null;
        return {
          ...s,
          steps: [...s.steps, {
            id:     `ev-start-${Date.now()}`,
            label:  "Start",
            type:   "start" as const,
            team:   last ? last.team : ("marketing" as TeamKey),
            column: last ? last.column : 0,
            row:    last ? (last.row ?? 0) + 1 : 0,
          }],
        };
      });
      return;
    }
    // End event: place at far right
    const col = maxColumn + 1;
    update(s => ({
      ...s,
      steps: [...s.steps, {
        id:    `ev-end-${Date.now()}`,
        label: "Einde",
        team:  "management" as TeamKey,
        column: col,
        type:  "end" as const,
      }],
    }));
  }

  function handleMoveStep(stepId: string, newTeam: string, newColumn: number, newRow: number = 0) {
    update(s => {
      const moving = s.steps.find(x => x.id === stepId);
      if (!moving) return s;

      // Event markers (start/end) move freely — no column slide, just reposition.
      if (moving.type === "start" || moving.type === "end") {
        return {
          ...s,
          steps: s.steps.map(x =>
            x.id === stepId ? { ...x, team: newTeam, column: newColumn, row: newRow } : x
          ),
        };
      }

      // Regular steps: swap with whatever occupies the target cell (same team + column + row)
      const target = s.steps.find(x => x.team === newTeam && x.column === newColumn && (x.row ?? 0) === newRow && x.id !== stepId);
      return {
        ...s,
        steps: s.steps.map(x => {
          if (x.id === stepId) return { ...x, team: newTeam, column: newColumn, row: newRow };
          if (target && x.id === target.id) return { ...x, team: moving.team, column: moving.column, row: moving.row ?? 0 };
          return x;
        }),
      };
    });
  }

  // ── Connection handlers ────────────────────────────────────────────────────
  function handleAddConnection(fromId: string, toId: string) {
    update(s => {
      const exists = s.connections.some(c => c.fromStepId === fromId && c.toStepId === toId);
      if (exists) return s;
      return {
        ...s,
        connections: [...s.connections, { id: `c-${Date.now()}`, fromStepId: fromId, toStepId: toId }],
      };
    });
  }

  function handleDeleteConnection(id: string) {
    update(s => {
      const conn = s.connections.find(c => c.id === id);
      // If it's a step-to-step connection, detach any automations that sit on it
      const updatedAutos = conn?.fromStepId
        ? s.automations.map(a =>
            a.fromStepId === conn.fromStepId && a.toStepId === conn.toStepId
              ? { ...a, fromStepId: undefined, toStepId: undefined }
              : a,
          )
        : s.automations;
      return { ...s, connections: s.connections.filter(c => c.id !== id), automations: updatedAutos };
    });
    toast.success("Verbinding verwijderd");
  }

  // ── Automation handlers ────────────────────────────────────────────────────
  const handleAutoClick = useCallback((a: Automation) => {
    setSelectedAuto(a);
  }, []);

  function handleAttach(autoId: string, fromStepId: string, toStepId: string) {
    update(s => ({
      ...s,
      automations: s.automations.map(a =>
        a.id === autoId ? { ...a, fromStepId, toStepId } : a,
      ),
    }));
    toast.success("Automation gekoppeld");
  }

  function handleDetach(autoId: string) {
    update(s => ({
      ...s,
      automations: s.automations.map(a =>
        a.id === autoId ? { ...a, fromStepId: undefined, toStepId: undefined } : a,
      ),
    }));
    toast.success("Automation losgekoppeld");
  }

  // ── Staging area handlers ─────────────────────────────────────────────────
  function handleParkStep(stepId: string) {
    // Quick bail: avoid marking dirty if the step is no longer on the canvas
    if (!state.steps.some(s => s.id === stepId)) return;
    // Read the step inside the updater so the functional state is authoritative
    let capturedStep: ProcessStep | undefined;
    update(s => {
      capturedStep = s.steps.find(x => x.id === stepId);
      if (!capturedStep) return s; // concurrent removal — leave state unchanged
      return {
        ...s,
        steps: s.steps.filter(x => x.id !== stepId),
        connections: s.connections.filter(c => c.fromStepId !== stepId && c.toStepId !== stepId),
        automations: s.automations.map(a =>
          a.fromStepId === stepId || a.toStepId === stepId
            ? { ...a, fromStepId: undefined, toStepId: undefined }
            : a,
        ),
      };
    });
    if (capturedStep) {
      setParkedSteps(prev => [...prev, capturedStep!]);
      toast.info(`"${capturedStep!.label}" geparkeerd`);
    }
  }

  function handlePlaceStep(step: ProcessStep, team: string, column: number, row: number) {
    const placed = { ...step, team, column, row };
    update(s => ({
      ...s,
      // Guard against double-placement (e.g. rapid double-drop)
      steps: s.steps.some(x => x.id === step.id) ? s.steps : [...s.steps, placed],
    }));
    setParkedSteps(prev => prev.filter(p => p.id !== step.id));
    toast.success(`"${step.label}" geplaatst`);
  }

  function handleApplyRename(stepId: string, newLabel: string) {
    update(s => ({
      ...s,
      steps: s.steps.map(x => x.id === stepId ? { ...x, label: newLabel } : x),
    }));
    setDismissedRenames(prev => new Set([...prev, stepId]));
    toast.success("Stap hernoemd");
  }

  function handleDismissRename(stepId: string) {
    setDismissedRenames(prev => new Set([...prev, stepId]));
  }

  // ── Swimlane toggle / add / delete ────────────────────────────────────────
  function handleToggleLane(laneKey: string) {
    const isActive = activeLanes.includes(laneKey);
    if (isActive) {
      // Park steps that belong to this lane before hiding it
      const stepsInLane = state.steps.filter(s => s.team === laneKey);
      if (stepsInLane.length > 0) {
        update(s => ({
          ...s,
          steps: s.steps.filter(x => x.team !== laneKey),
          connections: s.connections.filter(c =>
            !stepsInLane.some(sl => sl.id === c.fromStepId || sl.id === c.toStepId)
          ),
          automations: s.automations.map(a =>
            stepsInLane.some(sl => sl.id === a.fromStepId || sl.id === a.toStepId)
              ? { ...a, fromStepId: undefined, toStepId: undefined }
              : a,
          ),
        }));
        setParkedSteps(prev => [...prev, ...stepsInLane]);
      }
      setActiveLanes(prev => prev.filter(l => l !== laneKey));
    } else {
      // Re-add the lane — preserve current order, append if new
      const allKeys = buildLaneKeys(customLanes);
      setActiveLanes(allKeys.filter(l => l === laneKey || activeLanes.includes(l)));
    }
    setIsDirty(true);
  }

  function handleAddCustomLane() {
    const name = newLaneName.trim();
    if (!name) return;
    const paletteIdx = customLanes.length % CUSTOM_LANE_PALETTE.length;
    const newLane: CustomLane = {
      key: `custom-${Date.now()}`,
      label: name,
      ...CUSTOM_LANE_PALETTE[paletteIdx],
    };
    setCustomLanes(prev => [...prev, newLane]);
    setActiveLanes(prev => [...prev, newLane.key]);
    setNewLaneName("");
    setNewLaneDialogOpen(false);
    setIsDirty(true);
  }

  function handleOpenRenameLane(laneKey: string) {
    const cfg = getLaneConfig(laneKey, customLanes);
    setRenameLaneKey(laneKey);
    setRenameLaneName(cfg.label);
  }

  function handleRenameLane() {
    if (!renameLaneKey) return;
    const name = renameLaneName.trim();
    if (!name) return;
    const current = getLaneConfig(renameLaneKey, customLanes);
    setCustomLanes(prev => upsertCustomLaneConfig(prev, { ...current, label: name }));
    setRenameLaneKey(null);
    setRenameLaneName("");
    setIsDirty(true);
    toast.success("Swimlane hernoemd");
  }

  function handleInsertRowAfter(team: string, afterRow: number) {
    const insertRow = afterRow + 1;
    const shifted = state.steps.map((s) =>
      s.team === team && (s.row ?? 0) >= insertRow ? { ...s, row: (s.row ?? 0) + 1 } : s,
    );
    const firstColInRow = state.steps
      .filter((s) => s.team === team && (s.row ?? 0) === afterRow)
      .map((s) => s.column)[0] ?? 0;
    const newStep: import("@/data/processData").ProcessStep = {
      id: `step-${Date.now()}`,
      label: "Nieuwe stap",
      team,
      column: firstColInRow,
      row: insertRow,
      type: "task",
    };
    setState(prev => ({ ...prev, steps: [...shifted, newStep] }));
    setIsDirty(true);
  }

  function handleMoveLane(laneKey: string, direction: -1 | 1) {
    setActiveLanes(prev => {
      const idx = prev.indexOf(laneKey);
      if (idx === -1) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
    setIsDirty(true);
  }

  function handleDeleteCustomLane(laneKey: string) {
    // Park steps in this lane, then remove the lane entirely
    const stepsInLane = state.steps.filter(s => s.team === laneKey);
    if (stepsInLane.length > 0) {
      update(s => ({
        ...s,
        steps: s.steps.filter(x => x.team !== laneKey),
        connections: s.connections.filter(c =>
          !stepsInLane.some(sl => sl.id === c.fromStepId || sl.id === c.toStepId)
        ),
        automations: s.automations.map(a =>
          stepsInLane.some(sl => sl.id === a.fromStepId || sl.id === a.toStepId)
            ? { ...a, fromStepId: undefined, toStepId: undefined }
            : a,
        ),
      }));
      setParkedSteps(prev => [...prev, ...stepsInLane]);
    }
    setCustomLanes(prev => prev.filter(l => l.key !== laneKey));
    setActiveLanes(prev => prev.filter(l => l !== laneKey));
    setIsDirty(true);
  }

  function handleAddBranch(automationId: string, toStepId: string) {
    // Branch = a regular Connection with fromAutomationId instead of fromStepId
    const newConn = {
      id: `b-${Date.now()}`,
      fromAutomationId: automationId,
      toStepId,
      label: "",
    };
    update(s => ({ ...s, connections: [...s.connections, newConn] }));
    // Open detail panel for the automation
    const auto = state.automations.find(a => a.id === automationId);
    if (auto) setSelectedAuto(auto);
  }

  function handleUpdateConnectionLabel(connId: string, label: string) {
    update(s => ({
      ...s,
      connections: s.connections.map(c => c.id === connId ? { ...c, label } : c),
    }));
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const maxColumn = state.steps.reduce((m, s) => Math.max(m, s.column), 0);
  const breadcrumb  = TEAM_ORDER.map(t => TEAM_CONFIG[t].label).join(" → ");

  const currentPipeline = useMemo(
    () => pipelines.find(p => p.pipelineId === pipelineId) ?? null,
    [pipelines, pipelineId],
  );

  const { driftNew, driftRenamed } = useMemo(
    () => {
      if (!currentPipeline || loading) return { driftNew: [], driftRenamed: [] };
      const { driftNew, driftRenamed: all } = detectDrift(state.steps, currentPipeline);
      return { driftNew, driftRenamed: all.filter(r => !dismissedRenames.has(r.stepId)) };
    },
    [state.steps, currentPipeline, loading, dismissedRenames],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 py-3 border-b border-border bg-card flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
                  {pipelines.find(p => p.pipelineId === pipelineId)?.naam ?? "Pipeline"}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {pipelines.map(p => (
                  <DropdownMenuItem
                    key={p.pipelineId}
                    onClick={() => handleSwitchPipeline(p.pipelineId)}
                    className={p.pipelineId === pipelineId ? "font-semibold" : ""}
                  >
                    {p.naam}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <h1 className="text-base font-bold">Bewerken</h1>
            {isDirty && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border border-amber-200">
                Niet opgeslagen
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                <FileDown className="h-3.5 w-3.5" />
                Export
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportPng} className="gap-2">
                <ImageDown className="h-4 w-4" />
                PNG downloaden
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportPdf} className="gap-2">
                <FileDown className="h-4 w-4" />
                PDF downloaden
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportBackup} className="gap-2">
                <Download className="h-4 w-4" />
                Backup als JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost" size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            title="Importeer een JSON backup"
          >
            <Upload className="h-3.5 w-3.5" />
            Importeer
          </Button>

          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} disabled={!isDirty}
            className="gap-1.5 text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>

          <Button size="sm" onClick={() => handleSave()} disabled={!isDirty} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            Opslaan
          </Button>

          {/* ── Element palette ─────────────────────────────────────────── */}
          <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-7 px-2.5 text-xs font-medium">
                <Plus className="h-3.5 w-3.5" />
                Toevoegen
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-3">
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Events</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { type: "start",     label: "Start",     icon: <><circle cx="8" cy="8" r="7" fill="#dcfce7" stroke="#16a34a" strokeWidth="1.5"/></>, direct: true },
                      { type: "end",       label: "Einde",     icon: <><circle cx="8" cy="8" r="7" fill="#fee2e2" stroke="#dc2626" strokeWidth="2"/></>, direct: true },
                      { type: "terminate", label: "Terminate", icon: <><circle cx="8" cy="8" r="7" fill="white" stroke="#dc2626" strokeWidth="2"/><circle cx="8" cy="8" r="3.5" fill="#dc2626"/></>, direct: false },
                      { type: "send",      label: "Sturen",    icon: <><circle cx="8" cy="8" r="7" fill="white" stroke="#64748b" strokeWidth="1.5"/><rect x="3" y="5" width="10" height="7" rx="1" fill="#64748b"/><polyline points="3,5 8,9.5 13,5" stroke="white" strokeWidth="1.2" fill="none"/></>, direct: false },
                      { type: "receive",   label: "Ontv.",     icon: <><circle cx="8" cy="8" r="7" fill="white" stroke="#64748b" strokeWidth="1.5"/><rect x="3" y="5" width="10" height="7" rx="1" fill="none" stroke="#64748b" strokeWidth="1.2"/><polyline points="3,5 8,9.5 13,5" stroke="#64748b" strokeWidth="1.2" fill="none"/></>, direct: false },
                    ] as { type: ProcessStep["type"]; label: string; icon: React.ReactNode; direct: boolean }[]).map(({ type, label, icon, direct }) => (
                      <button
                        key={type}
                        type="button"
                        draggable
                        onDragStart={(e: React.DragEvent) => e.dataTransfer.setData("newStep", type!)}
                        onClick={() => {
                          setPaletteOpen(false);
                          if (direct) handleAddEventStep(type as "start" | "end");
                          else { setStepDefaults({ type }); setEditingStep(null); setStepDialogOpen(true); }
                        }}
                        className="flex flex-col items-center gap-1 rounded-md border border-border px-1 py-1.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground cursor-grab active:cursor-grabbing transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0">{icon}</svg>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Gateways</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { type: "decision", label: "XOR", icon: <><polygon points="8,1 15,8 8,15 1,8" fill="white" stroke="#94a3b8" strokeWidth="1.5"/><line x1="4.65" y1="4.65" x2="11.35" y2="11.35" stroke="#64748b" strokeWidth="1.2"/><line x1="11.35" y1="4.65" x2="4.65" y2="11.35" stroke="#64748b" strokeWidth="1.2"/></> },
                      { type: "and",      label: "AND", icon: <><polygon points="8,1 15,8 8,15 1,8" fill="white" stroke="#94a3b8" strokeWidth="1.5"/><line x1="8" y1="3.6" x2="8" y2="12.4" stroke="#64748b" strokeWidth="1.2"/><line x1="3.6" y1="8" x2="12.4" y2="8" stroke="#64748b" strokeWidth="1.2"/></> },
                    ] as { type: ProcessStep["type"]; label: string; icon: React.ReactNode }[]).map(({ type, label, icon }) => (
                      <button
                        key={type}
                        type="button"
                        draggable
                        onDragStart={(e: React.DragEvent) => e.dataTransfer.setData("newStep", type!)}
                        onClick={() => { setPaletteOpen(false); setStepDefaults({ type }); setEditingStep(null); setStepDialogOpen(true); }}
                        className="flex flex-col items-center gap-1 rounded-md border border-border px-1 py-1.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground cursor-grab active:cursor-grabbing transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0">{icon}</svg>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Activiteit</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      draggable
                      onDragStart={(e: React.DragEvent) => e.dataTransfer.setData("newStep", "task")}
                      onClick={() => { setPaletteOpen(false); setStepDefaults({ type: "task" }); setEditingStep(null); setStepDialogOpen(true); }}
                      className="flex flex-col items-center gap-1 rounded-md border border-border px-1 py-1.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground cursor-grab active:cursor-grabbing transition-colors"
                    >
                      <svg width="20" height="14" viewBox="0 0 20 14" className="shrink-0">
                        <rect x="0.5" y="0.5" width="19" height="13" rx="2.5" fill="white" stroke="#e2e8f0"/>
                        <rect x="0" y="0" width="4" height="14" rx="2" fill="#3b82f6"/>
                      </svg>
                      Stap
                    </button>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>


          {/* ── Swimlane toggle ─────────────────────────────────────── */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" title="Swimlanes beheren">
                <Rows3 className="h-3.5 w-3.5" />
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1">
              {/* Active lanes — shown in current order with move controls */}
              {activeLanes.map((laneKey, idx) => {
                const isPreset = isPresetLaneKey(laneKey);
                const cfg = getLaneConfig(laneKey, customLanes);
                return (
                  <div key={laneKey} className="flex items-center gap-0.5 px-1 py-1 rounded hover:bg-muted/50 group">
                    <span className="w-2 h-2 rounded-full shrink-0 mr-1" style={{ background: cfg.stroke }} />
                    <span className="flex-1 text-sm truncate">{cfg.label}</span>
                    <button
                      onClick={e => { e.stopPropagation(); handleOpenRenameLane(laneKey); }}
                      className="p-0.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                      title="Hernoem"
                    ><Pencil className="h-3 w-3" /></button>
                    <button
                      onClick={e => { e.stopPropagation(); handleMoveLane(laneKey, -1); }}
                      disabled={idx === 0}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25 opacity-0 group-hover:opacity-100"
                      title="Omhoog"
                    >↑</button>
                    <button
                      onClick={e => { e.stopPropagation(); handleMoveLane(laneKey, 1); }}
                      disabled={idx === activeLanes.length - 1}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25 opacity-0 group-hover:opacity-100"
                      title="Omlaag"
                    >↓</button>
                    <button
                      onClick={e => { e.stopPropagation(); handleToggleLane(laneKey); }}
                      className="p-0.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                      title="Verberg"
                    ><X className="h-3 w-3" /></button>
                    {!isPreset && (
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteCustomLane(laneKey); }}
                        className="p-0.5 text-destructive/50 hover:text-destructive opacity-0 group-hover:opacity-100"
                        title="Verwijder"
                      >✕</button>
                    )}
                  </div>
                );
              })}

              {/* Hidden lanes */}
              {(() => {
                const allKeys = buildLaneKeys(customLanes);
                const hidden  = allKeys.filter(k => !activeLanes.includes(k));
                if (!hidden.length) return null;
                return (
                  <>
                    <DropdownMenuSeparator className="my-1" />
                    <p className="px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Verborgen</p>
                    {hidden.map(laneKey => {
                      const isPreset = isPresetLaneKey(laneKey);
                      const cfg = getLaneConfig(laneKey, customLanes);
                      return (
                        <div key={laneKey} className="flex items-center gap-1 px-1 py-1 rounded hover:bg-muted/50">
                          <span className="w-2 h-2 rounded-full shrink-0 mr-1 opacity-40" style={{ background: cfg.stroke }} />
                          <span className="flex-1 text-sm text-muted-foreground truncate">{cfg.label}</span>
                          <button
                            onClick={e => { e.stopPropagation(); handleToggleLane(laneKey); }}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                          >Toon</button>
                          {!isPreset && (
                            <button
                              onClick={e => { e.stopPropagation(); handleDeleteCustomLane(laneKey); }}
                              className="p-0.5 text-destructive/50 hover:text-destructive"
                            ><X className="h-3 w-3" /></button>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })()}

              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem onClick={() => setNewLaneDialogOpen(true)} className="gap-2 text-sm font-medium">
                <span className="text-base leading-none">+</span>
                Nieuwe swimlane
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" onClick={() => setHelpOpen(true)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Uitleg">
            <HelpCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Content area ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Canvas */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <div className={`flex-1 overflow-auto ${displayStyle === "viewer" ? "" : "p-4"}`}>
            {loading ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                Proceskaart laden…
              </div>
            ) : null}
            <div className={`process-canvas-wrap overflow-hidden ${displayStyle === "viewer" ? "" : "border border-border rounded-[var(--radius-outer)] bg-card shadow-sm"} ${loading ? "hidden" : ""}`}>
              <ProcessCanvas
                steps={state.steps}
                connections={state.connections}
                automations={state.automations}
                activeLanes={activeLanes}
                customLanes={customLanes}
                displayStyle={displayStyle}
                onRenameLane={displayStyle === "viewer" ? handleOpenRenameLane : undefined}
                onInsertRowAfter={displayStyle === "viewer" ? handleInsertRowAfter : undefined}
                onStepClick={handleStepClick}
                onAutomationClick={handleAutoClick}
                onAddConnection={handleAddConnection}
                onDeleteConnection={handleDeleteConnection}
                onMoveStep={handleMoveStep}
                onAttachAutomation={handleAttach}
                onAddStep={handleAddStep}
                onAddBranch={handleAddBranch}
                onUpdateConnectionLabel={handleUpdateConnectionLabel}
                onParkStep={handleParkStep}
                onDeleteStep={handleDeleteStep}
                onPlaceStagedStep={handlePlaceStep}
              />
            </div>

            {/* Legend */}
            {displayStyle !== "viewer" && (
              <div className="mt-3 flex items-center gap-4 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Tip:</span> Sleep automations naar pijlen ·
                  Sleep stappen om te verplaatsen ·
                  Sleep vanuit het poortje (rechts op een stap) om een verbinding te tekenen ·
                  Dubbelklik op een pijl om te verwijderen
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right panels */}
        {selectedAuto ? (
          <AutomationDetailPanel
            automation={selectedAuto}
            fullData={dbAutomations?.find(a => a.id === selectedAuto?.id)}
            steps={state.steps}
            branchConnections={[
              ...state.connections.filter(c =>
                selectedAuto?.fromStepId && c.fromStepId === selectedAuto.fromStepId && c.toStepId === selectedAuto.toStepId
              ),
              ...state.connections.filter(c => c.fromAutomationId === selectedAuto?.id),
            ]}
            onClose={() => setSelectedAuto(null)}
            onDetach={handleDetach}
          />
        ) : (
          <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col h-full">
            {/* Tab header */}
            <div className="shrink-0 flex border-b border-border">
              <button
                type="button"
                onClick={() => setRightTab("automations")}
                className={[
                  "flex-1 px-3 py-2.5 text-[11px] font-semibold transition-colors border-b-2",
                  rightTab === "automations"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                Automations
              </button>
              <button
                type="button"
                onClick={() => setRightTab("stappen")}
                className={[
                  "flex-1 px-3 py-2.5 text-[11px] font-semibold transition-colors border-b-2 flex items-center justify-center gap-1.5",
                  rightTab === "stappen"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                Stappen
                {(driftNew.length + driftRenamed.length + parkedSteps.length) > 0 && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold">
                    {driftNew.length + driftRenamed.length + parkedSteps.length}
                  </span>
                )}
              </button>
            </div>
            {/* Tab content */}
            {rightTab === "automations" ? (
              <UnassignedPanel
                automations={state.automations}
                steps={state.steps}
                onAutomationClick={handleAutoClick}
              />
            ) : (
              <StepStagingPanel
                driftNew={driftNew}
                driftRenamed={driftRenamed}
                parkedSteps={parkedSteps}
                onApplyRename={handleApplyRename}
                onDismissRename={handleDismissRename}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      <StepDialog
        open={stepDialogOpen}
        step={editingStep}
        maxColumn={maxColumn}
        defaultValues={stepDefaults}
        activeLanes={activeLanes}
        customLanes={customLanes}
        onSave={handleSaveStep}
        onDelete={editingStep ? handleDeleteStep : undefined}
        onClose={() => { setStepDialogOpen(false); setEditingStep(null); }}
      />

      {/* ── Bevestiging Reset ──────────────────────────────────────────── */}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wijzigingen terugzetten?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle niet-opgeslagen wijzigingen worden ongedaan gemaakt. Je keert terug naar de laatste opgeslagen versie.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => { handleReset(); setConfirmReset(false); }}>
              Ja, terugzetten
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Help modal ────────────────────────────────────────────────── */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setHelpOpen(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold">Hoe werkt de proceskaart?</h2>
              <button onClick={() => setHelpOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 text-sm overflow-y-auto max-h-[70vh]">
              <Section title="🗂 Stappen beheren">
                <p>Sleep de knop <strong>"Stap toevoegen"</strong> naar de canvas om een nieuwe stap neer te zetten op de juiste swimlane en kolom. Of klik erop om een stap aan te maken en daarna te verplaatsen.</p>
                <p>Klik op een bestaande stap om hem te <strong>bewerken of te verwijderen</strong>.</p>
                <p>Sleep een stap naar een andere plek om hem te <strong>verplaatsen</strong>.</p>
              </Section>
              <Section title="➡️ Verbindingen tekenen">
                <p>Sleep vanuit het <strong>kleine bolletje rechts</strong> op een stap of event naar een andere stap om een verbinding te tekenen.</p>
                <p><strong>Rechtermuisknop</strong> op een verbindingslijn → "Verbinding verwijderen".</p>
                <p>Klik op een lijn waarop een automation zit om er een <strong>label</strong> aan toe te voegen (bijv. "Ja" of "Nee").</p>
              </Section>
              <Section title="⚡ Automations plaatsen">
                <p>Automations staan rechts in het <strong>paneel "Niet geplaatst"</strong>. Sleep een automation naar een verbindingslijn op de canvas om hem te koppelen.</p>
                <p>Klik op een automation-bolletje om de <strong>details</strong> te zien.</p>
                <p>Hover over een bolletje om de <strong>naam</strong> te zien.</p>
                <p>Sleep vanuit het bolletje rechts op een automation om een <strong>vertakking</strong> te tekenen naar een andere stap.</p>
              </Section>
              <Section title="💾 Opslaan">
                <p>Wijzigingen worden <strong>niet automatisch opgeslagen</strong>. Klik op <strong>"Opslaan"</strong> om de huidige staat op te slaan. De badge "Niet opgeslagen" verdwijnt dan.</p>
                <p>Met <strong>"Reset"</strong> keer je terug naar de laatste opgeslagen versie.</p>
              </Section>
              <Section title="📤 Exporteren">
                <p>Klik op <strong>"Export"</strong> rechtsboven om de proceskaart te downloaden als <strong>PNG</strong> of <strong>PDF</strong>.</p>
              </Section>
            </div>
          </div>
        </div>
      )}


      {/* ── Navigatie blokkeren bij onopgeslagen wijzigingen ─────────── */}
      <AlertDialog open={blocker.state === "blocked"} onOpenChange={() => blocker.reset?.()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Niet-opgeslagen wijzigingen</AlertDialogTitle>
            <AlertDialogDescription>
              Je hebt wijzigingen die nog niet zijn opgeslagen. Als je nu weggaat gaan deze verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Blijven</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>
              Weggaan zonder opslaan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Nieuwe swimlane dialog ───────────────────────────────────── */}
      <AlertDialog open={newLaneDialogOpen} onOpenChange={setNewLaneDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nieuwe swimlane</AlertDialogTitle>
            <AlertDialogDescription>
              Geef de swimlane een naam. Je kunt er daarna stappen in slepen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-0 py-2">
            <input
              autoFocus
              type="text"
              value={newLaneName}
              onChange={e => setNewLaneName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAddCustomLane(); }}
              placeholder="bijv. Klantenservice"
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNewLaneName("")}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleAddCustomLane} disabled={!newLaneName.trim()}>
              Toevoegen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bevestiging pipeline wisselen ──────────────────────────────── */}
      <AlertDialog
        open={!!renameLaneKey}
        onOpenChange={open => {
          if (!open) {
            setRenameLaneKey(null);
            setRenameLaneName("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Swimlane hernoemen</AlertDialogTitle>
            <AlertDialogDescription>
              Deze naam wordt opgeslagen voor deze proceskaart.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            aria-label="Swimlane naam"
            value={renameLaneName}
            onChange={e => setRenameLaneName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleRenameLane();
              if (e.key === "Escape") {
                setRenameLaneKey(null);
                setRenameLaneName("");
              }
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRenameLaneName("")}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleRenameLane} disabled={!renameLaneName.trim()}>
              Opslaan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSwitch} onOpenChange={setConfirmSwitch}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Niet-opgeslagen wijzigingen</AlertDialogTitle>
            <AlertDialogDescription>
              Je hebt niet-opgeslagen wijzigingen. Als je wisselt van pipeline gaan deze verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingPipelineId) onSwitchPipeline(pendingPipelineId);
                setConfirmSwitch(false);
                setPendingPipelineId(null);
              }}
            >
              Doorgaan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportBackup}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="font-semibold text-foreground">{title}</p>
      <div className="space-y-1 text-muted-foreground">{children}</div>
    </div>
  );
}
