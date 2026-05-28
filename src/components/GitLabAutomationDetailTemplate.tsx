import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import {
  getGitLabAutomationDetailPresentation,
  type GitLabDataflowNode,
  type GitLabDetailMetric,
  type GitLabIssue,
  type GitLabLinkedAutomation,
} from "@/lib/gitlabAutomationDetailPresentation";
import type {
  GitLabAutomationMeaningPresentation,
  GitLabMeaningConfidence,
  GitLabOperationFact,
} from "@/lib/gitlabAutomationMeaningPresentation";
import type { Automatisering } from "@/lib/types";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";

interface GitLabAutomationDetailTemplateProps {
  automation: Automatisering;
  allAutomations?: Automatisering[];
  confirmedLinks?: Array<{ sourceId: string; targetId: string }>;
  flowSuggesties?: FlowSuggestie[];
}

export function GitLabAutomationDetailTemplate({
  automation,
  allAutomations = [],
  confirmedLinks = [],
  flowSuggesties = [],
}: GitLabAutomationDetailTemplateProps): React.ReactNode {
  const presentation = getGitLabAutomationDetailPresentation(automation, {
    allAutomations,
    confirmedLinks,
    flowSuggesties,
  });

  return (
    <div aria-label="GitLab automation detail" className="space-y-4">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {presentation.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <article aria-label="GitLab samenvatting" className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold tracking-normal text-slate-950">Wat doet deze backend automation?</h2>
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
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Uitvoering</p>
              <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950">Backend uitvoering</h2>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-bold text-slate-600">
              {presentation.executionSteps.length} stappen
            </span>
          </div>

          <ol className="relative mt-6 space-y-5">
            <span className="absolute bottom-6 left-[21px] top-6 w-px bg-slate-200" aria-hidden="true" />
            {presentation.executionSteps.map((step) => (
              <li key={`${step.index}-${step.title}`} className="relative grid min-w-0 gap-4 pl-12 sm:pl-14">
                <span className={`absolute left-0 top-0 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${stepCircleClass(step.kind)}`}>
                  {step.index}
                </span>
                <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-base font-bold leading-6 text-slate-950">{step.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>
                    </div>
                    <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold uppercase text-slate-700">
                      {step.kind}
                    </span>
                  </div>
                  {step.technicalDetail && (
                    <p className="mt-4 break-all font-mono text-xs leading-5 text-slate-400">{step.technicalDetail}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </article>

        <div className="min-w-0 space-y-4">
          <Card title="GitLab locatie">
            <MetaList items={presentation.locationMeta} />
          </Card>

          <Card title="Inkomende koppelingen">
            <LinkedList links={presentation.incomingLinks} emptyText="Geen inkomende automation gekoppeld aan dit endpoint." />
          </Card>

          <Card title="Brondata">
            <MetaList items={presentation.sourceMeta} />
          </Card>

          <Card title="Issues & gaps">
            <div className="space-y-3">
              {presentation.issues.map((issue) => <IssueRow key={`${issue.title}-${issue.severity}`} issue={issue} />)}
            </div>
          </Card>
        </div>
      </section>

      <section className="grid min-w-0 gap-4">
        <article className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-normal text-slate-950">Call graph</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
              {presentation.callGraph.length} calls
            </span>
          </div>
          {presentation.callGraph.length > 0 ? (
            <div className="mt-4 max-w-full overflow-x-auto rounded-xl border border-slate-200">
              <div className="min-w-[720px]">
              <div className="grid grid-cols-[72px_120px_minmax(0,1fr)_minmax(0,1fr)] bg-slate-50 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                <div className="p-3">Depth</div>
                <div className="p-3">Kind</div>
                <div className="p-3">From</div>
                <div className="p-3">To</div>
              </div>
              {presentation.callGraph.map((call, index) => (
                <div key={`${call.from}-${call.to}-${index}`} className="grid grid-cols-[72px_120px_minmax(0,1fr)_minmax(0,1fr)] border-t border-slate-200 text-sm">
                  <div className="p-3 font-mono text-xs text-slate-500">{call.depth}</div>
                  <div className="p-3 text-xs font-semibold text-slate-700">{call.kind}</div>
                  <div className="break-words p-3 font-mono text-xs leading-5 text-slate-500">{call.from}</div>
                  <div className="break-words p-3 font-mono text-xs leading-5 text-slate-700">{call.to}</div>
                </div>
              ))}
              </div>
            </div>
          ) : (
            <EmptyBlock title="Geen call graph beschikbaar" text="De opgeslagen GitLab brondata bevat geen uitgewerkte calls voor deze automation." />
          )}
        </article>
      </section>

      {presentation.linkedAutomations.length > 0 && (
        <section className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-normal text-slate-950">Gekoppelde automations</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
              Webhook/link bewijs
            </span>
          </div>
          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {presentation.linkedAutomations.map((link) => (
              <Link
                key={`${link.direction}-${link.id}`}
                to={link.href}
                className="grid gap-3 p-4 transition-colors hover:bg-slate-50 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-950">{link.name}</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-500">{link.subtitle}</span>
                </span>
                <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
                  {link.evidence}
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <MeaningCard meaning={presentation.meaning} />
    </div>
  );
}

function MetricCard({ metric }: { metric: GitLabDetailMetric }): React.ReactNode {
  return (
    <article className={`min-h-[116px] rounded-[18px] border bg-white p-5 shadow-sm ${metricToneClass(metric.tone)}`}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{metric.label}</p>
      <p className="mt-2 break-words text-2xl font-bold tracking-tight text-slate-950">{metric.value}</p>
      <p className="mt-1 break-words text-sm leading-5 text-slate-500">{metric.detail}</p>
    </article>
  );
}

function DataflowNode({ node }: { node: GitLabDataflowNode }): React.ReactNode {
  return (
    <div className={`flex min-h-[116px] w-[210px] shrink-0 flex-col justify-center rounded-xl border p-4 ${nodeRoleClass(node.role)}`}>
      <p className="break-words text-sm font-bold text-slate-950">{node.name}</p>
      <p className="mt-1 break-words text-xs leading-5 text-slate-600">{node.subtitle}</p>
    </div>
  );
}

function DataflowArrow({ label }: { label: string }): React.ReactNode {
  return (
    <div className="flex w-[72px] shrink-0 flex-col justify-center px-2 text-center">
      <span className="mb-2 text-[11px] font-bold leading-4 text-slate-500">{label}</span>
      <div className="flex items-center justify-center">
        <span className="h-px flex-1 bg-slate-300" />
        <ArrowRight className="mx-1 h-5 w-5 shrink-0 text-slate-900" />
        <span className="h-px flex-1 bg-slate-300" />
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }): React.ReactNode {
  return (
    <article className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold tracking-normal text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function MeaningCard({ meaning }: { meaning: GitLabAutomationMeaningPresentation }): React.ReactNode {
  return (
    <article aria-label="GitLab betekenisanalyse" className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Bronbewuste analyse</p>
          <h2 className="mt-1 text-lg font-bold tracking-normal text-slate-950">Wat gebeurt er precies?</h2>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${confidenceClass(meaning.confidence)}`}>
            Analysekwaliteit: {meaning.confidenceLabel}
          </span>
          {meaning.curated && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
              Handmatig verrijkt
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MeaningSection title="Input" facts={meaning.ontvangt} emptyText="Inputvelden niet bewezen in de beschikbare brondata." />
        <MeaningSection title="Wordt opgehaald" facts={meaning.haaltOp} emptyText="Concrete reads niet bewezen in de beschikbare brondata." />
        <MeaningSection title="Berekent" facts={meaning.berekent} emptyText="Concrete berekening of beslissing niet bewezen in de beschikbare brondata." />
        <MeaningSection title="Wordt aangepast" facts={meaning.pastAan} emptyText="Concrete writes niet bewezen in de beschikbare brondata." />
        <MeaningSection title="Response" facts={meaning.stuurtTerug} emptyText="Response niet concreet bewezen in de beschikbare brondata." />
        <MeaningSection title="Achtergrondtaak" facts={meaning.backgroundWork} emptyText="Geen achtergrondtaak bewezen in de beschikbare brondata." />
      </div>
    </article>
  );
}

function MeaningSection({ title, facts, emptyText }: { title: string; facts: GitLabOperationFact[]; emptyText: string }): React.ReactNode {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
      {facts.length > 0 ? (
        <div className="mt-3 space-y-3">
          {facts.slice(0, 3).map((fact) => (
            <div key={`${title}-${fact.label}-${fact.description}`} className="min-w-0">
              <p className="break-words text-sm font-bold text-slate-950">{fact.label}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{fact.description}</p>
              {fact.technicalDetail && (
                <p className="mt-2 break-all font-mono text-[11px] leading-5 text-slate-400">{fact.technicalDetail}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-slate-500">{emptyText}</p>
      )}
    </section>
  );
}

function MetaList({ items }: { items: Array<{ label: string; value: string }> }): React.ReactNode {
  return (
    <dl className="grid gap-3">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="grid gap-1 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0 sm:flex sm:items-start sm:justify-between sm:gap-4">
          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{item.label}</dt>
          <dd className="min-w-0 break-all font-mono text-xs leading-5 text-slate-700 sm:max-w-[58%] sm:text-right">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LinkedList({ links, emptyText }: { links: GitLabLinkedAutomation[]; emptyText: string }): React.ReactNode {
  if (links.length === 0) return <EmptyBlock title="Geen koppeling" text={emptyText} />;

  return (
    <div className="space-y-3">
      {links.map((link) => (
        <Link key={`${link.direction}-${link.id}`} to={link.href} className="block rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition-colors hover:bg-slate-50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950">{link.name}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{link.subtitle}</p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700">
              {link.evidence}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function IssueRow({ issue }: { issue: GitLabIssue }): React.ReactNode {
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${issueDotClass(issue.severity)}`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{issue.title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{issue.subtitle}</p>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${issueTagClass(issue.severity)}`}>
        {issue.severity}
      </span>
    </div>
  );
}

function EmptyBlock({ title, text }: { title: string; text: string }): React.ReactNode {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}

function metricToneClass(tone: GitLabDetailMetric["tone"]): string {
  if (tone === "success") return "border-green-200";
  if (tone === "warning") return "border-orange-200";
  if (tone === "danger") return "border-red-200";
  return "border-slate-200";
}

function nodeRoleClass(role: GitLabDataflowNode["role"]): string {
  if (role === "source") return "border-purple-200 bg-purple-50";
  if (role === "endpoint") return "border-slate-300 bg-slate-50";
  if (role === "handler") return "border-amber-200 bg-amber-50";
  return "border-teal-200 bg-teal-50";
}

function stepCircleClass(kind: string): string {
  if (kind === "start") return "bg-purple-100 text-purple-700";
  if (kind === "handler") return "bg-slate-200 text-slate-700";
  if (kind === "read") return "bg-blue-100 text-blue-700";
  if (kind === "write") return "bg-teal-100 text-teal-700";
  if (kind === "response") return "bg-green-100 text-green-700";
  return "bg-amber-100 text-amber-700";
}

function issueDotClass(severity: GitLabIssue["severity"]): string {
  if (severity === "critical") return "bg-red-500";
  if (severity === "gap") return "bg-orange-500";
  if (severity === "ok") return "bg-green-500";
  return "bg-blue-500";
}

function issueTagClass(severity: GitLabIssue["severity"]): string {
  if (severity === "critical") return "bg-red-100 text-red-700";
  if (severity === "gap") return "bg-orange-100 text-orange-700";
  if (severity === "ok") return "bg-green-100 text-green-700";
  return "bg-blue-100 text-blue-700";
}

function confidenceClass(confidence: GitLabMeaningConfidence): string {
  if (confidence === "hoog") return "border border-green-200 bg-green-50 text-green-700";
  if (confidence === "middel") return "border border-blue-200 bg-blue-50 text-blue-700";
  return "border border-orange-200 bg-orange-50 text-orange-700";
}
