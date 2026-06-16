import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, GitMerge, Zap, X } from "lucide-react";
import type { Automation, ProcessStep } from "@/data/processData";
import type { Flow } from "@/lib/types";

interface UnassignedPanelProps {
  automations: Automation[];
  flows: Flow[];
  flowLinks: Record<string, { fromStepId: string; toStepId: string }>;
  steps: ProcessStep[];
  onAutomationClick: (auto: Automation) => void;
  onFlowClick: (flowId: string) => void;
  onDetachFlow?: (flowId: string) => void;
}

export function UnassignedPanel({
  automations,
  flows,
  flowLinks,
  steps,
  onAutomationClick,
  onFlowClick,
  onDetachFlow,
}: UnassignedPanelProps) {
  const [openGekoppeld, setOpenGekoppeld] = useState(true);
  const [openProcessreizen, setOpenProcessreizen] = useState(false);
  const [openAutomations, setOpenAutomations] = useState(false);

  const linkedAutos = automations.filter(a => a.fromStepId && a.toStepId);
  const linkedFlowIds = Object.keys(flowLinks);
  const linkedFlows = flows.filter(f => linkedFlowIds.includes(f.id));
  const unlinkedAutos = automations.filter(a => !a.fromStepId || !a.toStepId);
  const totalLinked = linkedAutos.length + linkedFlows.length;

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
              const fromStep = steps.find(s => s.id === link?.fromStepId);
              const toStep   = steps.find(s => s.id === link?.toStepId);
              return (
                <div key={flow.id} className="flex items-center gap-1 group">
                  <button
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-indigo-50 text-left flex-1 min-w-0 transition-colors"
                    onClick={() => onFlowClick(flow.id)}>
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
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
              const fromStep = steps.find(s => s.id === auto.fromStepId);
              const toStep   = steps.find(s => s.id === auto.toStepId);
              return (
                <button key={auto.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-amber-50 text-left w-full transition-colors"
                  onClick={() => onAutomationClick(auto)}>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-slate-700 block truncate">{auto.name}</span>
                    {fromStep && toStep && (
                      <span className="text-[10px] text-slate-400 block truncate">{fromStep.label} → {toStep.label}</span>
                    )}
                  </span>
                </button>
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
          <div className="px-2 pb-2 flex flex-col gap-1" style={{ maxHeight: 200, overflowY: "auto" }}>
            <p className="text-[10px] text-slate-400 px-1 pb-1 shrink-0">Sleep naar een pijl op de flow</p>
            {flows.length === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-3">Geen procesreizen</p>
            )}
            {flows.map(flow => (
              <div key={flow.id}
                draggable
                onDragStart={e => { e.dataTransfer.setData("flowId", flow.id); e.dataTransfer.effectAllowed = "move"; }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-indigo-50 cursor-grab active:cursor-grabbing transition-colors">
                <span className="text-slate-400 shrink-0 select-none">⠿</span>
                <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium text-slate-700 block truncate">{flow.naam}</span>
                  <span className="text-[10px] text-slate-400">{flow.automationIds.length} automations</span>
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
          <div className="flex-1 overflow-auto px-2 pb-2 flex flex-col gap-1">
            <p className="text-[10px] text-slate-400 px-1 pb-1 shrink-0">Sleep naar een pijl op de flow</p>
            {unlinkedAutos.map(auto => (
              <div key={auto.id}
                draggable
                onDragStart={e => { e.dataTransfer.setData("automationId", auto.id); e.dataTransfer.effectAllowed = "move"; }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-amber-50 cursor-grab active:cursor-grabbing transition-colors">
                <span className="text-slate-400 shrink-0 select-none">⠿</span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "hsl(45 95% 55%)" }} />
                <span className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium text-slate-700 block truncate">{auto.name}</span>
                  <span className="text-[10px] text-slate-400 block truncate">{auto.tool}{auto.goal ? ` · ${auto.goal.slice(0, 30)}` : ""}</span>
                </span>
                <Zap className="h-3 w-3 text-amber-400 shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
