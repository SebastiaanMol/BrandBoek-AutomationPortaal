import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  GitBranch,
  Layers,
  Link2,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  useAutomatiseringenIncludingLegacyGitlab,
  useDeleteFlow,
  useFlows,
  useUpdateFlow,
} from "@/lib/hooks";
import {
  useAllConfirmedAutomationLinks,
  useBevestigFlowSuggestie,
  useOngedaanVerwerpFlowSuggestie,
  useOpenSuggestiesVoorFlow,
  useVerwerpFlowSuggestie,
} from "@/lib/queryHooks/automationLinks";
import {
  getProcessJourneyDetailPresentation,
  type ProcessJourneyAutomationCardPresentation,
  type ProcessJourneyChangeSummary,
  type ProcessJourneyDetailPresentation,
  type ProcessJourneyEvidenceItem,
  type ProcessJourneyMetricPresentation,
  type ProcessJourneyNodePresentation,
  type ProcessJourneyStepPresentation,
  type ProcessJourneyTransitionPresentation,
} from "@/lib/processJourneyDetailPresentation";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import type { Automatisering, Flow, Systeem } from "@/lib/types";
import { expandFlowAutomationIds } from "@/lib/flowRuntimeChain";

export default function FlowDetail(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: flows = [], isLoading: flowsLoading } = useFlows();
  const { data: automations = [] } = useAutomatiseringenIncludingLegacyGitlab();
  const { data: confirmedLinks = [] } = useAllConfirmedAutomationLinks();
  const updateFlow = useUpdateFlow();
  const deleteFlow = useDeleteFlow();

  const flow = useMemo(() => flows.find((item) => item.id === id), [flows, id]);
  const { data: openSuggestions = [] } = useOpenSuggestiesVoorFlow(flow?.id);
  const autoMap = useMemo(
    () => new Map(automations.map((automation) => [automation.id, automation])),
    [automations],
  );

  const [naam, setNaam] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const initializedRef = useRef<string | null>(null);
  const flowId = flow?.id;
  const flowNaam = flow?.naam;

  const runtimeAutomationIds = useMemo(
    () => (flow ? expandFlowAutomationIds(flow.automationIds, confirmedLinks) : []),
    [flow, confirmedLinks],
  );
  const flowForDisplay = useMemo(
    () => (flow ? { ...flow, automationIds: runtimeAutomationIds } : null),
    [flow, runtimeAutomationIds],
  );
  const firstAutoId = flowForDisplay?.automationIds[0] ?? null;

  useEffect(() => {
    if (flowId && initializedRef.current !== flowId) {
      initializedRef.current = flowId;
      setNaam(flowNaam ?? "");
      setShowDeleteConfirm(false);
    }
  }, [flowId, flowNaam, firstAutoId]);

  const isDirty = flow !== undefined && naam !== flow.naam;

  if (flowsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (!flow || !flowForDisplay) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Procesreis niet gevonden.</p>
      </div>
    );
  }

  const missingRuntimeIds = flowForDisplay.automationIds.filter((autoId) => !autoMap.get(autoId));
  const involvedAutomations = flowForDisplay.automationIds
    .map((autoId) => autoMap.get(autoId))
    .filter((automation): automation is Automatisering => automation !== undefined);
  const journey = getProcessJourneyDetailPresentation({
    flow: { ...flowForDisplay, naam },
    automations: involvedAutomations,
    confirmedLinks,
    openSuggestions,
  });

  async function handleSave(): Promise<void> {
    try {
      await updateFlow.mutateAsync({ id: flow!.id, naam });
      toast.success("Opgeslagen");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Opslaan mislukt");
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await deleteFlow.mutateAsync(flow!.id);
      toast.success("Procesreis verwijderd");
      navigate("/flows");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verwijderen mislukt");
    }
  }

  async function handleRemoveAutomation(autoId: string): Promise<void> {
    const newIds = flow!.automationIds.filter((automationId) => automationId !== autoId);
    const remainingAutomations = newIds
      .map((automationId) => autoMap.get(automationId))
      .filter((automation): automation is Automatisering => automation !== undefined);
    const systemen = [...new Set(remainingAutomations.flatMap((automation) => automation.systemen))] as Systeem[];

    try {
      await updateFlow.mutateAsync({ id: flow!.id, automationIds: newIds, systemen });
      toast.success("Automation verwijderd uit procesreis");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verwijderen mislukt");
    }
  }

  async function handleConfirmSuggestion(fromId: string, toId: string): Promise<void> {
    const newIds = [...new Set([...flow!.automationIds, fromId, toId])];
    const newAutomations = newIds
      .map((automationId) => autoMap.get(automationId))
      .filter((automation): automation is Automatisering => automation !== undefined);
    const systemen = [...new Set(newAutomations.flatMap((automation) => automation.systemen))] as Systeem[];

    await updateFlow.mutateAsync({
      id: flow!.id,
      automationIds: newIds,
      systemen,
    });
  }

  return (
    <div className="min-h-screen bg-slate-50/70">
      <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <ProcessJourneyHeader
          flow={flow}
          journey={journey}
          naam={naam}
          setNaam={setNaam}
          isDirty={isDirty}
          onSave={handleSave}
          isSaving={updateFlow.isPending}
        />

        <MetricGrid metrics={journey.metrics} />

        <StoryCard journey={journey} />

        <JourneyChain nodes={journey.nodes} transitions={journey.transitions} />

        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
          <ProcessSteps steps={journey.steps} transitions={journey.transitions} />
          <aside className="min-w-0 space-y-6">
            <EvidenceCard evidenceItems={journey.evidenceItems} />
            <ChangeCard changeSummary={journey.changeSummary} />
            {journey.gaps.length > 0 && <GapCard gaps={journey.gaps} />}
          </aside>
        </div>

        <AutomationCards cards={journey.automationCards} />

        <OpenSuggestiesCard
          flowId={flow.id}
          automationIds={flow.automationIds}
          onBevestig={handleConfirmSuggestion}
        />

        {missingRuntimeIds.length > 0 && (
          <MissingAutomationRecords
            ids={missingRuntimeIds}
            onRemoveAutomation={handleRemoveAutomation}
          />
        )}

        <DeleteFlowCard
          showDeleteConfirm={showDeleteConfirm}
          setShowDeleteConfirm={setShowDeleteConfirm}
          onDelete={handleDelete}
          isDeleting={deleteFlow.isPending}
        />
      </main>
    </div>
  );
}

