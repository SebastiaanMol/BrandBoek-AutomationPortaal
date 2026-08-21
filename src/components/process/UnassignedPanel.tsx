import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Clock3, GitMerge, Mail, Search, SquareCheck, Unplug, Zap, X } from "lucide-react";
import type { Automation, ProcessAction, ProcessActionType, ProcessPlacementLink, ProcessStep } from "@/data/processData";
import { normalizePlacementLink } from "@/lib/processFlowLinks";
import type { Flow } from "@/lib/types";

const AUTOMATION_DOT_FILL = "#fed7aa";
const AUTOMATION_DOT_ICON = "#9a3412";
const FLOW_DOT_FILL = "#2563eb";
const FLOW_DOT_ICON = "#ffffff";
const PROCESS_ACTION_DOT_FILL = "#e5e7eb";
const PROCESS_ACTION_DOT_ICON = "#334155";

const PROCESS_ACTION_TEMPLATES: Array<{ type: ProcessActionType; label: string; description: string }> = [
  { type: "wait", label: "Wachtstap", description: "Plaats een wachttijd" },
  { type: "email", label: "E-mail sturen", description: "Plaats een e-mailactie" },
  { type: "task", label: "Taak uitvoeren", description: "Plaats een taakactie" },
  { type: "webhook", label: "Webhook/API", description: "Plaats een systeemactie" },
];

interface UnassignedPanelProps {
  automations: Automation[];
  flows: Flow[];
  processActions?: ProcessAction[];
  flowLinks: Record<string, ProcessPlacementLink>;
  steps: ProcessStep[];
  onAutomationClick: (auto: Automation) => void;
  onFlowClick: (flowId: string) => void;
  onProcessActionClick?: (action: ProcessAction) => void;
  onCreateProcessAction?: (type: ProcessActionType) => ProcessAction;
  onDetachFlow?: (flowId: string) => void;
  onDetachAutomation?: (automationId: string) => void;
  onDetachProcessAction?: (actionId: string) => void;
}

function PlacementListIcon({ kind }: { kind: "automation" | "flow" | "action" }) {
  const fill = kind === "automation" ? AUTOMATION_DOT_FILL : kind === "flow" ? FLOW_DOT_FILL : PROCESS_ACTION_DOT_FILL;
  const icon = kind === "automation" ? AUTOMATION_DOT_ICON : kind === "flow" ? FLOW_DOT_ICON : PROCESS_ACTION_DOT_ICON;
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
      style={{ background: fill }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={9} height={9} fill={icon}>
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    </span>
  );
}

function ProcessActionTemplateIcon({ type }: { type: ProcessActionType }) {
  const className = "h-3 w-3";
  if (type === "email" || type === "message") return <Mail className={className} />;
  if (type === "task") return <SquareCheck className={className} />;
  if (type === "webhook") return <Unplug className={className} />;
  return <Clock3 className={className} />;
}

