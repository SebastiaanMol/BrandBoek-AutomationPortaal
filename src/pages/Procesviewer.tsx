import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  Eye,
  FileArchive,
  Pencil,
  Search,
  ShieldAlert,
  Workflow,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  PageCommandBar,
  PageHeaderMetric,
  PageHeaderMetrics,
  PageHeaderShell,
} from "@/components/layout/PageHeader";
import {
  useAllProcessStates,
  useAutomationSentryIssueOverview,
  useAutomatiseringen,
  useFlows,
  usePipelines,
  useProcessState,
  useUpdateProcessManualStatus,
} from "@/lib/hooks";
import { useRenameCustomPipeline } from "@/lib/queryHooks/pipelines";
import { buildProcessStateFromSaved } from "@/lib/processStateMapping";
import { getLaneConfig, resolveActiveLanes, stagesToProcessState } from "@/data/processData";
import type { ProcessPlacementLink, ProcessState } from "@/data/processData";
import type { Automatisering, Flow } from "@/lib/types";
import {
  PROCESS_MANUAL_STATUSES,
  type ProcessManualStatus,
  type SavedProcessStateWithUpdatedAt,
} from "@/lib/storage/processState";
import { buildProcessCockpitModel, type ProcessCockpitRow } from "@/lib/processCockpit";
import { exportProcessViewsZip, type ProcessViewZipFormats, type ProcessViewZipExportItem } from "@/lib/processExport";
import { normalizePlacementLink } from "@/lib/processFlowLinks";
import { ProcessviewerDetailPanel } from "@/components/procesviewer/ProcessviewerDetailPanel";
import { BpmnLegend } from "@/components/procesviewer/BpmnLegend";
import { BpmnToolbar } from "@/components/procesviewer/BpmnToolbar";
import { ProcessCanvas } from "@/components/process/ProcessCanvas";
import { ProcessenEditor } from "@/components/process/ProcessenEditor";

type Mode = "cockpit" | "view" | "edit";

const PROCESS_MANUAL_STATUS_LABELS: Record<ProcessManualStatus, string> = {
  niet_ingericht: "Niet ingericht",
  procesflow_gereed: "Procesflow gereed",
  in_review: "In review",
  in_orde: "In orde",
};

const PROCESS_MANUAL_STATUS_CLASSES: Record<ProcessManualStatus, string> = {
  niet_ingericht: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
  procesflow_gereed: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
  in_review: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  in_orde: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
};

const PROCESS_MANUAL_STATUS_DOT_CLASSES: Record<ProcessManualStatus, string> = {
  niet_ingericht: "bg-slate-400",
  procesflow_gereed: "bg-blue-500",
  in_review: "bg-amber-500",
  in_orde: "bg-emerald-500",
};

function hasSavedProcessSteps(savedState: { steps?: unknown[] } | null | undefined): boolean {
  return Array.isArray(savedState?.steps) && savedState.steps.length > 0;
}

function toCanvasAutomation(a: Automatisering, link?: ProcessPlacementLink) {
  const placement = link ? normalizePlacementLink(link) : undefined;
  const connectionPlacement = placement?.kind === "connection" ? placement : undefined;

  return {
    id:         a.id,
    name:       a.naam,
    team:       "sales" as const,
    tool:       a.source ?? "",
    goal:       a.doel ?? "",
    link:       a.externalId ?? undefined,
    fromStepId: connectionPlacement?.fromStepId,
    toStepId:   connectionPlacement?.toStepId,
    placement,
  };
}

