import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  GitBranch,
  GripVertical,
  Search,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TEAM_CONFIG, type ProcessStep } from "@/data/processData";
import type { DriftRename } from "@/lib/processDrift";
import { buildStepStagingModel } from "@/lib/processStepStagingModel";
import type { PipelineStage } from "@/lib/types";

interface StepStagingPanelProps {
  driftNew:        PipelineStage[];
  driftRenamed:    DriftRename[];
  parkedSteps:     ProcessStep[];
  onApplyRename:   (stepId: string, newLabel: string) => void;
  onDismissRename: (stepId: string) => void;
}

export function StepStagingPanel({
  driftNew,
  driftRenamed,
  parkedSteps,
  onApplyRename,
  onDismissRename,
}: StepStagingPanelProps) {
  const [query, setQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const model = useMemo(
    () => buildStepStagingModel({ driftNew, driftRenamed, parkedSteps }),
    [driftNew, driftRenamed, parkedSteps],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const isEmpty = model.totalCount === 0;

  const filtered = useMemo(() => {
    const matches = (value: string) => (
      normalizedQuery.length === 0 || value.toLowerCase().includes(normalizedQuery)
    );

    return {
      newHubSpotStages: model.newHubSpotStages.filter(stage => matches(stage.label)),
      renamedHubSpotStages: model.renamedHubSpotStages.filter(rename => (
        matches(rename.oldLabel) || matches(rename.newLabel)
      )),
      parkedHubSpotStages: model.parkedHubSpotStages.filter(step => matches(step.label)),
      parkedManualTasks: model.parkedManualTasks.filter(step => matches(step.label)),
      parkedManualLogic: model.parkedManualLogic.filter(step => matches(step.label)),
    };
  }, [model, normalizedQuery]);

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

  function toggleSection(sectionId: string) {
    setCollapsedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }

  function getStepTypeLabel(step: ProcessStep) {
    switch (step.type) {
      case "start":
        return "Start";
      case "end":
        return "Einde";
      case "timer":
        return "Timer";
      case "decision":
        return "Decision";
      case "terminate":
        return "Terminate";
      case "send":
        return "Bericht verzenden";
      case "receive":
        return "Bericht ontvangen";
      case "and":
        return "AND gateway";
      case "optional":
        return "Optionele taak";
      default:
        return "Taak";
    }
  }

  function renderSection({
    id,
    title,
    count,
    hint,
    children,
    icon,
  }: {
    id: string;
    title: string;
    count: number;
    hint: string;
    children: React.ReactNode;
    icon?: React.ReactNode;
  }) {
    if (count === 0) return null;

    const isCollapsed = collapsedSections[id] ?? false;

    return (
      <section data-testid={`step-staging-section-${id}`}>
        <button
          type="button"
          onClick={() => toggleSection(id)}
          aria-expanded={!isCollapsed}
          className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
          />
          {icon}
          <h3 className="text-xs font-semibold text-foreground">{title}</h3>
          <Badge variant="secondary" className="ml-auto text-[10px]">{count}</Badge>
        </button>
        {!isCollapsed && (
          <>
            <p className="px-4 pb-2 text-[11px] text-muted-foreground">{hint}</p>
            <div className="divide-y divide-border">{children}</div>
          </>
        )}
      </section>
    );
  }

  function renderParkedStep(step: ProcessStep, label: string) {
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
          <p className="text-[11px] text-muted-foreground truncate">{label} · {cfg.label}</p>
        </div>
      </div>
    );
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
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-border bg-card px-3 py-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Stappen zoeken"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Zoek stage of stap"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
        </label>
      </div>

      <div className="divide-y divide-border">
        {renderSection({
          id: "new-hubspot",
          title: "Nieuw in HubSpot",
          count: filtered.newHubSpotStages.length,
          hint: "Echte HubSpot stages die nog niet op de canvas of in de bak staan.",
          icon: <Sparkles className="h-3.5 w-3.5 text-amber-500" />,
          children: filtered.newHubSpotStages.map(stage => (
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
          )),
        })}

        {renderSection({
          id: "renamed-hubspot",
          title: "Hernoemd in HubSpot",
          count: filtered.renamedHubSpotStages.length,
          hint: "Bestaande processtappen waarvan de HubSpot stage-naam is gewijzigd.",
          icon: <Sparkles className="h-3.5 w-3.5 text-blue-500" />,
          children: filtered.renamedHubSpotStages.map(rename => (
            <div key={rename.stepId} className="px-4 py-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground line-through truncate">{rename.oldLabel}</p>
                <p className="text-sm text-foreground font-medium truncate">-&gt; {rename.newLabel}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onApplyRename(rename.stepId, rename.newLabel)}
                  className="h-6 w-6 rounded flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  title="Toepassen"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onDismissRename(rename.stepId)}
                  className="h-6 w-6 rounded flex items-center justify-center hover:bg-secondary/70 transition-colors text-muted-foreground"
                  title="Negeren"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )),
        })}

        {renderSection({
          id: "parked-hubspot",
          title: "Geparkeerde HubSpot stages",
          count: filtered.parkedHubSpotStages.length,
          hint: "HubSpot stages die al bekend zijn, maar tijdelijk uit de procesview zijn gehaald.",
          icon: <Workflow className="h-3.5 w-3.5 text-primary" />,
          children: filtered.parkedHubSpotStages.map(step => renderParkedStep(step, "HubSpot stage")),
        })}

        {renderSection({
          id: "parked-manual",
          title: "Geparkeerde handmatige stappen",
          count: filtered.parkedManualTasks.length,
          hint: "Zelf gemaakte taken die niet uit HubSpot komen.",
          icon: <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />,
          children: filtered.parkedManualTasks.map(step => renderParkedStep(step, "Handmatige stap")),
        })}

        {renderSection({
          id: "parked-logic",
          title: "Geparkeerde proceslogica",
          count: filtered.parkedManualLogic.length,
          hint: "Losse start/eind-events, gateways en decision points.",
          icon: <GitBranch className="h-3.5 w-3.5 text-violet-500" />,
          children: filtered.parkedManualLogic.map(step => renderParkedStep(step, getStepTypeLabel(step))),
        })}
      </div>

      {!isEmpty && normalizedQuery.length > 0 && Object.values(filtered).every(items => items.length === 0) && (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          Geen stappen gevonden voor deze zoekopdracht.
        </div>
      )}
    </div>
  );
}
