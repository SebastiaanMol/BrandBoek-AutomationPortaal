import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, CheckCircle2, Database, GitBranch, GitFork, Radio, Route, Send, Workflow } from "lucide-react";
import { useState, type ComponentType } from "react";
import type { Automatisering, Flow, Pipeline } from "@/lib/types";
import {
  applyFlowDetailPresentationToRuntimeSteps,
  type FlowDetailPresentation,
} from "@/lib/flowDetailPresentation";
import {
  buildFlowRuntimeChain,
  getFlowRuntimeTransitionLabel,
  isFlowRuntimeStepSelectedForAutomation,
  type FlowRuntimeStepType,
  type FlowRuntimeWorker,
} from "@/lib/flowRuntimeChain";
import { StepLogicDetails } from "./StepLogicDetails";
import type { NextProcessJourneyLink } from "@/lib/processJourneyLinks";

interface FlowRuntimeChainProps {
  flow: Flow;
  autoMap: Map<string, Automatisering>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  downstreamJourney?: NextProcessJourneyLink | null;
  pipelines?: Pipeline[];
  presentation?: FlowDetailPresentation | null;
}

const ICONS: Record<FlowRuntimeStepType, ComponentType<{ className?: string }>> = {
  signal: Radio,
  zapier_step: Route,
  typeform_step: Route,
  hubspot_workflow: Workflow,
  hubspot_branching: GitFork,
  gitlab_backend_block: GitBranch,
  gitlab_worker: GitBranch,
  automation: Route,
  return_to_hubspot: Send,
  state_write: Database,
  emitted_signal: Send,
  downstream: ArrowDown,
};

const STYLES: Record<FlowRuntimeStepType, string> = {
  signal: "border-blue-300 bg-blue-50 text-blue-900 ring-1 ring-blue-100",
  zapier_step: "border-orange-200 bg-orange-50 text-orange-950 ring-1 ring-orange-100",
  typeform_step: "border-slate-200 bg-slate-50 text-slate-950 ring-1 ring-slate-100",
  hubspot_workflow: "border-blue-300 bg-blue-50 text-blue-900 ring-1 ring-blue-100",
  hubspot_branching: "border-blue-300 bg-blue-50/70 text-blue-900 ring-1 ring-blue-100",
  gitlab_backend_block: "border-purple-300 bg-purple-50 text-purple-900 ring-1 ring-purple-100",
  gitlab_worker: "border-purple-300 bg-purple-50 text-purple-900 ring-1 ring-purple-100",
  automation: "border-slate-200 bg-slate-50 text-slate-800",
  return_to_hubspot: "border-blue-200 bg-white text-blue-900",
  state_write: "border-blue-100 bg-white text-blue-900",
  emitted_signal: "border-dashed border-blue-300 bg-blue-50/50 text-blue-900 opacity-80",
  downstream: "border-dashed border-blue-200 bg-blue-50/40 text-blue-900 opacity-75",
};

const SELECTED_CARD_CLASS =
  "!border-primary !border-solid !bg-white !opacity-100 !ring-4 !ring-primary/30 shadow-[0_0_0_1px_hsl(var(--primary)),0_10px_30px_-18px_hsl(var(--primary))]";