function ProcessJourneyHeader({
  flow,
  journey,
  naam,
  setNaam,
  isDirty,
  onSave,
  isSaving,
}: {
  flow: Flow;
  journey: ProcessJourneyDetailPresentation;
  naam: string;
  setNaam: (value: string) => void;
  isDirty: boolean;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <Link
            to="/flows"
            className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Terug naar procesreizen
          </Link>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {journey.statusBadges.map((badge) => (
              <HeaderBadge key={badge} label={badge} />
            ))}
          </div>

          <label className="sr-only" htmlFor="process-journey-name">
            Procesreisnaam
          </label>
          <input
            id="process-journey-name"
            value={naam}
            onChange={(event) => setNaam(event.target.value)}
            className="mt-4 block w-full border-b border-transparent bg-transparent pb-1 text-3xl font-bold tracking-normal text-slate-950 outline-none transition-colors hover:border-slate-200 focus:border-slate-300 sm:text-4xl"
          />

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {journey.subtitle}
          </p>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
            {journey.meta.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {isDirty && (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Opslaan..." : "Opslaan"}
            </button>
          )}
          <Link
            to="/flows"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
          >
            Overzicht
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Procesreis
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          <GitBranch className="h-3.5 w-3.5" />
          ID {flow.id}
        </span>
      </div>
    </header>
  );
}

function MetricGrid({ metrics }: { metrics: ProcessJourneyMetricPresentation[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Procesreis metrics">
      {metrics.map((metric) => (
        <article
          key={metric.label}
          className={`rounded-2xl border bg-white p-5 shadow-sm ${metricToneClass(metric.tone)}`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {metric.label}
          </p>
          <p className="mt-3 text-2xl font-bold tracking-normal text-slate-950">
            {metric.value}
          </p>
          <p className="mt-1 text-sm leading-5 text-slate-500">{metric.detail}</p>
        </article>
      ))}
    </section>
  );
}

function StoryCard({ journey }: { journey: ProcessJourneyDetailPresentation }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Procesbetekenis
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-normal text-slate-950">
            Wat gebeurt er in deze procesreis?
          </h2>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${qualityClass(journey.analysisQuality)}`}>
          Bewijs: {journey.analysisQuality}
        </span>
      </div>
      <div className="mt-4 max-w-5xl space-y-3 text-sm leading-7 text-slate-600">
        {journey.storyParagraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}

function JourneyChain({
  nodes,
  transitions,
}: {
  nodes: ProcessJourneyNodePresentation[];
  transitions: ProcessJourneyTransitionPresentation[];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Keten
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950">Visuele keten</h2>
        </div>
        <p className="text-sm text-slate-500">
          Pijlen tonen het bewijs voor de overgang, niet de volledige automation-inhoud.
        </p>
      </div>

      {nodes.length === 0 ? (
        <EmptyPanel text="Er zijn nog geen beschikbare automations in deze procesreis." />
      ) : (
        <div className="mt-5 overflow-x-auto pb-2" aria-label="Visuele procesketen">
          <div className="flex min-w-max items-stretch gap-3">
            {nodes.map((node, index) => (
              <div key={node.id} className="flex items-stretch gap-3">
                <ChainNode node={node} />
                {transitions[index] && <ChainTransition transition={transitions[index]} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ChainNode({ node }: { node: ProcessJourneyNodePresentation }) {
  return (
    <Link
      to={node.href}
      className={`group flex min-h-[148px] w-[250px] flex-col justify-between rounded-2xl border bg-white p-4 shadow-sm transition-colors hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 ${sourceBorderClass(node.tone)}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <SourceBadge tone={node.tone} label={node.sourceLabel} />
          <ExternalLink className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-slate-900" />
        </div>
        <h3 className="mt-3 line-clamp-2 text-sm font-bold leading-5 text-slate-950">
          {node.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{node.roleLabel}</p>
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-600">{node.description}</p>
    </Link>
  );
}

function ChainTransition({ transition }: { transition: ProcessJourneyTransitionPresentation }) {
  return (
    <div
      role="separator"
      aria-label={`${transition.label}: ${transition.description}`}
      className="flex min-w-[150px] flex-col items-center justify-center gap-2"
    >
      <div className="flex w-full items-center gap-2">
        <div className="h-px flex-1 bg-slate-200" />
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${transitionToneClass(transition.tone)}`}>
          <ArrowRight className="h-4 w-4" />
        </span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${transitionTonePillClass(transition.tone)}`}>
        {transition.label}
      </span>
      <span className="text-[11px] text-slate-500">100% bewezen</span>
    </div>
  );
}

function ProcessSteps({
  steps,
  transitions,
}: {
  steps: ProcessJourneyStepPresentation[];
  transitions: ProcessJourneyTransitionPresentation[];
}) {
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      aria-label="Stap voor stap overzicht"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Processtappen
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950">Hoe beweegt het werk?</h2>
        </div>
        <span className="w-fit rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
          {steps.length} stappen
        </span>
      </div>

      {steps.length === 0 ? (
        <EmptyPanel text="Geen processtappen beschikbaar." />
      ) : (
        <div className="mt-5 space-y-0">
          {steps.map((step, index) => (
            <div key={`${step.index}-${step.href}`} className="relative pl-12">
              {index < steps.length - 1 && (
                <div className="absolute left-[17px] top-10 h-full w-px bg-slate-200" aria-hidden="true" />
              )}
              <div className={`absolute left-0 top-1 flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${sourceCircleClass(step.tone)}`}>
                {step.index}
              </div>

              <Link
                to={step.href}
                className="group block rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:border-slate-400 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <SourceBadge tone={step.tone} label={step.sourceLabel} />
                      {step.badges.slice(1, 3).map((badge) => (
                        <span key={badge} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                          {badge}
                        </span>
                      ))}
                    </div>
                    <h3 className="mt-2 text-base font-bold tracking-normal text-slate-950">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-slate-900" />
                </div>
              </Link>

              {transitions[index] && (
                <div
                  role="separator"
                  aria-label={`Overgang na stap ${step.index}: ${transitions[index].label}`}
                  className="ml-0 flex items-center gap-3 py-3 text-xs text-slate-500"
                >
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${transitionTonePillClass(transitions[index].tone)}`}>
                    {transitions[index].evidenceLabel}
                  </span>
                  <span className="min-w-0">{transitions[index].description}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EvidenceCard({ evidenceItems }: { evidenceItems: ProcessJourneyEvidenceItem[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        Bewijs
      </p>
      <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950">Bewijs per overgang</h2>
      <div className="mt-4 space-y-3">
        {evidenceItems.map((item, index) => (
          <EvidenceRow key={`${item.title}-${index}`} item={item} />
        ))}
      </div>
    </section>
  );
}

function ChangeCard({ changeSummary }: { changeSummary: ProcessJourneyChangeSummary }) {
  const rows = [
    { label: "Komt binnen", values: changeSummary.receives },
    { label: "Wordt opgehaald", values: changeSummary.reads },
    { label: "Wordt bepaald", values: changeSummary.determines },
    { label: "Wordt bijgewerkt", values: changeSummary.writes },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        Procesdata
      </p>
      <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950">Wat verandert er?</h2>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {row.label}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.values.map((value) => (
                <span key={value} className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
                  {value}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GapCard({ gaps }: { gaps: ProcessJourneyEvidenceItem[] }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
            Open gaps
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950">Mogelijke vervolgen</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Deze verbindingen zijn niet bewezen met een exacte webhook-match en staan daarom los van de keten.
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {gaps.map((gap, index) => (
          <EvidenceRow key={`${gap.title}-${index}`} item={gap} />
        ))}
      </div>
    </section>
  );
}

function AutomationCards({ cards }: { cards: ProcessJourneyAutomationCardPresentation[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Automation-records
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950">
            Automations in deze procesreis
          </h2>
        </div>
        <p className="text-sm text-slate-500">Klik door voor bronanalyse, raw data en beheer.</p>
      </div>

      {cards.length === 0 ? (
        <EmptyPanel text="Er zijn nog geen automation-records gekoppeld aan deze procesreis." />
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.id}
              to={card.href}
              className={`group rounded-2xl border bg-white p-4 shadow-sm transition-colors hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 ${sourceBorderClass(card.tone)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SourceBadge tone={card.tone} label={card.sourceLabel} />
                  <h3 className="mt-3 line-clamp-2 text-sm font-bold leading-5 text-slate-950">
                    {card.title}
                  </h3>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-slate-900" />
              </div>
              <p className="mt-3 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                Rol: {card.role}
              </p>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{card.description}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function MissingAutomationRecords({
  ids,
  onRemoveAutomation,
}: {
  ids: string[];
  onRemoveAutomation: (id: string) => Promise<void>;
}) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-950">Ontbrekende automation-records</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Deze IDs staan nog in de procesreis, maar het automation-record is niet beschikbaar.
          </p>
          <div className="mt-3 space-y-2">
            {ids.map((id) => (
              <div key={id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="min-w-0 truncate text-xs font-mono text-slate-500">{id}</span>
                <button
                  type="button"
                  className="text-xs font-semibold text-red-600 hover:text-red-700"
                  onClick={() => onRemoveAutomation(id)}
                >
                  Verwijder
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DeleteFlowCard({
  showDeleteConfirm,
  setShowDeleteConfirm,
  onDelete,
  isDeleting,
}: {
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (value: boolean) => void;
  onDelete: () => Promise<void>;
  isDeleting: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {showDeleteConfirm ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-600">Procesreis verwijderen?</p>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            onClick={onDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4" />
            Ja, verwijder
          </button>
          <button
            type="button"
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            onClick={() => setShowDeleteConfirm(false)}
          >
            Annuleer
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-100 px-3 text-sm font-semibold text-red-600 hover:bg-red-50"
          onClick={() => setShowDeleteConfirm(true)}
        >
          <Trash2 className="h-4 w-4" />
          Procesreis verwijderen
        </button>
      )}
    </section>
  );
}

function EvidenceRow({ item }: { item: ProcessJourneyEvidenceItem }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${evidenceDotClass(item.tone)}`} />
        <p className="text-sm font-semibold text-slate-950">{item.title}</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${evidenceTagClass(item.tone)}`}>
          {item.tag}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
    </div>
  );
}

function HeaderBadge({ label }: { label: string }) {
  const good = /bevestig|bewezen/i.test(label);
  const warning = /gap/i.test(label);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        warning
          ? "bg-amber-50 text-amber-700"
          : good
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-700"
      }`}
    >
      {good && <CheckCircle2 className="h-3.5 w-3.5" />}
      {warning && <AlertTriangle className="h-3.5 w-3.5" />}
      {!good && !warning && <Layers className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

function SourceBadge({ tone, label }: { tone: ProcessJourneyNodePresentation["tone"]; label: string }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${sourceBadgeClass(tone)}`}>
      {label}
    </span>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5">
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}

function OpenSuggestiesCard({
  flowId,
  automationIds,
  onBevestig,
}: {
  flowId: string;
  automationIds: string[];
  onBevestig: (fromId: string, toId: string) => Promise<void>;
}) {
  const { data: suggesties = [] } = useOpenSuggestiesVoorFlow(flowId);
  const bevestig = useBevestigFlowSuggestie();
  const verwerp = useVerwerpFlowSuggestie();
  const ongedaanVerwerp = useOngedaanVerwerpFlowSuggestie();

  const nogTeBeoordelen = suggesties.filter((suggestion) => !suggestion.rejected);
  const afgewezen = suggesties.filter((suggestion) => suggestion.rejected);

  if (suggesties.length === 0) return null;

  const anyPending = bevestig.isPending || verwerp.isPending || ongedaanVerwerp.isPending;

  async function handleBevestig(suggestion: FlowSuggestie): Promise<void> {
    if (suggestion.zekerheid !== "webhook") {
      toast.error("Alleen exacte webhook-matches kunnen aan een procesreis worden toegevoegd.");
      return;
    }
    try {
      await onBevestig(suggestion.fromId, suggestion.toId);
      await bevestig.mutateAsync({ fromId: suggestion.fromId, toId: suggestion.toId });
      toast.success("Koppeling bevestigd");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bevestigen mislukt");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Suggesties beheren
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950">
            Openstaande koppelingen
          </h2>
        </div>
        <span className="w-fit rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
          {automationIds.length} huidige automations
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {nogTeBeoordelen.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">
              Nog te beoordelen ({nogTeBeoordelen.length})
            </p>
            {nogTeBeoordelen.map((suggestion) => (
              <SuggestionRow
                key={`${suggestion.fromId}-${suggestion.toId}`}
                suggestion={suggestion}
                disabled={anyPending}
                canConfirm={suggestion.zekerheid === "webhook"}
                onReject={() =>
                  verwerp.mutate(
                    { fromId: suggestion.fromId, toId: suggestion.toId },
                    { onError: (error) => toast.error(error instanceof Error ? error.message : "Verwerpen mislukt") },
                  )
                }
                onConfirm={() => handleBevestig(suggestion)}
              />
            ))}
          </div>
        )}

        {afgewezen.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">Afgewezen ({afgewezen.length})</p>
            {afgewezen.map((suggestion) => (
              <SuggestionRow
                key={`${suggestion.fromId}-${suggestion.toId}`}
                suggestion={suggestion}
                disabled={anyPending}
                rejected
                onUndoReject={() =>
                  ongedaanVerwerp.mutate(
                    { fromId: suggestion.fromId, toId: suggestion.toId },
                    { onError: (error) => toast.error(error instanceof Error ? error.message : "Ongedaan maken mislukt") },
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SuggestionRow({
  suggestion,
  disabled,
  rejected = false,
  onReject,
  onConfirm,
  onUndoReject,
  canConfirm = true,
}: {
  suggestion: FlowSuggestie;
  disabled: boolean;
  rejected?: boolean;
  onReject?: () => void;
  onConfirm?: () => void;
  onUndoReject?: () => void;
  canConfirm?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/70 p-3 ${rejected ? "opacity-65" : ""}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        {rejected ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Link2 className="h-4 w-4 shrink-0 text-slate-500" />
        )}
        <span className="font-semibold text-slate-950">{suggestion.fromNaam}</span>
        <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-semibold text-slate-950">{suggestion.toNaam}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{suggestion.redenering}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ZekerheidBadge zekerheid={suggestion.zekerheid} />
        {!rejected && (
          <>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              disabled={disabled}
              onClick={onReject}
            >
              Verwerp
            </button>
            {canConfirm && (
              <button
                type="button"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                disabled={disabled}
                onClick={onConfirm}
              >
                Bevestig
              </button>
            )}
          </>
        )}
        {rejected && (
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            disabled={disabled}
            onClick={onUndoReject}
          >
            Ongedaan maken
          </button>
        )}
      </div>
    </div>
  );
}

function ZekerheidBadge({ zekerheid }: { zekerheid: "webhook" | "ai" }) {
  return zekerheid === "webhook" ? (
    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
      webhook
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      Niet bewezen
    </span>
  );
}

function sourceBadgeClass(tone: ProcessJourneyNodePresentation["tone"]): string {
  if (tone === "hubspot") return "bg-red-50 text-red-600";
  if (tone === "zapier") return "bg-orange-50 text-orange-700";
  if (tone === "gitlab") return "bg-violet-50 text-violet-700";
  if (tone === "typeform") return "bg-slate-100 text-slate-700";
  return "bg-blue-50 text-blue-700";
}

function sourceBorderClass(tone: ProcessJourneyNodePresentation["tone"]): string {
  if (tone === "hubspot") return "border-t-4 border-t-red-300";
  if (tone === "zapier") return "border-t-4 border-t-orange-300";
  if (tone === "gitlab") return "border-t-4 border-t-violet-300";
  if (tone === "typeform") return "border-t-4 border-t-slate-300";
  return "border-t-4 border-t-blue-300";
}

function sourceCircleClass(tone: ProcessJourneyNodePresentation["tone"]): string {
  if (tone === "hubspot") return "bg-red-50 text-red-700 ring-1 ring-red-100";
  if (tone === "zapier") return "bg-orange-50 text-orange-700 ring-1 ring-orange-100";
  if (tone === "gitlab") return "bg-violet-50 text-violet-700 ring-1 ring-violet-100";
  if (tone === "typeform") return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  return "bg-blue-50 text-blue-700 ring-1 ring-blue-100";
}

function metricToneClass(tone: ProcessJourneyMetricPresentation["tone"]): string {
  if (tone === "good") return "border-emerald-200";
  if (tone === "warning") return "border-amber-200";
  return "border-slate-200";
}

function transitionToneClass(tone: ProcessJourneyTransitionPresentation["tone"]): string {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function transitionTonePillClass(tone: ProcessJourneyTransitionPresentation["tone"]): string {
  if (tone === "good") return "bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function qualityClass(quality: ProcessJourneyDetailPresentation["analysisQuality"]): string {
  if (quality === "100% webhook") return "bg-emerald-50 text-emerald-700";
  if (quality === "Keten stopt") return "bg-amber-50 text-amber-700";
  return "bg-amber-50 text-amber-700";
}

function evidenceDotClass(tone: ProcessJourneyEvidenceItem["tone"]): string {
  if (tone === "good") return "bg-emerald-500";
  if (tone === "critical") return "bg-red-500";
  if (tone === "warning") return "bg-amber-500";
  return "bg-slate-400";
}

function evidenceTagClass(tone: ProcessJourneyEvidenceItem["tone"]): string {
  if (tone === "good") return "bg-emerald-50 text-emerald-700";
  if (tone === "critical") return "bg-red-50 text-red-700";
  if (tone === "warning") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-700";
}
