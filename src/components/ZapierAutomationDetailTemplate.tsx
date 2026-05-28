import { ArrowRight, Check, X } from "lucide-react";
import { Link } from "react-router-dom";
import {
  getZapierAutomationDetailPresentation,
  type ZapierDetailMetric,
  type ZapierIssue,
  type ZapierStepCard,
  type ZapierStepRole,
} from "@/lib/zapierAutomationDetailPresentation";
import type { Automatisering, Pipeline } from "@/lib/types";

export function ZapierAutomationDetailTemplate({
  automation,
  allAutomations = [],
  pipelines = [],
}: {
  automation: Automatisering;
  allAutomations?: Automatisering[];
  pipelines?: Pipeline[];
}): React.ReactNode {
  const presentation = getZapierAutomationDetailPresentation(automation, { allAutomations, pipelines });

  return (
    <div aria-label="Zapier automation detail" className="space-y-4">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {presentation.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <article aria-label="Zapier samenvatting" className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <h2 className="text-lg font-bold tracking-normal text-slate-950">Wat doet deze Zap?</h2>
          <div className="flex flex-wrap gap-2 lg:max-w-[420px] lg:justify-end">
            {presentation.evidenceBadges.map((badge) => (
              <span key={badge} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {badge}
              </span>
            ))}
          </div>
        </div>
        <p className="mt-4 max-w-4xl text-base leading-7 text-slate-600">{presentation.summary}</p>
      </article>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <article aria-label="Zapier stappenplan" className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Uitvoering</p>
              <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950">Zapier stappenplan</h2>
            </div>
            <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-sm font-bold text-orange-700">
              {presentation.stepCards.length || presentation.metrics[1]?.value || 0} stappen
            </span>
          </div>

          {presentation.stepCards.length > 0 ? (
            <ol className="relative mt-6 space-y-6">
              <span className="absolute left-[22px] top-7 bottom-7 w-px bg-slate-200" aria-hidden="true" />
              {presentation.stepCards.map((step) => (
                <ZapierStepItem key={`${step.index}-${step.title}`} step={step} />
              ))}
            </ol>
          ) : (
            <EmptyBlock title="Geen Zapier stappen beschikbaar" text="De opgeslagen Zapier-data bevat geen uitgewerkte step chain." />
          )}
        </article>

        <div className="space-y-4">
          <Card title="Betrokken apps">
            <div className="space-y-3">
              {presentation.apps.length > 0 ? (
                presentation.apps.map((app) => (
                  <div key={`${app.name}-${app.role}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">{app.name}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Gebruikt als {app.role}</p>
                    </div>
                    <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-700">
                      Zapier
                    </span>
                  </div>
                ))
              ) : (
                <EmptyBlock title="Geen apps beschikbaar" text="Zapier heeft geen app-informatie meegestuurd in deze brondata." />
              )}
            </div>
          </Card>

          <Card title="Zapier metadata">
            <dl className="grid gap-3">
              {presentation.sourceMeta.map((item) => (
                <div key={`${item.label}-${item.value}`} className="flex items-start justify-between gap-4 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                  <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{item.label}</dt>
                  <dd className="max-w-[55%] break-words text-right font-mono text-xs leading-5 text-slate-700">{item.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="Gaps in deze Zap">
            <div className="space-y-3">
              {presentation.issues.length > 0 ? (
                presentation.issues.map((issue) => <IssueRow key={`${issue.title}-${issue.severity}`} issue={issue} />)
              ) : (
                <EmptyBlock title="Geen gaps gevonden" text="Er zijn geen open bronmeldingen of ontbrekende context voor deze Zap bekend." />
              )}
            </div>
          </Card>
        </div>
      </section>

      {automation.koppelingen.length > 0 && (
        <section className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-normal text-slate-950">Gekoppelde automatiseringen</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
              Handmatig gedocumenteerd
            </span>
          </div>
          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {automation.koppelingen.map((koppeling) => {
              const linkedAutomation = allAutomations.find((item) => item.id === koppeling.doelId);
              return (
                <Link
                  key={`${koppeling.doelId}-${koppeling.label}`}
                  to={`/automations/${koppeling.doelId}`}
                  className="grid gap-3 p-4 transition-colors hover:bg-slate-50 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-950">{linkedAutomation?.naam || koppeling.label}</span>
                    <span className="mt-1 block text-sm leading-6 text-slate-500">
                      {linkedAutomation?.trigger || "Handmatig gekoppeld in het portaal."}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function MetricCard({ metric }: { metric: ZapierDetailMetric }): React.ReactNode {
  return (
    <article className={`min-h-[116px] rounded-[18px] border bg-white p-5 shadow-sm ${metricCardClass(metric)}`}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{metric.label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${metricValueClass(metric)}`}>{metric.value}</p>
      <p className="mt-1 text-sm leading-5 text-slate-500">{metric.detail}</p>
    </article>
  );
}

function ZapierStepItem({ step }: { step: ZapierStepCard }): React.ReactNode {
  return (
    <li className="relative grid gap-4 pl-14 sm:grid-cols-[1fr_auto]">
      <span className={`absolute left-0 top-0 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${stepCircleClass(step.role)}`}>
        {step.index}
      </span>

      <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold leading-6 text-slate-950">{step.title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>
          </div>
          <span className={`inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold uppercase ${roleBadgeClass(step.role)}`}>
            {stepTypeLabel(step.role)}
          </span>
        </div>

        {step.filter && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Filtervoorwaarde</p>
            <p className="mt-1 text-sm font-semibold text-blue-950">{step.filter.condition}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                <Check className="h-3 w-3" />
                Ja: {step.filter.yesLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">
                <X className="h-3 w-3" />
                Nee: {step.filter.noLabel}
              </span>
            </div>
          </div>
        )}

        <p className="mt-4 break-words font-mono text-xs leading-5 text-slate-400">{step.technicalDetail}</p>
      </div>
    </li>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }): React.ReactNode {
  return (
    <article className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold tracking-normal text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function IssueRow({ issue }: { issue: ZapierIssue }): React.ReactNode {
  const isCritical = issue.severity === "critical";
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${isCritical ? "bg-red-500" : "bg-orange-500"}`} />
      <div>
        <p className="text-sm font-semibold text-slate-950">{issue.title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{issue.subtitle}</p>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${isCritical ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
        {isCritical ? "critical" : "gap"}
      </span>
    </div>
  );
}

function EmptyBlock({ title, text }: { title: string; text: string }): React.ReactNode {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}

function metricCardClass(metric: ZapierDetailMetric): string {
  if (metric.label !== "Status") return "border-slate-200";
  if (metric.value === "Enabled") return "border-green-300";
  if (metric.value === "Disabled") return "border-red-300";
  return "border-slate-200";
}

function metricValueClass(metric: ZapierDetailMetric): string {
  if (metric.label !== "Status") return "text-slate-950";
  if (metric.value === "Enabled") return "text-green-700";
  if (metric.value === "Disabled") return "text-red-700";
  return "text-slate-950";
}

function stepCircleClass(role: ZapierStepRole): string {
  if (role === "trigger") return "bg-pink-100 text-pink-700";
  if (role === "middleware") return "bg-slate-200 text-slate-700";
  if (role === "lookup") return "bg-purple-100 text-purple-700";
  if (role === "condition") return "bg-blue-100 text-blue-700";
  return "bg-teal-100 text-teal-700";
}

function roleBadgeClass(role: ZapierStepRole): string {
  if (role === "trigger") return "bg-pink-100 text-pink-700";
  if (role === "middleware") return "bg-slate-200 text-slate-700";
  if (role === "lookup") return "bg-purple-100 text-purple-700";
  if (role === "condition") return "bg-blue-100 text-blue-700";
  return "bg-teal-100 text-teal-700";
}

function stepTypeLabel(role: ZapierStepRole): string {
  if (role === "middleware") return "delay";
  if (role === "condition") return "filter";
  if (role === "action") return "actie";
  return role;
}