export function UnassignedPanel({
  automations,
  flows,
  processActions = [],
  flowLinks,
  steps,
  onAutomationClick,
  onFlowClick,
  onProcessActionClick,
  onCreateProcessAction,
  onDetachFlow,
  onDetachAutomation,
  onDetachProcessAction,
}: UnassignedPanelProps) {
  const [openGekoppeld, setOpenGekoppeld] = useState(true);
  const [openProcessreizen, setOpenProcessreizen] = useState(false);
  const [openProcesacties, setOpenProcesacties] = useState(true);
  const [openAutomations, setOpenAutomations] = useState(false);
  const [flowSearch, setFlowSearch] = useState("");
  const [automationSearch, setAutomationSearch] = useState("");

  const linkedAutos = automations.filter(a => a.placement || (a.fromStepId && a.toStepId));
  const linkedFlowIds = Object.keys(flowLinks);
  const linkedFlows = flows.filter(f => linkedFlowIds.includes(f.id));
  const linkedProcessActions = processActions.filter(action => !!action.placement);
  const normalizedFlowSearch = normalizeSearch(flowSearch);
  const filteredFlows = useMemo(
    () => normalizedFlowSearch
      ? flows.filter(flow => {
          const haystack = normalizeSearch([
            flow.id,
            flow.naam,
            flow.beschrijving,
            ...(flow.systemen ?? []),
          ].filter(Boolean).join(" "));
          return haystack.includes(normalizedFlowSearch);
        })
      : flows,
    [flows, normalizedFlowSearch],
  );
  const unlinkedAutos = automations.filter(a => !a.placement && (!a.fromStepId || !a.toStepId) && isActiveWorkflow(a));
  const normalizedAutomationSearch = normalizeSearch(automationSearch);
  const filteredUnlinkedAutos = useMemo(
    () => normalizedAutomationSearch
      ? unlinkedAutos.filter(auto => {
          const haystack = normalizeSearch([
            auto.id,
            auto.name,
            auto.tool,
            auto.goal,
            auto.team,
          ].filter(Boolean).join(" "));
          return haystack.includes(normalizedAutomationSearch);
        })
      : unlinkedAutos,
    [normalizedAutomationSearch, unlinkedAutos],
  );
  const totalLinked = linkedAutos.length + linkedFlows.length + linkedProcessActions.length;

  return (
    <div className="flex flex-col h-full overflow-hidden text-sm">

      {/* SECTION 1: Gekoppeld */}
      <div className="shrink-0 border-b border-border">
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          onClick={() => setOpenGekoppeld(v => !v)}
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span className="flex-1 text-left">Gekoppeld</span>
          <span className="rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[10px] font-bold">{totalLinked}</span>
          {openGekoppeld ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {openGekoppeld && (
          <div className="px-2 pb-2 flex flex-col gap-1" style={{ maxHeight: 240, overflowY: "auto" }}>
            {totalLinked === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-3">Nog niets gekoppeld</p>
            )}
            {linkedFlows.map(flow => {
              const link = flowLinks[flow.id];
              const placement = link ? normalizePlacementLink(link) : null;
              const fromStep = placement?.kind === "connection" ? steps.find(s => s.id === placement.fromStepId) : undefined;
              const toStep   = placement?.kind === "connection" ? steps.find(s => s.id === placement.toStepId) : undefined;
              return (
                <div
                  key={flow.id}
                  data-testid={`linked-flow-${flow.id}`}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData("flowId", flow.id); e.dataTransfer.effectAllowed = "move"; }}
                  className="flex items-center gap-1 group cursor-grab active:cursor-grabbing"
                >
                  <button
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-indigo-50 text-left flex-1 min-w-0 transition-colors"
                    onClick={() => onFlowClick(flow.id)}>
                    <PlacementListIcon kind="flow" />
                    <span className="flex-1 min-w-0">
                      <span className="text-[11px] font-medium text-slate-700 block truncate">{flow.naam}</span>
                      {fromStep && toStep && (
                        <span className="text-[10px] text-slate-400 block truncate">{fromStep.label} → {toStep.label}</span>
                      )}
                    </span>
                  </button>
                  {onDetachFlow && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDetachFlow(flow.id); }}
                      className="shrink-0 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                      title="Loskoppelen">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
            {linkedAutos.map(auto => {
              const placement = auto.placement ?? (auto.fromStepId && auto.toStepId ? { kind: "connection" as const, fromStepId: auto.fromStepId, toStepId: auto.toStepId } : null);
              const fromStep = placement?.kind === "connection" ? steps.find(s => s.id === placement.fromStepId) : undefined;
              const toStep   = placement?.kind === "connection" ? steps.find(s => s.id === placement.toStepId) : undefined;
              return (
                <div key={auto.id}
                  data-testid={`linked-automation-${auto.id}`}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData("automationId", auto.id); e.dataTransfer.effectAllowed = "move"; }}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-amber-50 text-left w-full transition-colors cursor-grab active:cursor-grabbing group"
                  onClick={() => onAutomationClick(auto)}>
                  <PlacementListIcon kind="automation" />
                  <span className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-slate-700 block truncate">{auto.name}</span>
                    {placement?.kind === "pipeline_wide" && (
                      <span className="text-[10px] text-sky-600 block truncate">Pipeline-brede sync hub</span>
                    )}
                    {fromStep && toStep && (
                      <span className="text-[10px] text-slate-400 block truncate">{fromStep.label} → {toStep.label}</span>
                    )}
                  </span>
                  {onDetachAutomation && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDetachAutomation(auto.id); }}
                      className="shrink-0 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                      aria-label={`Automation ${auto.name} loskoppelen`}
                      title="Loskoppelen">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
            {linkedProcessActions.map(action => {
              const placement = action.placement;
              const fromStep = placement?.kind === "connection" ? steps.find(s => s.id === placement.fromStepId) : undefined;
              const toStep   = placement?.kind === "connection" ? steps.find(s => s.id === placement.toStepId) : undefined;
              const step     = placement?.kind === "step" ? steps.find(s => s.id === placement.stepId) : undefined;
              const placementLabel = fromStep && toStep ? `${fromStep.label} → ${toStep.label}` : step?.label;
              return (
                <div key={action.id}
                  data-testid={`linked-process-action-${action.id}`}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData("processActionId", action.id); e.dataTransfer.effectAllowed = "move"; }}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 text-left w-full transition-colors cursor-grab active:cursor-grabbing group"
                  onClick={() => onProcessActionClick?.(action)}>
                  <PlacementListIcon kind="action" />
                  <span className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-slate-700 block truncate">{action.label}</span>
                    {placementLabel && (
                      <span className="text-[10px] text-slate-400 block truncate">{placementLabel}</span>
                    )}
                  </span>
                  {onDetachProcessAction && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDetachProcessAction(action.id); }}
                      className="shrink-0 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                      aria-label={`Procesactie ${action.label} loskoppelen`}
                      title="Loskoppelen">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: Procesreizen */}
      <div className="shrink-0 border-b border-border">
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          onClick={() => setOpenProcessreizen(v => !v)}
        >
          <GitMerge className="h-3.5 w-3.5 text-indigo-500" />
          <span className="flex-1 text-left">Procesreizen</span>
          <span className="rounded-full bg-indigo-100 text-indigo-700 px-1.5 py-0.5 text-[10px] font-bold">{flows.length}</span>
          {openProcessreizen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {openProcessreizen && (
          <div
            role="region"
            aria-label="Procesreizen"
            className="px-2 pb-2 flex flex-col gap-1"
            style={{ maxHeight: 240, overflowY: "auto" }}
          >
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={flowSearch}
                onChange={(event) => setFlowSearch(event.target.value)}
                placeholder="Zoek procesreis..."
                className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-7 text-xs text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
              {flowSearch && (
                <button
                  type="button"
                  onClick={() => setFlowSearch("")}
                  className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Procesreis zoekopdracht wissen"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 px-1 pb-1 shrink-0">
              Sleep naar een pijl op de flow
              {flowSearch ? ` · ${filteredFlows.length} van ${flows.length}` : ""}
            </p>
            {flows.length === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-3">Geen procesreizen</p>
            )}
            {flows.length > 0 && filteredFlows.length === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-3">Geen procesreizen gevonden</p>
            )}
            {filteredFlows.map(flow => (
              <div key={flow.id}
                draggable
                onDragStart={e => { e.dataTransfer.setData("flowId", flow.id); e.dataTransfer.effectAllowed = "move"; }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-indigo-50 cursor-grab active:cursor-grabbing transition-colors">
                <span className="text-slate-400 shrink-0 select-none">⠿</span>
                <PlacementListIcon kind="flow" />
                <span className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium text-slate-700 block truncate">{flow.naam}</span>
                  <span className="text-[10px] text-slate-400">{flow.automationIds.length} automations</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 3: Procesacties */}
      <div className="shrink-0 border-b border-border">
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          onClick={() => setOpenProcesacties(v => !v)}
        >
          <Clock3 className="h-3.5 w-3.5 text-slate-500" />
          <span className="flex-1 text-left">Procesacties</span>
          <span className="rounded-full bg-slate-100 text-slate-700 px-1.5 py-0.5 text-[10px] font-bold">{PROCESS_ACTION_TEMPLATES.length}</span>
          {openProcesacties ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {openProcesacties && (
          <div
            role="region"
            aria-label="Procesacties"
            className="px-2 pb-2 flex flex-col gap-1"
          >
            <p className="text-[10px] text-slate-400 px-1 pb-1 shrink-0">
              Sleep naar een pijl of onderrand van een stap
            </p>
            {PROCESS_ACTION_TEMPLATES.map(template => (
              <div
                key={template.type}
                draggable
                onDragStart={event => {
                  const action = onCreateProcessAction?.(template.type);
                  if (!action) return;
                  event.dataTransfer.setData("processActionId", action.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 cursor-grab active:cursor-grabbing transition-colors"
              >
                <span className="text-slate-400 shrink-0 select-none">⋮</span>
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700"
                  aria-hidden="true"
                >
                  <ProcessActionTemplateIcon type={template.type} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium text-slate-700 block truncate">{template.label}</span>
                  <span className="text-[10px] text-slate-400 block truncate">{template.description}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 3: Losse automations */}
      <div className="flex-1 min-h-0 flex flex-col">
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
          onClick={() => setOpenAutomations(v => !v)}
        >
          <Zap className="h-3.5 w-3.5 text-amber-500" />
          <span className="flex-1 text-left">Losse automations</span>
          <span className="rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] font-bold">{unlinkedAutos.length}</span>
          {openAutomations ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {openAutomations && (
          <div
            role="region"
            aria-label="Losse automations"
            className="flex-1 overflow-auto px-2 pb-2 flex flex-col gap-1"
          >
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={automationSearch}
                onChange={(event) => setAutomationSearch(event.target.value)}
                placeholder="Zoek automation..."
                className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-7 text-xs text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
              />
              {automationSearch && (
                <button
                  type="button"
                  onClick={() => setAutomationSearch("")}
                  className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Zoekopdracht wissen"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 px-1 pb-1 shrink-0">
              Sleep naar een pijl op de flow
              {automationSearch ? ` · ${filteredUnlinkedAutos.length} van ${unlinkedAutos.length}` : ""}
            </p>
            {unlinkedAutos.length === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-3">Geen losse automations</p>
            )}
            {unlinkedAutos.length > 0 && filteredUnlinkedAutos.length === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-3">Geen automations gevonden</p>
            )}
            {filteredUnlinkedAutos.map(auto => (
              <div key={auto.id}
                draggable
                onDragStart={e => { e.dataTransfer.setData("automationId", auto.id); e.dataTransfer.effectAllowed = "move"; }}
                onClick={() => onAutomationClick(auto)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-amber-50 cursor-grab active:cursor-grabbing transition-colors">
                <span className="text-slate-400 shrink-0 select-none">⠿</span>
                <PlacementListIcon kind="automation" />
                <span className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium text-slate-700 block truncate">{auto.name}</span>
                  <span className="text-[10px] text-slate-400 block truncate">{auto.tool}{auto.goal ? ` · ${auto.goal.slice(0, 30)}` : ""}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isActiveWorkflow(auto: Pick<Automation, "status">): boolean {
  const status = auto.status?.trim().toLowerCase();
  return status === "actief" || status === "active" || status === "enabled";
}