export function FlowRuntimeChain({
  flow,
  autoMap,
  selectedId,
  onSelect,
  downstreamJourney,
  pipelines = [],
  presentation = null,
}: FlowRuntimeChainProps): React.ReactNode {
  const steps = applyFlowDetailPresentationToRuntimeSteps(
    buildFlowRuntimeChain(flow.automationIds, autoMap, { pipelines, autoMap }),
    presentation,
  );
  if (steps.length === 0) return null;
  const startSignal = steps.find((step) => step.type === "signal") ?? null;
  const followUpSteps = steps.filter((step) => step.type === "emitted_signal" || step.type === "downstream");
  const journeySteps = steps.filter(
    (step) => step.type !== "signal" && step.type !== "emitted_signal" && step.type !== "downstream",
  );

  return (
    <div className="min-w-0 space-y-5">
      {startSignal && (
        <section
          aria-label="Startsignaal"
          className="card-elevated min-w-0 border-blue-200 bg-blue-50 px-4 py-3.5 text-blue-900"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/75 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              {startSignalLabel(startSignal)}
            </span>
            <span className="text-[10px] font-semibold text-blue-700">
              hoort bij stap 1
            </span>
          </div>
          <p className="mt-1 break-words text-sm font-semibold leading-snug">
            {startSignal.title}
          </p>
          <p className="mt-1 break-words text-xs leading-relaxed text-blue-800/80">
            {startSignal.description}
          </p>
          {startSignal.evidence && (
            <StepLogicDetails logic={startSignal.evidence} className="text-blue-900" />
          )}
        </section>
      )}

      <section
        aria-label="Stap voor stap overzicht"
        className="card-elevated min-w-0 p-5"
      >
        <div className="mb-5 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Procesreis
          </p>
          <h2 className="text-xl font-semibold text-foreground">
            Stap voor stap overzicht
          </h2>
        </div>

      <ol className="relative min-w-0 space-y-4">
        <span className="absolute bottom-6 left-[18px] top-6 w-px bg-border" aria-hidden />
        {journeySteps.map((step, index) => {
          const Icon = ICONS[step.type];
          const isDownstream = step.type === "downstream";
          const workerIds = step.workers?.map((worker) => worker.automationId) ?? [];
          const isAutomationStep =
            step.type === "zapier_step" ||
            step.type === "hubspot_workflow" ||
            step.type === "gitlab_backend_block" ||
            step.type === "gitlab_worker" ||
            step.type === "automation";
          const isSelectable = Boolean((isAutomationStep && step.automationId) || workerIds.length > 0);
          const isSelected = isFlowRuntimeStepSelectedForAutomation(step, selectedId);
          const selectedClass = isSelected
            ? SELECTED_CARD_CLASS
            : "";
          const displayLabel = isDownstream && downstreamJourney ? "Volgende procesreis" : step.label;
          const displayTitle = isDownstream && downstreamJourney ? downstreamJourney.title : step.title;
          const displayDescription = isDownstream && downstreamJourney ? downstreamJourney.reason : step.description;
          const transitionLabel = getFlowRuntimeTransitionLabel(step);
          const handleSelect = () => {
            const targetId = step.automationId ?? workerIds[0];
            if (targetId) onSelect(targetId);
          };

          return (
            <li key={step.id} className="relative min-w-0">
              {index > 0 && (
                <div
                  role="separator"
                  aria-label={`Overgang: ${transitionLabel}`}
                  title={step.transitionFromPrevious?.description ?? "Deze stap volgt op de vorige stap in de procesreis."}
                  className="mb-2 ml-[52px] flex min-w-0 items-center justify-center gap-2 py-1 text-[11px] font-semibold text-muted-foreground"
                >
                  <span className="h-px min-w-4 flex-1 bg-border" aria-hidden />
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 shadow-sm">
                    <ArrowDown className="h-3 w-3 text-primary" aria-hidden />
                    <span>{transitionLabel}</span>
                  </span>
                  <span className="h-px min-w-4 flex-1 bg-border" aria-hidden />
                </div>
              )}
              <div className="flex min-w-0 gap-4">
                <span
                  className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-background ${
                    isSelected
                      ? "border-primary text-primary ring-4 ring-primary/20"
                      : runtimeIconClass(step.type)
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>

                <div
                  role={isSelectable && !step.workers ? "button" : undefined}
                  tabIndex={isSelectable && !step.workers ? 0 : undefined}
                  onClick={isSelectable && !step.workers ? handleSelect : undefined}
                  onKeyDown={(event) => {
                    if (!isSelectable || step.workers) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSelect();
                    }
                  }}
                  className={`min-w-0 flex-1 rounded-lg border px-4 py-3.5 text-left transition-colors ${
                    STYLES[step.type]
                  } ${selectedClass} ${
                    isSelectable ? "hover:bg-opacity-80" : "cursor-default"
                  } ${
                    isDownstream ? "shadow-none" : ""
                  }`}
                >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${runtimeSystemBadgeClass(step.type)}`}>
                    {runtimeSystemLabel(step)}
                  </span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    {displayLabel}
                  </span>
                  <span className="text-[10px] font-semibold text-current/70">
                    Stap {index + 1}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm font-semibold leading-snug text-current">
                  {displayTitle}
                </p>
                <p className="mt-1 break-words text-xs leading-relaxed text-current/75">
                  {displayDescription}
                </p>
                {step.evidence && (
                  <StepLogicDetails logic={step.evidence} />
                )}
                {step.hubspotActions && step.hubspotActions.length > 0 && (
                  <div className="mt-3 grid min-w-0 gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-blue-900/75">
                      Acties binnen deze HubSpot workflow
                    </p>
                    {step.hubspotActions.map((action) => (
                      <div
                        key={action.id}
                        className={`min-w-0 rounded-md border px-3 py-2 ${hubSpotActionStyle(action.tone)}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                            {action.label}
                          </span>
                        </div>
                        <p className="mt-1 break-words text-xs font-semibold">{action.title}</p>
                        <p className="mt-0.5 break-words text-[11px] leading-relaxed opacity-75">
                          {action.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {step.type === "state_write" && (
                  <p className="mt-3 rounded-md border border-blue-200 bg-white/70 px-3 py-2 text-[11px] font-semibold text-blue-900">
                    Hier staat de bekende uitkomst van deze verwerking. Een vervolgstap wordt pas gekoppeld wanneer de exacte trigger daarvoor bewezen is.
                  </p>
                )}
                {step.branchPaths && step.branchPaths.length > 0 && (
                  <div className="mt-3 grid min-w-0 gap-2">
                    {step.branchPaths.map((path) => (
                      <div key={path.id} className="min-w-0 rounded-md border border-blue-200 bg-white/70 px-3 py-2">
                        <p className="break-words text-xs font-semibold text-blue-950">{path.label}</p>
                        <p className="mt-0.5 break-words text-[11px] leading-relaxed text-blue-900/70">
                          Als: {path.conditionLabel}
                        </p>
                        {path.updates.map((update) => (
                          <p key={`${path.id}-${update.property}`} className="mt-0.5 break-words text-[11px] leading-relaxed text-blue-900/70">
                            Zet {update.property} op {update.value}
                          </p>
                        ))}
                        {path.webhookPath && (
                          <p className="mt-0.5 break-words text-[11px] leading-relaxed text-blue-900/70">
                            Geeft dit pad door aan een backendverwerking. De technische route staat onder Logica.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {isDownstream && downstreamJourney && (
                  <div className="mt-3 min-w-0 rounded-lg border border-indigo-200/60 bg-white/60 px-3 py-2">
                    <span className="inline-flex rounded-full bg-indigo-100/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-900/75">
                      Bevestigde koppeling
                    </span>
                    <p className="break-words text-xs font-semibold text-indigo-950">
                      {downstreamJourney.title}
                    </p>
                    <p className="mt-0.5 break-words text-[11px] leading-relaxed text-indigo-900/65">
                      {downstreamJourney.reason}
                    </p>
                    <Link
                      to={downstreamJourney.href}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-white/75 px-2.5 py-1.5 text-xs font-semibold text-indigo-900 transition-colors hover:bg-white"
                    >
                      Open volgende procesreis
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                )}
                {isDownstream && !downstreamJourney && !presentation && (
                  <p className="mt-3 text-[11px] font-medium text-current/60">
                    Geen vervolgproces gekoppeld zolang property/waarde naar trigger-match niet bewezen is.
                  </p>
                )}
                {step.workers && step.workers.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-purple-800/75">
                      GitLab analyse van deze automation
                    </p>
                    <div className="space-y-3">
                      {step.workers.map((worker, workerIndex) => {
                        const isWorkerSelected = worker.automationId === selectedId;

                        return (
                          <div
                            key={worker.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelect(worker.automationId);
                            }}
                            className={`min-w-0 w-full rounded-lg border bg-white/75 p-3 text-left transition-colors hover:bg-white ${
                              isWorkerSelected
                                ? "border-purple-200 bg-white"
                                : "border-purple-200"
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-800">
                                GitLab automation {workerIndex + 1}
                              </span>
                              {workerIndex > 0 && (
                                <span className="text-[10px] font-semibold text-purple-700/70">
                                  interne backend-overdracht
                                </span>
                              )}
                            </div>
                            <p className="mt-1 break-words text-sm font-semibold leading-snug text-purple-950">
                              {worker.title}
                            </p>
                            <p className="mt-1 break-words text-xs leading-relaxed text-purple-900/75">
                              {worker.description}
                            </p>
                            <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">
                              {worker.miniSteps.slice(0, 6).map((miniStep) => (
                                <div
                                  key={`${worker.id}-${miniStep.title}`}
                                  className="min-w-0 rounded-md border border-purple-100 bg-purple-50/60 px-2.5 py-2"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3 w-3 text-purple-700" />
                                    <span className="break-words text-[10px] font-bold uppercase tracking-wider text-purple-800">
                                      {miniStep.title}
                                    </span>
                                  </div>
                                  <p className="mt-1 break-words text-[11px] leading-relaxed text-purple-900/75">
                                    {miniStep.summary}
                                  </p>
                                </div>
                              ))}
                            </div>
                            <WorkerBackendTrace worker={worker} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      </section>

      {followUpSteps.length > 0 && (
        <section
          aria-label="Vervolgcontrole"
          className="card-elevated min-w-0 border-dashed border-blue-200 bg-blue-50/40 px-4 py-3.5 text-blue-900"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-900/75">
            Vervolgcontrole
          </p>
          <div className="mt-2 space-y-2">
            {followUpSteps.map((step) => {
              const isDownstream = step.type === "downstream";
              const displayLabel = isDownstream
                ? downstreamJourney ? "Volgende procesreis" : "Vervolgcontrole"
                : step.label;
              const displayTitle = isDownstream && downstreamJourney ? downstreamJourney.title : step.title;
              const displayDescription = isDownstream && downstreamJourney ? downstreamJourney.reason : step.description;

              return (
                <div key={step.id} className="rounded-lg border border-blue-200/70 bg-white/70 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-900">
                      {displayLabel}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-sm font-semibold leading-snug text-blue-950">
                    {displayTitle}
                  </p>
                  <p className="mt-1 break-words text-xs leading-relaxed text-blue-900/75">
                    {displayDescription}
                  </p>
                  {step.evidence && <StepLogicDetails logic={step.evidence} />}
                  {isDownstream && downstreamJourney && (
                    <Link
                      to={downstreamJourney.href}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-white/75 px-2.5 py-1.5 text-xs font-semibold text-blue-900 transition-colors hover:bg-white"
                    >
                      Open volgende procesreis
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function startSignalLabel(step: { title: string; description: string; evidence?: string }): string {
  const text = `${step.title} ${step.description} ${step.evidence ?? ""}`.toLowerCase();
  if (text.includes("zapier")) return "Startsignaal van Zapier automation";
  if (text.includes("hubspot")) return "Startsignaal van HubSpot workflow";
  return "Startsignaal van automation";
}

function runtimeSystemLabel(step: { type: FlowRuntimeStepType; title: string; description: string; evidence?: string }): string {
  const type = step.type;
  const text = `${step.title} ${step.description} ${step.evidence ?? ""}`.toLowerCase();
  if (type === "zapier_step") return "Zapier";
  if (type === "typeform_step") return "Typeform";
  if ((type === "signal" || type === "automation") && text.includes("zapier")) return "Zapier";
  if (type === "gitlab_backend_block" || type === "gitlab_worker") return "GitLab";
  if (type === "automation") return "Automation";
  if (type === "return_to_hubspot") return "Overdracht";
  if (type === "state_write") {
    if (text.includes("wefact")) return "WeFact";
    if (text.includes("hubspot")) return "HubSpot";
    return "Uitkomst";
  }
  if (type === "downstream") return "Controle";
  return "HubSpot";
}

function runtimeSystemBadgeClass(type: FlowRuntimeStepType): string {
  if (type === "gitlab_backend_block" || type === "gitlab_worker") {
    return "bg-purple-100 text-purple-800";
  }
  if (type === "zapier_step") return "bg-orange-100 text-orange-800";
  if (type === "typeform_step") return "bg-slate-100 text-slate-800";
  if (type === "automation") return "bg-slate-100 text-slate-700";
  if (type === "return_to_hubspot") return "bg-blue-100 text-blue-800";
  return "bg-blue-100 text-blue-800";
}

function runtimeIconClass(type: FlowRuntimeStepType): string {
  if (type === "gitlab_backend_block" || type === "gitlab_worker") {
    return "border-purple-300 text-purple-700 ring-4 ring-purple-100";
  }
  if (type === "zapier_step") return "border-orange-300 text-orange-700 ring-4 ring-orange-100";
  if (type === "typeform_step") return "border-slate-300 text-slate-700 ring-4 ring-slate-100";
  if (type === "automation") return "border-slate-300 text-slate-600";
  return "border-blue-300 text-blue-700 ring-4 ring-blue-100";
}

function hubSpotActionStyle(tone: "update" | "route" | "workflow"): string {
  if (tone === "update") return "border-emerald-200 bg-emerald-50/70 text-emerald-900";
  if (tone === "route") return "border-amber-200 bg-amber-50/70 text-amber-900";
  return "border-blue-200 bg-white/70 text-blue-950";
}

function WorkerBackendTrace({ worker }: { worker: FlowRuntimeWorker }): React.ReactNode {
  const [open, setOpen] = useState(false);
  if (!worker.backendTrace) return null;

  return (
    <div className="mt-3 min-w-0 rounded-lg border border-purple-200 bg-white/75 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-purple-800">
            Technische trace
          </p>
          <p className="mt-0.5 break-words text-[11px] leading-relaxed text-purple-900/70">
            Exacte codepadinformatie achter deze backendstap.
          </p>
        </div>
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            setOpen((value) => !value);
          }}
          className="inline-flex cursor-pointer rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-[11px] font-semibold text-purple-900 transition-colors hover:bg-purple-100"
        >
          {open ? "Verberg technische trace" : "Toon technische trace"}
        </span>
      </div>

      {open && (
        <div className="mt-3 min-w-0 space-y-3">
          {worker.miniSteps
            .filter((step) => step.technical && step.technical.length > 0)
            .slice(0, 8)
            .map((step) => (
              <div key={`${worker.id}-trace-${step.title}`} className="min-w-0 rounded-md border border-purple-100 bg-purple-50/50 p-2.5">
                <p className="break-words text-xs font-semibold text-purple-950">{step.title}</p>
                <div className="mt-2 min-w-0 space-y-2">
                  {step.technical?.slice(0, 6).map((item) => (
                    <div key={`${step.title}-${item.title}-${item.code}`} className="min-w-0 rounded border border-purple-100 bg-white/80 px-2 py-1.5">
                      <p className="break-words text-[11px] font-semibold text-purple-950">{item.title}</p>
                      <p className="break-words text-[11px] leading-relaxed text-purple-900/70">{item.description}</p>
                      {item.code && (
                        <code className="mt-1 block overflow-x-auto rounded bg-slate-950 px-2 py-1.5 text-[10px] leading-relaxed text-slate-50">
                          {item.code}
                        </code>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

          {worker.backendTrace.decisions.length > 0 && (
            <div className="min-w-0 rounded-md border border-purple-100 bg-purple-50/50 p-2.5">
              <p className="text-xs font-semibold text-purple-950">Beslislogica</p>
              <ul className="mt-2 list-disc space-y-1 break-words pl-4 text-[11px] leading-relaxed text-purple-900/75">
                {worker.backendTrace.decisions.slice(0, 6).map((decision) => (
                  <li key={decision}>{decision}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="min-w-0 rounded-md border border-purple-100 bg-purple-50/50 p-2.5">
            <p className="text-xs font-semibold text-purple-950">Endpoint trace</p>
            <div className="mt-2 grid min-w-0 gap-2">
              {worker.backendTrace.technicalSteps.slice(0, 8).map((step) => (
                <div key={`${step.title}-${step.code}`} className="min-w-0 rounded border border-purple-100 bg-white/80 px-2 py-1.5">
                  <p className="break-words text-[11px] font-semibold text-purple-950">{step.title}</p>
                  <p className="break-words text-[11px] leading-relaxed text-purple-900/70">{step.description}</p>
                  {step.code && (
                    <code className="mt-1 block overflow-x-auto rounded bg-slate-950 px-2 py-1.5 text-[10px] leading-relaxed text-slate-50">
                      {step.code}
                    </code>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
