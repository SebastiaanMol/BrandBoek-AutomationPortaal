import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, ExternalLink, Info, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { getHubSpotAutomationDetailPresentation, type HubSpotConditionItem, type HubSpotIssue } from "@/lib/hubspotAutomationDetailPresentation";
import type { Automatisering } from "@/lib/types";

export function HubSpotAutomationDetailTemplate({ automation }: { automation: Automatisering }): React.ReactNode {
  const presentation = getHubSpotAutomationDetailPresentation(automation);

  return (
    <div aria-label="HubSpot automation detail" className="space-y-4">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {presentation.metrics.map((metric) => (
          <article key={metric.label} className={`min-h-[112px] rounded-2xl border bg-card p-5 shadow-sm ${metricCardClass(metric)}`}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{metric.value}</p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <h2 className="text-lg font-semibold text-foreground">Wat doet deze automation?</h2>
            {presentation.triggerMoment && (
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Trigger-moment: <span className="font-medium normal-case tracking-normal text-foreground">{presentation.triggerMoment}</span>
              </p>
            )}
            <p className="mt-4 text-base leading-7 text-muted-foreground">{presentation.summary}</p>
            {presentation.systemTags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {presentation.systemTags.map((system) => (
                  <span key={system} className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                    {system}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex max-w-sm flex-wrap justify-start gap-2 lg:justify-end">
            {presentation.evidenceBadges.map((badge) => (
              <span key={badge} className="rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs font-semibold text-muted-foreground">
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Dataflow</h2>
        <div className="mt-5 overflow-x-auto pb-2">
          <div className="flex min-w-[760px] items-center gap-4">
            {presentation.dataflow.map((node, index) => (
              <div key={`${node.name}-${index}`} className="flex items-center gap-4">
                <div className={`min-h-[96px] w-48 rounded-xl border p-4 ${nodeClassName(node.role)}`}>
                  <p className="text-sm font-semibold text-foreground">{node.name}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{node.subtitle}</p>
                </div>
                {node.arrowLabel && (
                  <div className="w-28 text-center text-xs font-bold text-muted-foreground">
                    <span>{node.arrowLabel}</span>
                    <ArrowRight className="mx-auto mt-1 h-6 w-6 text-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid items-stretch gap-4 xl:grid-cols-[1.35fr_1fr]">
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Startvoorwaarden</h2>
          <div className="mt-4 space-y-3">
            {presentation.conditions.map((condition, index) => (
              <ConditionRow key={`${condition.title}-${index}`} condition={condition} />
            ))}
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-foreground">Re-enrollment</h3>
            <div className="mt-3 space-y-3">
              {presentation.reEnrollmentRules.map((condition, index) => (
                <ConditionRow key={`${condition.title}-${index}`} condition={condition} />
              ))}
            </div>
          </div>
        </article>

        <div className="flex flex-col gap-4">
          <article className="flex-1 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Automation Ownership</h2>
            <dl className="mt-4 grid gap-3">
              {presentation.meta.map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
                  <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{item.label}</dt>
                  <dd className="text-right text-sm font-medium text-foreground">{item.value}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="flex-1 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Webhook Action</h2>
            <div className="mt-4 space-y-3">
              {presentation.webhookActions.length > 0 ? (
                presentation.webhookActions.map((action) => (
                  <div key={`${action.method}-${action.path}`} className="rounded-xl border border-border bg-secondary/20 p-4">
                    <div className="flex items-start gap-3">
                      <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">{action.method}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{action.title}</p>
                        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{action.path}</p>
                        {action.url && <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{action.url}</p>}
                        {action.authLabel && <p className="mt-2 text-xs text-muted-foreground">{action.authLabel}</p>}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                presentation.actionDetails.map((action) => (
                  <div key={`${action.badge}-${action.title}`} className="rounded-xl border border-border bg-secondary/30 p-3">
                    <div className="flex items-start gap-3">
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">{action.badge}</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{action.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{action.subtitle}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Gebruikte properties</h2>
          {presentation.properties.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <div className="grid grid-cols-[1fr_auto_1fr] bg-secondary/60 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <div className="p-3">Property</div>
                <div className="p-3 text-center">Rule</div>
                <div className="p-3">Value</div>
              </div>
              {presentation.properties.map((property) => (
                <div key={`${property.property}-${property.rule}-${property.value}`} className="grid grid-cols-[1fr_auto_1fr] border-t border-border text-sm">
                  <div className="p-3 font-medium text-foreground">{property.property}</div>
                  <div className="p-3 text-center text-muted-foreground">{property.rule}</div>
                  <div className="p-3 text-muted-foreground">{property.value}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock title="Geen properties beschikbaar" text="De genormaliseerde HubSpot workflowdata bevat geen propertyvoorwaarden." />
          )}
        </article>

        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Gekoppelde objecten / bronnen</h2>
          <div className="mt-4 space-y-3">
            {presentation.objectSources.length > 0 ? (
              presentation.objectSources.map((source) => (
                <div key={`${source.objectTypeId}-${source.title}`} className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 p-3">
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">{source.objectTypeId}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{source.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{source.subtitle}</p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyBlock title="Geen association data beschikbaar" text="HubSpot object-associations zijn niet aanwezig in deze workflowdata." />
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Field mappings</h2>
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" />
            <div>
              <p className="text-sm font-semibold">{presentation.fieldMappingAvailability.title}</p>
              <p className="mt-1 text-sm leading-6 text-orange-900">{presentation.fieldMappingAvailability.subtitle}</p>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Issues & Risks</h2>
          <div className="mt-4 space-y-3">
            {presentation.issues.map((issue) => (
              <IssueRow key={`${issue.severity}-${issue.title}`} issue={issue} />
            ))}
          </div>
        </article>
      </section>

      {automation.koppelingen.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Procesreis-context</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deze context is alleen ter orientatie; de analyse hierboven gaat over deze automation zelf.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {automation.koppelingen.map((koppeling) => (
              <Link
                key={`${koppeling.doelId}-${koppeling.label}`}
                to={`/automations/${koppeling.doelId}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
              >
                {koppeling.label}
                <ExternalLink className="h-3 w-3" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ConditionRow({ condition }: { condition: HubSpotConditionItem }): React.ReactNode {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-xl border border-border bg-background p-4">
      <span className={`inline-flex h-7 min-w-10 shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-bold uppercase leading-none ${conditionPillClass(condition.kind)}`}>{condition.kind}</span>
      <div>
        <p className="text-sm font-semibold text-foreground">{condition.title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{condition.subtitle}</p>
      </div>
      {condition.badge && <span className="hidden self-start rounded-full bg-secondary/50 px-2.5 py-1 text-xs font-semibold text-muted-foreground sm:inline-flex">{condition.badge}</span>}
    </div>
  );
}

function IssueRow({ issue }: { issue: HubSpotIssue }): React.ReactNode {
  const Icon = issue.severity === "critical" ? ShieldAlert : issue.severity === "resolved" ? CheckCircle2 : issue.severity === "info" ? Info : CircleDot;
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-xl border border-border bg-background p-4">
      <Icon className={`mt-0.5 h-4 w-4 ${issueIconClass(issue.severity)}`} />
      <div>
        <p className="text-sm font-semibold text-foreground">{issue.title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{issue.subtitle}</p>
      </div>
      <span className={`inline-flex h-7 min-w-12 shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-bold leading-none ${issueBadgeClass(issue.severity)}`}>{issue.severity}</span>
    </div>
  );
}

function EmptyBlock({ title, text }: { title: string; text: string }): React.ReactNode {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-border bg-background p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}

function nodeClassName(role: string): string {
  if (role === "source") return "border-purple-200 bg-purple-50";
  if (role === "orchestrator") return "border-amber-200 bg-amber-50";
  return "border-blue-200 bg-blue-50";
}

function metricCardClass(metric: { label: string; value: string }): string {
  if (metric.label !== "Workflow state") return "border-border";
  return metric.value === "Enabled"
    ? "border-green-300"
    : "border-red-300";
}

function conditionPillClass(kind: HubSpotConditionItem["kind"]): string {
  if (kind === "if") return "bg-purple-100 text-purple-700";
  if (kind === "and") return "bg-blue-100 text-blue-700";
  return "bg-teal-100 text-teal-700";
}

function issueIconClass(severity: HubSpotIssue["severity"]): string {
  if (severity === "critical") return "text-red-600";
  if (severity === "resolved") return "text-green-600";
  if (severity === "info") return "text-blue-600";
  return "text-orange-600";
}

function issueBadgeClass(severity: HubSpotIssue["severity"]): string {
  if (severity === "critical") return "bg-red-100 text-red-700";
  if (severity === "resolved") return "bg-green-100 text-green-700";
  if (severity === "info") return "bg-blue-100 text-blue-700";
  return "bg-orange-100 text-orange-700";
}
