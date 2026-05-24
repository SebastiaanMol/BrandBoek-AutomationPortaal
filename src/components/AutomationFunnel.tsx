import { ArrowRight, Brain, ChevronDown, Code2, Database, GitBranch, ListChecks, Play, Search } from "lucide-react";
import { useState, type ComponentType } from "react";
import type { Automatisering } from "@/lib/types";
import { buildAutomationFunnel, type AutomationFunnelStepKind } from "@/lib/automationFunnel";
import { getBackendAutomationTrace } from "@/lib/backendAutomationTrace";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface AutomationFunnelProps {
  automation: Automatisering;
  compact?: boolean;
}

const ICONS: Record<AutomationFunnelStepKind, ComponentType<{ className?: string }>> = {
  start: Play,
  read: Search,
  compute: Brain,
  write: Database,
  downstream: ArrowRight,
};

export function AutomationFunnel({ automation, compact = false }: AutomationFunnelProps): React.ReactNode {
  const [showInlineTechnicalTrace, setShowInlineTechnicalTrace] = useState(false);
  const funnel = buildAutomationFunnel(automation);
  if (!funnel) return null;
  const backendTrace = getBackendAutomationTrace(automation);

  if (compact && backendTrace) {
    const keySteps = backendTrace.plainSteps
      .filter((step) => !/backend automation wordt gestart|api-handler ontvangt|endpoint-call wordt afgerond/i.test(step.title))
      .slice(0, 3);

    return (
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Logica
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Compacte samenvatting. Open de automation voor de volledige technische trace.
          </p>
        </div>
        <div className="space-y-2 px-3 py-3">
          <p className="text-xs leading-relaxed text-foreground">
            {backendTrace.summary}
          </p>
          {keySteps.length > 0 && (
            <ol className="space-y-1.5">
              {keySteps.map((step, index) => (
                <li key={`${step.title}-${index}`} className="rounded-md border border-border bg-secondary/30 px-2.5 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {step.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    );
  }

  if (!funnel.isEndpointAutomation) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Automation funnel
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Dit is nog een oud GitLab bestandsrecord. De funnel wordt volledig zichtbaar op de nieuwe endpoint-automation.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {backendTrace ? "Logica" : "Automation funnel"}
            </p>
            <h3 className="mt-1 text-sm font-semibold text-foreground">
              {backendTrace ? "Backendverwerking" : "Wat doet deze GitLab automation?"}
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
              backend worker
            </span>
            {backendTrace && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                backend trace
              </span>
            )}
            {!backendTrace && funnel.hubspotWrites.length > 0 && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                schrijft HubSpot
              </span>
            )}
          </div>
        </div>
      </div>

      <div className={compact ? "space-y-3 px-3 py-3" : "space-y-4 px-4 py-4"}>
        {!backendTrace && (
          <>
            <div className="rounded-md bg-secondary/40 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                In gewone taal
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">
                {funnel.narrative}
              </p>
            </div>

            <ol className="relative space-y-3">
              <span className="absolute bottom-6 left-[17px] top-6 w-px bg-border" aria-hidden />
              {funnel.steps.map((step, index) => {
                const Icon = ICONS[step.kind];
                return (
                  <li key={`${step.kind}-${index}`} className="relative flex gap-3">
                    <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        {index + 1}
                      </span>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-3">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {step.title}
                        </p>
                        {index < funnel.steps.length - 1 && (
                          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
                            daarna <ArrowRight className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium leading-relaxed text-foreground">
                        {step.summary}
                      </p>
                      {step.details.length > 0 && (
                        <ul className="mt-2 space-y-1.5">
                          {step.details.map((detail, detailIndex) => (
                            <li key={`${detail}-${detailIndex}`} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                              <span>{detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary/50">
                Technische details tonen
                <ChevronDown className="h-3.5 w-3.5" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 rounded-md border border-border bg-secondary/30 px-3 py-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {funnel.technicalDetails.map((detail) => (
                    <div key={detail.label} className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {detail.label}
                      </p>
                      <p className="break-all font-mono text-xs leading-relaxed text-foreground">
                        {detail.value}
                      </p>
                    </div>
                  ))}
                </div>
                {funnel.technicalCalls.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Herkende code-aanroepen
                    </p>
                    <ul className="mt-1 space-y-1">
                      {funnel.technicalCalls.slice(0, 8).map((call) => (
                        <li key={call} className="break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
                          {call}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        {backendTrace && (
          <div className="rounded-lg border border-border bg-background">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-start gap-2.5">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Trace-overzicht
                  </p>
                  <h4 className="mt-1 text-sm font-semibold text-foreground">
                    Van trigger naar backendverwerking
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {backendTrace.summary}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.42fr)]">
              <div>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Stappen in gewone taal
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowInlineTechnicalTrace((value) => !value)}
                    className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-pressed={showInlineTechnicalTrace}
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    {showInlineTechnicalTrace ? "Verberg technische trace" : "Toon technische trace per stap"}
                  </button>
                </div>
                <ol className="space-y-2">
                  {backendTrace.plainSteps.map((step, index) => (
                    <li key={`${step.title}-${index}`} className="flex gap-3 rounded-md border border-border bg-card px-3 py-2.5">
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{step.title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {step.description}
                        </p>
                        {showInlineTechnicalTrace && step.technical && step.technical.length > 0 && (
                          <div className="mt-3 space-y-2 rounded-md border border-border bg-secondary/30 px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Technische trace voor deze stap
                            </p>
                            {step.technical.map((technical, technicalIndex) => (
                              <div key={`${technical.title}-${technicalIndex}`} className="rounded-md bg-background px-3 py-2">
                                <p className="text-xs font-semibold text-foreground">{technical.title}</p>
                                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                                  {technical.description}
                                </p>
                                {technical.code && (
                                  <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-foreground">
                                    {technical.code}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <aside className="space-y-3">
                <div className="rounded-md border border-border bg-secondary/30 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Beslismomenten
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {backendTrace.decisions.map((decision) => (
                      <li key={decision} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                        <span>{decision}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Collapsible>
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary/50">
                    <span className="inline-flex items-center gap-1.5">
                      <Code2 className="h-3.5 w-3.5" />
                      Technische trace
                    </span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-3 rounded-md border border-border bg-secondary/20 px-3 py-3">
                    <div className="grid gap-2">
                      {backendTrace.evidence.map((item) => (
                        <div key={item.label} className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {item.label}
                          </p>
                          <p className="break-all font-mono text-[11px] leading-relaxed text-foreground">
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                    <ol className="space-y-2 border-t border-border pt-3">
                      {backendTrace.technicalSteps.map((step, index) => (
                        <li key={`${step.title}-${index}`} className="rounded-md bg-background px-3 py-2">
                          <p className="text-xs font-semibold text-foreground">
                            {index + 1}. {step.title}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                            {step.description}
                          </p>
                          {step.code && (
                            <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-foreground">
                              {step.code}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </CollapsibleContent>
                </Collapsible>
              </aside>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
