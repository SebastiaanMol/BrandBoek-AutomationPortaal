import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Activity, AlertTriangle, Archive, Download, Filter, GitBranch, Workflow, X } from "lucide-react";
import { useAutomatiseringen } from "@/lib/queryHooks/automations";
import { usePipelines } from "@/lib/queryHooks/pipelines";
import type { Pipeline, PipelineStage } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildWorkflowMatrixAnalysis,
  isActiveWorkflow,
  type WorkflowMatrixAnalysis,
  type WorkflowMatrixAutomation,
  type WorkflowStageMatch,
} from "@/lib/workflowMatrixAnalysis";
import {
  buildWorkflowMatrixFilteredView,
  type WorkflowMatrixFilteredStage,
  type WorkflowMatrixViewFilters,
} from "@/lib/workflowMatrixFilters";
import { exportWorkflowMatrixAnalysisPdf } from "@/lib/workflowMatrixPdfExport";

export default function WorkflowMatrix() {
  const [filters, setFilters] = useState<WorkflowMatrixViewFilters>({ status: "all", focus: "all" });
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowMatrixAutomation | null>(null);
  const pipelinesQuery = usePipelines();
  const automationsQuery = useAutomatiseringen();

  const pipelines = pipelinesQuery.data ?? [];
  const automations = automationsQuery.data ?? [];
  const isLoading = pipelinesQuery.isLoading || automationsQuery.isLoading;
  const error = pipelinesQuery.error ?? automationsQuery.error;

  const hubspotPipelines = useMemo(
    () => pipelines
      .filter((pipeline) => pipeline.source === "hubspot")
      .map((pipeline) => ({
        ...pipeline,
        stages: [...pipeline.stages].sort((a, b) => a.display_order - b.display_order),
      })),
    [pipelines],
  );
  const analysis = useMemo(() => {
    const result = buildWorkflowMatrixAnalysis({ automations, pipelines: hubspotPipelines });
    console.log("Matching stats:", { totalAutos: automations.length, mapped: result.workflowsByStageId.size });
    return result;
  }, [automations, hubspotPipelines]);
  const filteredView = useMemo(
    () => buildWorkflowMatrixFilteredView({ pipelines: hubspotPipelines, analysis, filters }),
    [analysis, filters, hubspotPipelines],
  );
  const noiseWorkflowCount = useMemo(
    () => buildWorkflowMatrixFilteredView({
      pipelines: hubspotPipelines,
      analysis,
      filters: { status: "all", focus: "noise" },
    }).visibleWorkflowCount,
    [analysis, hubspotPipelines],
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-[1600px]">
          <p className="text-sm text-muted-foreground">Workflowmatrix laden...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-[1600px] rounded-lg border border-destructive/30 bg-destructive/5 p-5">
          <p className="text-sm font-semibold text-destructive">Workflowmatrix kon niet geladen worden.</p>
          <p className="mt-1 text-xs text-muted-foreground">{error instanceof Error ? error.message : "Onbekende fout"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-6 py-8 lg:px-10 lg:py-10">
        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
              <Workflow className="h-4 w-4" />
              HubSpot workflow matrix
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Pipelines, stages en gekoppelde workflows
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Direct-only overzicht om HubSpot dealstages te controleren op gekoppelde workflow triggers.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right">
            <Metric label="pipelines" value={hubspotPipelines.length} />
            <Metric label="stages" value={hubspotPipelines.reduce((total, pipeline) => total + pipeline.stages.length, 0)} />
            <Metric label="gekoppeld" value={analysis.kpis.linkedWorkflows} />
          </div>
        </header>

        <WorkflowMatrixAnalysisPanel analysis={analysis} />
        <WorkflowMatrixFilterBar
          filters={filters}
          onFiltersChange={setFilters}
          visibleStageCount={filteredView.visibleStageCount}
          visibleWorkflowCount={filteredView.visibleWorkflowCount}
          gapCount={analysis.kpis.emptyActiveStages}
          noiseCount={noiseWorkflowCount}
        />

        {hubspotPipelines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center">
            <p className="text-sm font-medium text-foreground">Geen HubSpot pipelines gevonden.</p>
            <p className="mt-1 text-xs text-muted-foreground">Synchroniseer eerst HubSpot pipelines om deze matrix te vullen.</p>
          </div>
        ) : filteredView.pipelines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center">
            <p className="text-sm font-medium text-foreground">Geen resultaten voor deze filters.</p>
            <p className="mt-1 text-xs text-muted-foreground">Pas de filterbalk aan om meer stages of workflows te tonen.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {filteredView.pipelines.map(({ pipeline, stages }) => (
              <PipelineWorkflowSection
                key={pipeline.pipelineId}
                pipeline={pipeline}
                stages={stages}
                onWorkflowSelect={setSelectedWorkflow}
              />
            ))}
          </div>
        )}
      </div>
      <WorkflowPreviewPanel
        workflow={selectedWorkflow}
        matches={selectedWorkflow ? analysis.matchesByAutomationId.get(selectedWorkflow.id) ?? [] : []}
        onClose={() => setSelectedWorkflow(null)}
      />
    </div>
  );
}

