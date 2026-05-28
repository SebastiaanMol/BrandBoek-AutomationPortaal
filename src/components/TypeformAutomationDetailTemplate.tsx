import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import {
  getTypeformAutomationDetailPresentation,
  type TypeformDataflowNode,
  type TypeformDetailMetric,
  type TypeformIssue,
  type TypeformQuestionPresentation,
  type TypeformWebhookPresentation,
} from "@/lib/typeformAutomationDetailPresentation";
import type { Automatisering } from "@/lib/types";

export function TypeformAutomationDetailTemplate({
  automation,
  allAutomations = [],
}: {
  automation: Automatisering;
  allAutomations?: Automatisering[];
}): React.ReactNode {
  const presentation = getTypeformAutomationDetailPresentation(automation);

  return (
    <div aria-label="Typeform automation detail" className="space-y-4">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {presentation.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <article aria-label="Typeform samenvatting" className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <h2 className="text-lg font-bold tracking-normal text-slate-950">Wat doet dit Typeform formulier?</h2>
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

      <section className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold tracking-normal text-slate-950">Dataflow</h2>
        <div className="mt-5 max-w-full overflow-x-auto pb-2">
          <div className="flex w-max min-w-full items-stretch">
            {presentation.dataflow.map((node, index) => (
              <div key={`${node.name}-${index}`} className="flex shrink-0 items-stretch">
                <DataflowNode node={node} />
                {index < presentation.dataflow.length - 1 && (
                  <DataflowArrow label={node.arrowLabel ?? "naar"} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <article className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Formulier</p>
              <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950">Formulieropbouw</h2>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-bold text-slate-600">
              {presentation.questions.length} vragen
            </span>
          </div>

          {presentation.questions.length > 0 ? (
            <ol className="relative mt-6 space-y-5">
              <span className="absolute bottom-6 left-[21px] top-6 w-px bg-slate-200" aria-hidden="true" />
              {presentation.questions.map((question) => (
                <QuestionItem key={`${question.index}-${question.title}`} question={question} />
              ))}
            </ol>
          ) : (
            <EmptyBlock title="Geen formulieropbouw beschikbaar" text="De opgeslagen Typeform-data bevat geen zichtbare velden voor dit formulier." />
          )}
        </article>

        <div className="min-w-0 space-y-4">
          <Card title="Verborgen contextvelden">
            {presentation.hiddenFields.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {presentation.hiddenFields.map((field) => (
                  <span key={field} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-xs font-semibold text-slate-700">
                    {field}
                  </span>
                ))}
              </div>
            ) : (
              <EmptyBlock title="Geen hidden fields bekend" text="Typeform heeft geen verborgen contextvelden meegestuurd in de opgeslagen brondata." />
            )}
          </Card>

          <Card title="Routing na verzenden">
            {presentation.routing.length > 0 ? (
              <div className="space-y-3">
                {presentation.routing.map((route) => (
                  <div key={`${route.label}-${route.destination}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold text-slate-950">{route.label}</p>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                        {route.destination}
                      </span>
                    </div>
                    <p className="mt-2 break-words text-xs leading-5 text-slate-500">{route.detail}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyBlock title="Routing niet opgeslagen" text="De opgeslagen Typeform-data bevat geen thank-you of redirect details voor dit formulier." />
            )}
          </Card>

          <Card title="Brondata">
            <MetaList items={presentation.sourceMeta} />
          </Card>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card title="Webhook-overdracht">
          {presentation.webhooks.length > 0 ? (
            <div className="space-y-3">
              {presentation.webhooks.map((webhook) => <WebhookRow key={`${webhook.label}-${webhook.destination}`} webhook={webhook} />)}
            </div>
          ) : (
            <EmptyBlock title="Geen webhook opgeslagen" text="Er is geen Typeform-webhook gevonden die dit formulier automatisch doorstuurt." />
          )}
        </Card>

        <Card title="Issues & gaps">
          <div className="space-y-3">
            {presentation.issues.map((issue) => <IssueRow key={`${issue.title}-${issue.tag}`} issue={issue} />)}
          </div>
        </Card>
      </section>

      {automation.koppelingen.length > 0 && (
        <section className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-normal text-slate-950">Gekoppelde automations</h2>
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

function MetricCard({ metric }: { metric: TypeformDetailMetric }): React.ReactNode {
  return (
    <article className={`min-h-[116px] rounded-[18px] border bg-white p-5 shadow-sm ${metricToneClass(metric.tone)}`}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{metric.label}</p>
      <p className="mt-2 break-words text-2xl font-bold tracking-tight text-slate-950">{metric.value}</p>
      <p className="mt-1 text-sm leading-5 text-slate-500">{metric.detail}</p>
    </article>
  );
}

function DataflowNode({ node }: { node: TypeformDataflowNode }): React.ReactNode {
  return (
    <div className={`flex min-h-[116px] w-[210px] shrink-0 flex-col justify-center rounded-xl border p-4 ${nodeRoleClass(node.role)}`}>
      <p className="break-words text-sm font-bold text-slate-950">{node.name}</p>
      <p className="mt-1 break-words text-xs leading-5 text-slate-600">{node.subtitle}</p>
    </div>
  );
}

function DataflowArrow({ label }: { label: string }): React.ReactNode {
  return (
    <div className="flex w-[78px] shrink-0 flex-col justify-center px-2 text-center">
      <span className="mb-2 text-[11px] font-bold leading-4 text-slate-500">{label}</span>
      <div className="flex items-center justify-center">
        <span className="h-px flex-1 bg-slate-300" />
        <ArrowRight className="mx-1 h-5 w-5 shrink-0 text-slate-900" />
        <span className="h-px flex-1 bg-slate-300" />
      </div>
    </div>
  );
}

function QuestionItem({ question }: { question: TypeformQuestionPresentation }): React.ReactNode {
  return (
    <li className="relative grid min-w-0 gap-4 pl-12 sm:pl-14">
      <span className="absolute left-0 top-0 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white">
        {question.index}
      </span>
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="break-words text-base font-bold leading-6 text-slate-950">{question.title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{question.subtitle}</p>
          </div>
          <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold uppercase text-slate-700">
            {question.typeLabel}
          </span>
        </div>

        {question.choices.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {question.choices.map((choice) => (
              <span key={choice} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {choice}
              </span>
            ))}
          </div>
        )}

        {question.technicalDetail && (
          <p className="mt-4 break-all font-mono text-xs leading-5 text-slate-400">{question.technicalDetail}</p>
        )}
      </div>
    </li>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }): React.ReactNode {
  return (
    <article className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold tracking-normal text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function MetaList({ items }: { items: Array<{ label: string; value: string }> }): React.ReactNode {
  return (
    <dl className="grid gap-3">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="flex items-start justify-between gap-4 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{item.label}</dt>
          <dd className="max-w-[55%] break-words text-right text-sm leading-5 text-slate-700">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function WebhookRow({ webhook }: { webhook: TypeformWebhookPresentation }): React.ReactNode {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-950">{webhook.label}</p>
          <p className="mt-1 break-words text-sm leading-6 text-slate-600">{webhook.destination}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${webhook.status === "Actief" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
          {webhook.status}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{webhook.detail}</p>
      <p className="mt-2 font-mono text-xs text-slate-400">{webhook.eventLabel}</p>
    </div>
  );
}

function IssueRow({ issue }: { issue: TypeformIssue }): React.ReactNode {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${issueDotClass(issue.severity)}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-950">{issue.title}</p>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
            {issue.tag}
          </span>
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-600">{issue.description}</p>
      </div>
    </div>
  );
}

function EmptyBlock({ title, text }: { title: string; text: string }): React.ReactNode {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}

function metricToneClass(tone: string): string {
  if (tone === "good") return "border-emerald-200";
  if (tone === "warning") return "border-amber-200";
  if (tone === "danger") return "border-red-200";
  return "border-slate-200";
}

function nodeRoleClass(role: TypeformDataflowNode["role"]): string {
  if (role === "visitor") return "border-pink-200 bg-pink-50";
  if (role === "form") return "border-slate-300 bg-slate-50";
  if (role === "routing") return "border-amber-200 bg-amber-50";
  if (role === "webhook") return "border-teal-200 bg-teal-50";
  return "border-blue-200 bg-blue-50";
}

function issueDotClass(severity: string): string {
  if (severity === "critical") return "bg-red-500";
  if (severity === "warning") return "bg-amber-500";
  return "bg-emerald-500";
}