export default function Procesviewer(): React.ReactNode {
  const { data: allPipelines = [] } = usePipelines();
  const { data: dbAutomations = [] } = useAutomatiseringen();
  const { data: flows = [] } = useFlows();
  const { data: allProcessStates = {}, isLoading: processStatesLoading } = useAllProcessStates();
  const sentryOverview = useAutomationSentryIssueOverview(dbAutomations, { enabled: dbAutomations.length > 0 });
  const renameCustomPipeline = useRenameCustomPipeline();

  const activePipelines = useMemo(() => allPipelines.filter((p) => p.isActive), [allPipelines]);

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedProcessId, setSelectedProcessId]   = useState<string | null>(null);
  const [mode, setMode]                             = useState<Mode>("cockpit");
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

  function handleReturnToCockpit() {
    setMode("cockpit");
    setSelectedProcessId(null);
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
    const currentPipeline = allPipelines.find((p) => p.pipelineId === selectedProcessId);
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
  }, [savedState, selectedProcessId, allPipelines, dbAutomations]);

  const processState = derivedProcessState;

  function handleEnterEdit() {
    if (!selectedProcessId) return;
    setMode("edit");
  }

  function handleLeaveEdit() {
    setMode("view");
    setEditorDirty(false);
  }

  if (mode === "cockpit") {
    return (
      <ProcessCockpit
        pipelines={allPipelines}
        processStates={allProcessStates}
        automations={dbAutomations}
        sentryOverview={sentryOverview.data}
        isLoading={processStatesLoading}
        onOpenViewer={handlePipelineChange}
        onOpenEditor={(pipelineId) => {
          setSelectedPipelineId(pipelineId);
          setSelectedProcessId(pipelineId);
          setMode("edit");
          setEditorDirty(false);
          setSelectedAutoId(null);
          setSelectedStepId(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] min-h-0">
      {/* Selector bar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-card">
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-sm" onClick={handleReturnToCockpit}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Terug naar cockpit
        </Button>
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
            flows={flows}
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

function ProcessCockpit({
  pipelines,
  processStates,
  automations,
  sentryOverview,
  isLoading,
  onOpenViewer,
  onOpenEditor,
}: {
  pipelines: ReturnType<typeof usePipelines>["data"];
  processStates: Record<string, SavedProcessStateWithUpdatedAt | undefined>;
  automations: Automatisering[];
  sentryOverview: ReturnType<typeof useAutomationSentryIssueOverview>["data"];
  isLoading: boolean;
  onOpenViewer: (pipelineId: string) => void;
  onOpenEditor: (pipelineId: string) => void;
}): React.ReactNode {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProcessManualStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "hubspot" | "custom">("all");
  const [errorFilter, setErrorFilter] = useState<"all" | "with-errors" | "without-errors">("all");
  const [selectedPipelineIds, setSelectedPipelineIds] = useState<string[]>([]);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [formats, setFormats] = useState<ProcessViewZipFormats>({ json: true, png: false, pdf: false });
  const updateManualStatus = useUpdateProcessManualStatus();

  const model = useMemo(
    () => buildProcessCockpitModel({
      pipelines: pipelines ?? [],
      processStates,
      automations,
      sentry: sentryOverview,
      selectedPipelineIds,
    }),
    [automations, pipelines, processStates, selectedPipelineIds, sentryOverview],
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return model.rows.filter((row) => {
      const matchesSearch = normalizedSearch.length === 0 || row.name.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === "all" || row.manualStatus === statusFilter;
      const matchesSource = sourceFilter === "all" || row.source === sourceFilter;
      const matchesErrors =
        errorFilter === "all" ||
        (errorFilter === "with-errors" && row.sentry.issueCount > 0) ||
        (errorFilter === "without-errors" && row.sentry.issueCount === 0);
      return matchesSearch && matchesStatus && matchesSource && matchesErrors;
    });
  }, [errorFilter, model.rows, search, sourceFilter, statusFilter]);

  function handleManualStatusChange(pipelineId: string, status: ProcessManualStatus) {
    updateManualStatus.mutate({ pipelineId, status });
  }

  const selectedDetail = model.rows.find((row) => row.pipelineId === selectedDetailId) ?? filteredRows[0] ?? null;
  const selectedExportRows = model.rows.filter((row) => row.exportReady && selectedPipelineIds.includes(row.pipelineId));
  const selectableFilteredRows = filteredRows.filter((row) => row.exportReady);

  function togglePipelineSelection(pipelineId: string) {
    setSelectedPipelineIds((current) =>
      current.includes(pipelineId)
        ? current.filter((id) => id !== pipelineId)
        : [...current, pipelineId],
    );
  }

  function toggleFilteredSelection() {
    const selectableIds = selectableFilteredRows.map((row) => row.pipelineId);
    const allSelected = selectableIds.every((id) => selectedPipelineIds.includes(id));
    setSelectedPipelineIds((current) => {
      if (allSelected) return current.filter((id) => !selectableIds.includes(id));
      return Array.from(new Set([...current, ...selectableIds]));
    });
  }

  async function handleBulkExport() {
    const exportItems: ProcessViewZipExportItem[] = [];
    for (const row of selectedExportRows) {
      const state = processStates[row.pipelineId];
      if (!state || state.steps.length === 0) continue;

      let svg: SVGSVGElement | null = null;
      if (formats.png || formats.pdf) {
        svg = await renderProcessSvgForExport(state, automations);
      }

      exportItems.push({
        pipelineId: row.pipelineId,
        pipelineName: row.name,
        state,
        svg,
      });
    }

    if (exportItems.length === 0) {
      toast.error("Geen pipelines geselecteerd voor export");
      return;
    }

    await exportProcessViewsZip({ items: exportItems, formats });
    toast.success("Procesviews gedownload");
  }

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-48px)] items-center justify-center text-sm text-muted-foreground">
        Proces Cockpit laden...
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-48px)] min-h-0 flex-col bg-slate-50">
      <div className="border-b border-border bg-card px-6 pt-4">
        <PageHeaderShell
          icon={Workflow}
          eyebrow="Procesviewer"
          title="Proces Cockpit"
          description="Overzicht van procesviews, pipeline-dekking, gekoppelde errors, onderhoud en bulk-export."
          metrics={(
            <PageHeaderMetrics>
              <PageHeaderMetric label="geselecteerd" value={selectedPipelineIds.length} />
              <PageHeaderMetric label="actieve pipelines" value={model.kpis.activePipelines} />
              <PageHeaderMetric label="procesviews" value={model.kpis.savedProcessViews} />
            </PageHeaderMetrics>
          )}
        >
          <PageCommandBar>
            <span className="text-sm text-muted-foreground">Export selectie</span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={formats.json} onChange={() => setFormats((current) => ({ ...current, json: !current.json }))} />
                JSON
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={formats.png} onChange={() => setFormats((current) => ({ ...current, png: !current.png }))} />
                PNG
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={formats.pdf} onChange={() => setFormats((current) => ({ ...current, pdf: !current.pdf }))} />
                PDF
              </label>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={selectedPipelineIds.length === 0 || (!formats.json && !formats.png && !formats.pdf)}
                onClick={handleBulkExport}
              >
                <FileArchive className="h-3.5 w-3.5" />
                Download selectie
              </Button>
            </div>
          </PageCommandBar>
        </PageHeaderShell>
      </div>

      <div className="grid gap-3 px-6 py-4 sm:grid-cols-2 xl:grid-cols-6">
        <ProcessCockpitKpi label="Actieve pipelines" value={model.kpis.activePipelines} />
        <ProcessCockpitKpi label="Opgeslagen procesviews" value={model.kpis.savedProcessViews} />
        <ProcessCockpitKpi label="Zonder procesview" value={model.kpis.missingProcessViews} tone="warning" />
        <ProcessCockpitKpi label="Gekoppelde automations" value={model.kpis.linkedAutomations} />
        <ProcessCockpitKpi label="Open Sentry signalen" value={model.kpis.openSentryIssues} tone={model.kpis.openSentryIssues > 0 ? "danger" : "default"} />
        <ProcessCockpitKpi label="Export selectie" value={selectedPipelineIds.length} />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 px-6 pb-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
          <div className="flex flex-wrap gap-2 border-b border-border p-3">
            <label className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="Zoek pipeline"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Zoek pipeline"
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none"
              />
            </label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="all">Alle statussen</option>
              {PROCESS_MANUAL_STATUSES.map((status) => (
                <option key={status} value={status}>{PROCESS_MANUAL_STATUS_LABELS[status]}</option>
              ))}
            </select>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as typeof sourceFilter)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="all">Alle bronnen</option>
              <option value="hubspot">HubSpot</option>
              <option value="custom">Custom</option>
            </select>
            <select value={errorFilter} onChange={(event) => setErrorFilter(event.target.value as typeof errorFilter)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="all">Alle errors</option>
              <option value="with-errors">Met errors</option>
              <option value="without-errors">Zonder errors</option>
            </select>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-12 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Selecteer alle gefilterde pipelines"
                      checked={selectableFilteredRows.length > 0 && selectableFilteredRows.every((row) => selectedPipelineIds.includes(row.pipelineId))}
                      disabled={selectableFilteredRows.length === 0}
                      onChange={toggleFilteredSelection}
                    />
                  </th>
                  <th className="px-3 py-2">Pipeline</th>
                  <th className="px-3 py-2">Processtatus</th>
                  <th className="px-3 py-2">Kwaliteit</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Errors</th>
                  <th className="px-3 py-2">Export</th>
                  <th className="px-3 py-2 text-right">Acties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.map((row) => (
                  <tr
                    key={row.pipelineId}
                    onClick={() => setSelectedDetailId(row.pipelineId)}
                    className={[
                      !row.isActive ? "bg-slate-100/70 text-muted-foreground opacity-75 [background-image:repeating-linear-gradient(135deg,rgba(148,163,184,0.14)_0,rgba(148,163,184,0.14)_6px,transparent_6px,transparent_12px)]" : "",
                      row.isActive && selectedDetail?.pipelineId === row.pipelineId ? "bg-primary/5" : "",
                      row.isActive && selectedDetail?.pipelineId !== row.pipelineId ? "hover:bg-secondary/40" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Selecteer ${row.name}`}
                        checked={selectedPipelineIds.includes(row.pipelineId)}
                        disabled={!row.exportReady}
                        onChange={() => togglePipelineSelection(row.pipelineId)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-foreground">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.source} / {row.isActive ? "Actief" : "Inactief"}</p>
                      {row.blockedReason && (
                        <p className="mt-1 max-w-[260px] text-xs text-slate-500">{row.blockedReason}</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <ManualStatusSelect
                        row={row}
                        disabled={updateManualStatus.isPending}
                        onChange={handleManualStatusChange}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-secondary">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${row.readinessScore}%` }} />
                        </div>
                        <span className="tabular-nums text-xs font-semibold">{row.readinessScore}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {row.quality.stepCount} stappen / {row.quality.connectionCount} routes / {row.quality.linkedAutomationCount} automations
                    </td>
                    <td className="px-3 py-3">
                      {row.sentry.issueCount > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                          <ShieldAlert className="h-3 w-3" />
                          {row.sentry.issueCount} issues
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Geen errors</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {!row.isActive ? (
                        <span className="text-xs font-semibold text-slate-500">Geblokt</span>
                      ) : row.exportReady ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <Download className="h-3 w-3" />
                          Klaar
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Geen model</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!row.isActive} onClick={(event) => { event.stopPropagation(); onOpenViewer(row.pipelineId); }}>
                          Open viewer
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={!row.isActive} onClick={(event) => { event.stopPropagation(); onOpenEditor(row.pipelineId); }}>
                          Bewerken
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRows.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Geen pipelines gevonden.
              </div>
            )}
          </div>
        </div>

        <ProcessCockpitDetail
          row={selectedDetail}
          onOpenViewer={onOpenViewer}
          onOpenEditor={onOpenEditor}
          onManualStatusChange={handleManualStatusChange}
          statusPending={updateManualStatus.isPending}
        />
      </div>
    </div>
  );
}

function ProcessCockpitKpi({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" | "danger" }) {
  const toneClass = tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-600" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function ManualStatusSelect({
  row,
  disabled = false,
  onChange,
  size = "compact",
}: {
  row: ProcessCockpitRow;
  disabled?: boolean;
  onChange: (pipelineId: string, status: ProcessManualStatus) => void;
  size?: "compact" | "detail";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Processtatus ${row.name}`}
          data-status-value={row.manualStatus}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          className={[
            "inline-flex items-center justify-between gap-2 rounded-md border text-left text-xs font-semibold shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60",
            size === "detail" ? "h-9 min-w-[180px] px-3" : "h-7 min-w-[142px] px-2.5",
            PROCESS_MANUAL_STATUS_CLASSES[row.manualStatus],
          ].join(" ")}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PROCESS_MANUAL_STATUS_DOT_CLASSES[row.manualStatus]}`} />
            <span className="truncate">{PROCESS_MANUAL_STATUS_LABELS[row.manualStatus]}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-52"
        onClick={(event) => event.stopPropagation()}
      >
        {PROCESS_MANUAL_STATUSES.map((status) => {
          const selected = row.manualStatus === status;
          return (
            <DropdownMenuItem
              key={status}
              onSelect={() => onChange(row.pipelineId, status)}
              className="flex cursor-pointer items-center gap-2 text-xs"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${PROCESS_MANUAL_STATUS_DOT_CLASSES[status]}`} />
              <span className="flex-1">{PROCESS_MANUAL_STATUS_LABELS[status]}</span>
              {selected && <Check className="h-3.5 w-3.5 text-foreground" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProcessCockpitDetail({
  row,
  onOpenViewer,
  onOpenEditor,
  onManualStatusChange,
  statusPending,
}: {
  row: ProcessCockpitRow | null;
  onOpenViewer: (pipelineId: string) => void;
  onOpenEditor: (pipelineId: string) => void;
  onManualStatusChange: (pipelineId: string, status: ProcessManualStatus) => void;
  statusPending: boolean;
}) {
  if (!row) {
    return (
      <aside className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
        Selecteer een pipeline voor details.
      </aside>
    );
  }

  return (
    <aside className="min-h-0 overflow-auto rounded-lg border border-border bg-card p-5">
      <p className="label-uppercase">Pipeline detail</p>
      <h2 className="mt-1 text-lg font-semibold text-foreground">{row.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{row.source} / {row.stageCount} stages</p>

      <div className="mt-4">
        <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Processtatus</p>
        <ManualStatusSelect row={row} disabled={statusPending} onChange={onManualStatusChange} size="detail" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniDetail label="Readiness" value={`${row.readinessScore}%`} />
        <MiniDetail label="Errors" value={String(row.sentry.issueCount)} />
        <MiniDetail label="Stappen" value={String(row.quality.stepCount)} />
        <MiniDetail label="Routes" value={String(row.quality.connectionCount)} />
        <MiniDetail label="Automations" value={String(row.quality.linkedAutomationCount)} />
        <MiniDetail label="Context" value={String(row.quality.artifactCount + row.quality.attachmentCount)} />
      </div>

      <div className="mt-5 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Aandachtspunten</h3>
        {row.blockedReason ? (
          <p className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{row.blockedReason}</p>
        ) : row.attentionReasons.length > 0 ? (
          <ul className="space-y-1">
            {row.attentionReasons.map((reason) => (
              <li key={reason} className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">{reason}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Geen pipelines met aandachtspunten</p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <Button type="button" className="justify-start gap-1.5" disabled={!row.isActive} onClick={() => onOpenViewer(row.pipelineId)}>
          <Eye className="h-3.5 w-3.5" />
          Open viewer
        </Button>
        <Button type="button" variant="outline" className="justify-start gap-1.5" disabled={!row.isActive} onClick={() => onOpenEditor(row.pipelineId)}>
          <Pencil className="h-3.5 w-3.5" />
          Bewerken
        </Button>
      </div>
    </aside>
  );
}

function MiniDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

async function renderProcessSvgForExport(
  savedState: SavedProcessStateWithUpdatedAt,
  automations: Automatisering[],
): Promise<SVGSVGElement | null> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "2400px";
  container.style.height = "1600px";
  document.body.appendChild(container);

  const root = createRoot(container);
  const processState = buildProcessStateFromSaved(
    savedState,
    automations.map((automation) => toCanvasAutomation(automation, savedState.autoLinks[automation.id])),
  );
  root.render(
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
    />,
  );

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const svg = container.querySelector("svg")?.cloneNode(true) as SVGSVGElement | undefined;
  root.unmount();
  document.body.removeChild(container);
  return svg ?? null;
}

function SharedProcessViewerCanvas({
  processState,
  flows,
  onStepClick,
  onAutomationClick,
}: {
  processState: ProcessState;
  flows: Flow[];
  onStepClick: (stepId: string) => void;
  onAutomationClick: (automationId: string) => void;
}): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const visibleLanes = useMemo(() => {
    const active = resolveActiveLanes(processState.activeLanes, processState.customLanes);
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
          flows={flows}
          flowLinks={processState.flowLinks}
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