function WorkflowMatrixFilterBar({
  filters,
  onFiltersChange,
  visibleStageCount,
  visibleWorkflowCount,
  gapCount,
  noiseCount,
}: {
  filters: WorkflowMatrixViewFilters;
  onFiltersChange: (filters: WorkflowMatrixViewFilters) => void;
  visibleStageCount: number;
  visibleWorkflowCount: number;
  gapCount: number;
  noiseCount: number;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
            <Filter className="h-4 w-4" />
            Matrix filters
          </div>
          <p className="text-sm font-semibold text-foreground">Opschonen en archiveren</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {visibleStageCount} stages zichtbaar, {visibleWorkflowCount} workflowkaarten zichtbaar.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex flex-wrap gap-2">
            <FilterButton
              label="Alle statussen"
              active={filters.status === "all"}
              onClick={() => onFiltersChange({ ...filters, status: "all" })}
            >
              Alle statussen
            </FilterButton>
            <FilterButton
              label="Alleen actief"
              active={filters.status === "active"}
              onClick={() => onFiltersChange({ ...filters, status: "active", focus: "all" })}
            >
              Alleen actief
            </FilterButton>
            <FilterButton
              label="Alleen inactief"
              active={filters.status === "inactive"}
              onClick={() => onFiltersChange({ ...filters, status: "inactive", focus: "all" })}
            >
              Alleen inactief
            </FilterButton>
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterButton
              label="Procesgaten"
              active={filters.focus === "process_gaps"}
              onClick={() => onFiltersChange({ status: "all", focus: "process_gaps" })}
            >
              Procesgaten
              <span className="ml-1 rounded bg-background/70 px-1.5 py-0.5 text-[10px]">{gapCount}</span>
            </FilterButton>
            <FilterButton
              label="Ruis"
              active={filters.focus === "noise"}
              onClick={() => onFiltersChange({ status: "all", focus: "noise" })}
            >
              <Archive className="mr-1 h-3.5 w-3.5" />
              Ruis
              <span className="ml-1 rounded bg-background/70 px-1.5 py-0.5 text-[10px]">{noiseCount}</span>
            </FilterButton>
            <FilterButton
              label="Alles tonen"
              active={filters.status === "all" && filters.focus === "all"}
              onClick={() => onFiltersChange({ status: "all", focus: "all" })}
            >
              Alles tonen
            </FilterButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function FilterButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      className="h-8 gap-1.5 rounded-md text-xs"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function WorkflowMatrixAnalysisPanel({ analysis }: { analysis: WorkflowMatrixAnalysis }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Beheeranalyse</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Automation beheerstatus</h2>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            Deterministische analyse van pipeline-dekking, actieve/inactieve mismatch, datakwaliteit en beheeracties.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-2 self-start"
          onClick={() => exportWorkflowMatrixAnalysisPdf(analysis)}
        >
          <Download className="h-4 w-4" />
          PDF exporteren
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <AnalysisMetric label="Totaal workflows" value={analysis.kpis.totalWorkflows} />
        <AnalysisMetric label="Gekoppeld" value={analysis.kpis.linkedWorkflows} />
        <AnalysisMetric label="Ongekoppeld" value={analysis.kpis.unlinkedWorkflows} />
        <AnalysisMetric label="Lege actieve stages" value={analysis.kpis.emptyActiveStages} tone={analysis.kpis.emptyActiveStages > 0 ? "warning" : "normal"} />
        <AnalysisMetric label="Actieve workflows" value={analysis.kpis.activeWorkflows} />
        <AnalysisMetric label="Niet actieve workflows" value={analysis.kpis.disabledWorkflows} tone={analysis.kpis.disabledWorkflows > 0 ? "warning" : "normal"} />
        <AnalysisMetric label="Actieve pipelines" value={analysis.kpis.activePipelines} />
        <AnalysisMetric label="Oude pipelines" value={analysis.kpis.inactivePipelines} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Risicosignalen</h3>
          <div className="grid gap-2">
            <RiskList
              title="Actieve pipeline met inactieve workflows"
              rows={analysis.risks.activePipelineInactiveWorkflows.map((item) => `${item.pipeline.naam} / ${item.stage.label}: ${item.automation.naam}`)}
            />
            <RiskList
              title="Inactieve pipeline met actieve workflows"
              rows={analysis.risks.inactivePipelineActiveWorkflows.map((item) => `${item.pipeline.naam} / ${item.stage.label}: ${item.automation.naam}`)}
            />
            <RiskList
              title="Actieve stages zonder actieve triggers"
              rows={analysis.risks.emptyActiveStages.map((item) => `${item.pipeline.naam}: ${item.stage.label}`)}
            />
            <RiskList
              title="Fallback-matches"
              rows={analysis.risks.fallbackMatchedWorkflows.map((item) => `${item.automation.naam}: ${item.matches.map((match) => match.stage.label).join(", ")}`)}
            />
            <RiskList
              title="Niet-gematchte stage IDs"
              rows={analysis.risks.unmatchedStageWorkflows.map((item) => `${item.automation.naam}: ${item.rawStageIds.join(", ")}`)}
            />
            <RiskList
              title="Geen recente run-data"
              rows={analysis.risks.missingRunDataWorkflows.map((item) => `${item.automation.naam}: ${item.reason}`)}
            />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Pipeline beheeracties</h3>
          <div className="grid gap-2">
            {analysis.pipelineSummaries.map((summary) => (
              <div key={summary.pipeline.pipelineId} className="rounded-md border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">{summary.pipeline.naam}</p>
                  <Badge variant={summary.pipeline.isActive ? "default" : "secondary"}>
                    {summary.pipeline.isActive ? "Actief" : "Inactief"}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {summary.stageCount} stages, {summary.activeWorkflowCount} actief, {summary.inactiveWorkflowCount} niet actief, {summary.emptyStageCount} leeg.
                </p>
                <p className="mt-2 text-[11px] font-medium text-foreground">{summary.recommendedAction}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function AnalysisMetric({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: number;
  tone?: "normal" | "warning";
}) {
  return (
    <div className={["rounded-md border p-3", tone === "warning" ? "border-amber-300 bg-amber-50/50" : "border-border bg-background"].join(" ")}>
      <div className="text-lg font-semibold text-foreground">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function RiskList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <Badge variant={rows.length > 0 ? "destructive" : "secondary"}>{rows.length}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Geen bevindingen.</p>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, 3).map((row) => (
            <li key={row} className="text-[11px] leading-snug text-muted-foreground">{row}</li>
          ))}
          {rows.length > 3 && <li className="text-[11px] text-muted-foreground">plus {rows.length - 3} extra</li>}
        </ul>
      )}
    </div>
  );
}

function PipelineWorkflowSection({
  pipeline,
  stages,
  onWorkflowSelect,
}: {
  pipeline: Pipeline;
  stages: WorkflowMatrixFilteredStage[];
  onWorkflowSelect: (workflow: WorkflowMatrixAutomation) => void;
}) {
  return (
    <section
      role="section"
      aria-label={pipeline.naam}
      className="rounded-lg border border-border bg-card shadow-sm"
    >
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{pipeline.naam}</h2>
          <p className="text-xs text-muted-foreground">
            Pipeline ID: <span className="font-mono">{pipeline.pipelineId}</span>
          </p>
        </div>
        <Badge variant={pipeline.isActive ? "default" : "secondary"}>
          {pipeline.isActive ? "Actief" : "Inactief"}
        </Badge>
      </div>
      <div className="grid gap-3 overflow-x-auto p-4 md:grid-flow-col md:auto-cols-[minmax(240px,1fr)]">
        {stages.map(({ stage, workflows }) => (
          <StageWorkflowCard
            key={stage.stage_id}
            pipeline={pipeline}
            stage={stage}
            workflows={workflows}
            onWorkflowSelect={onWorkflowSelect}
          />
        ))}
      </div>
    </section>
  );
}

function StageWorkflowCard({
  pipeline,
  stage,
  workflows,
  onWorkflowSelect,
}: {
  pipeline: Pipeline;
  stage: PipelineStage;
  workflows: WorkflowMatrixAutomation[];
  onWorkflowSelect: (workflow: WorkflowMatrixAutomation) => void;
}) {
  const hasWorkflows = workflows.length > 0;

  return (
    <div
      data-testid="workflow-stage-card"
      className={[
        "flex min-h-[190px] flex-col rounded-lg border bg-background p-3",
        hasWorkflows ? "border-border" : "border-dashed border-amber-300 bg-amber-50/40",
      ].join(" ")}
    >
      <div className="mb-3">
        <div className="flex items-start justify-between gap-2">
          <h3 data-testid="stage-title" className="text-sm font-semibold leading-snug text-foreground">
            {stage.label}
          </h3>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {stage.display_order + 1}
          </Badge>
        </div>
        <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{stage.stage_id}</p>
      </div>

      {hasWorkflows ? (
        <div className="flex flex-col gap-2">
          {workflows.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} onSelect={onWorkflowSelect} />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center rounded-md border border-dashed border-amber-300 bg-white/60 p-4 text-center">
          <AlertTriangle className="mb-2 h-4 w-4 text-amber-600" />
          <p className="text-xs font-semibold text-amber-800">Geen actieve triggers</p>
          <p className="mt-1 text-[11px] text-amber-700">
            Geen workflow gekoppeld aan deze stage in {pipeline.naam}.
          </p>
        </div>
      )}
    </div>
  );
}

function WorkflowCard({
  workflow,
  onSelect,
}: {
  workflow: WorkflowMatrixAutomation;
  onSelect: (workflow: WorkflowMatrixAutomation) => void;
}) {
  const active = isActiveWorkflow(workflow.status);

  return (
    <button
      type="button"
      className="w-full rounded-md border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`Bekijk workflow ${workflow.naam}`}
      onClick={() => onSelect(workflow)}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-xs font-semibold text-foreground">{workflow.naam}</h4>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{workflow.external_id ?? workflow.externalId ?? workflow.id}</p>
        </div>
        <Badge
          variant={active ? "default" : "secondary"}
          className={active ? "bg-emerald-600 hover:bg-emerald-600" : ""}
        >
          {active ? "Actief" : "Inactief"}
        </Badge>
      </div>
      {workflow.trigger && (
        <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{workflow.trigger}</p>
      )}
      <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <GitBranch className="h-3 w-3" />
        {workflow.systemen?.join(", ") || "HubSpot"}
      </div>
    </button>
  );
}

function WorkflowPreviewPanel({
  workflow,
  matches,
  onClose,
}: {
  workflow: WorkflowMatrixAutomation | null;
  matches: WorkflowStageMatch[];
  onClose: () => void;
}) {
  if (!workflow) return null;

  const active = isActiveWorkflow(workflow.status);
  const externalId = workflow.external_id ?? workflow.externalId ?? workflow.id;
  const trigger = workflowTriggerText(workflow);
  const goal = stringOrFallback(workflow.doel);
  const steps = Array.isArray(workflow.stappen) ? workflow.stappen.filter(Boolean) : [];
  const systems = Array.isArray(workflow.systemen) && workflow.systemen.length > 0 ? workflow.systemen : ["HubSpot"];
  const lastRunAt = workflow.hubspotLastRunAt ?? snakeString(workflow, "hubspot_last_run_at");
  const runCount = workflow.hubspotRunCount365d ?? snakeNumber(workflow, "hubspot_run_count_365d");
  const technicalDetails = workflowTechnicalDetails(workflow);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-background/55 backdrop-blur-[1px]"
        aria-label="Preview achtergrond sluiten"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label="Workflow preview"
        className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Workflow preview</p>
            <h2 className="mt-1 text-lg font-semibold leading-tight text-foreground">{workflow.naam}</h2>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{externalId}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Preview sluiten" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge variant={active ? "default" : "secondary"} className={active ? "bg-emerald-600 hover:bg-emerald-600" : ""}>
              {active ? "Actief" : "Inactief"}
            </Badge>
            <Badge variant="outline">{workflow.source || "HubSpot"}</Badge>
          </div>

          <div className="grid gap-3">
            <PreviewSection title="Gekoppelde pipeline en stages">
              {matches.length > 0 ? (
                <div className="space-y-2">
                  {matches.map((match) => (
                    <div key={`${match.pipeline.pipelineId}:${match.stage.stage_id}`} className="rounded-md border border-border bg-background p-3">
                      <p className="text-sm font-semibold text-foreground">{match.pipeline.naam}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{match.stage.label}</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{match.stage.stage_id}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Geen stage-match gevonden.</p>
              )}
            </PreviewSection>

            <PreviewSection title="Doel">
              <p className="text-sm leading-relaxed text-foreground">{goal}</p>
            </PreviewSection>

            <PreviewSection title="Trigger">
              <p className="text-sm leading-relaxed text-foreground">{trigger}</p>
            </PreviewSection>

            <PreviewSection title="Systemen">
              <div className="flex flex-wrap gap-1.5">
                {systems.map((system) => (
                  <Badge key={system} variant="secondary">{system}</Badge>
                ))}
              </div>
            </PreviewSection>

            <PreviewSection title="Stappen / actions">
              {steps.length > 0 ? (
                <ol className="space-y-2">
                  {steps.map((step, index) => (
                    <li key={`${index}:${step}`} className="flex gap-2 rounded-md border border-border bg-background p-2 text-sm text-foreground">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Geen stappen bekend.</p>
              )}
            </PreviewSection>

            <PreviewSection title="Run-data">
              <div className="grid gap-2 sm:grid-cols-2">
                <PreviewFact label="Laatste run" value={lastRunAt ? formatDateTime(lastRunAt) : "Niet bekend"} />
                <PreviewFact label="Runs in 365 dagen" value={runCount === null ? "Niet bekend" : String(runCount)} />
              </div>
            </PreviewSection>

            {technicalDetails && (
              <PreviewSection title="Technische details">
                <details className="rounded-md border border-border bg-background p-3">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">Raw importdetails tonen</summary>
                  <pre className="mt-3 max-h-72 overflow-auto rounded bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
                    {JSON.stringify(technicalDetails, null, 2)}
                  </pre>
                </details>
              </PreviewSection>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function PreviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function workflowTriggerText(workflow: WorkflowMatrixAutomation): string {
  return stringOrFallback(snakeString(workflow, "trigger_beschrijving") || workflow.trigger);
}

function workflowTechnicalDetails(workflow: WorkflowMatrixAutomation): unknown | null {
  const details = snakeUnknown(workflow, "import_proposal") ?? workflow.importProposal;
  return isPlainObject(details) ? details : null;
}

function stringOrFallback(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "Niet bekend";
}

function snakeString(workflow: WorkflowMatrixAutomation, key: string): string | null {
  const value = (workflow as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function snakeNumber(workflow: WorkflowMatrixAutomation, key: string): number | null {
  const value = (workflow as unknown as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}

function snakeUnknown(workflow: WorkflowMatrixAutomation, key: string): unknown {
  return (workflow as unknown as Record<string, unknown>)[key];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center justify-end gap-1 text-lg font-semibold text-foreground">
        <Activity className="h-3.5 w-3.5 text-primary" />
        {value}
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
