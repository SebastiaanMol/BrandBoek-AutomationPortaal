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
import { getNavigationReturnHref } from "@/lib/navigationMemory";

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
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);
  const initializedRef = useRef<string | null>(null);
  const flowId = flow?.id;
  const flowNaam = flow?.naam;

  useEffect(() => {
    if (flowId && initializedRef.current !== flowId) {
      initializedRef.current = flowId;
      setNaam(flowNaam ?? "");
      setShowDeleteConfirm(false);
      setSelectedAutomationId(null);
    }
  }, [flowId, flowNaam]);

  const isDirty = flow !== undefined && naam !== flow.naam;

  if (flowsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Procesreis niet gevonden.</p>
      </div>
    );
  }

  const missingRuntimeIds = flow.automationIds.filter((autoId) => !autoMap.get(autoId));
  const journey = getProcessJourneyDetailPresentation({
    flow: { ...flow, naam },
    automations,
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
      navigate(getNavigationReturnHref("flows", "/flows"));
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

        <ProcessJourneyChainReaction nodes={journey.nodes} transitions={journey.transitions} />

        <StoryCard journey={journey} />

        <ProcessExecutionExplorer
          steps={journey.steps}
          cards={journey.automationCards}
          selectedAutomationId={selectedAutomationId}
          onSelectAutomation={(automationId) => {
            setSelectedAutomationId((current) => current === automationId ? null : automationId);
          }}
          onClearSelection={() => setSelectedAutomationId(null)}
        />

        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
          <ReactionStepList nodes={journey.nodes} transitions={journey.transitions} />
          <aside className="min-w-0 space-y-6">
            <EvidenceCard evidenceItems={journey.evidenceItems} />
            <ChangeCard changeSummary={journey.changeSummary} />
            {journey.gaps.length > 0 && <GapCard gaps={journey.gaps} />}
          </aside>
        </div>

        <AutomationCards cards={journey.automationCards} />

        <OpenSuggestiesCard
          flowId={flow.id}
          flowName={flow.naam}
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
            to={getNavigationReturnHref("flows", "/flows")}
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

function ProcessExecutionExplorer({
  steps,
  cards,
  selectedAutomationId,
  onSelectAutomation,
  onClearSelection,
}: {
  steps: ProcessJourneyStepPresentation[];
  cards: ProcessJourneyAutomationCardPresentation[];
  selectedAutomationId: string | null;
  onSelectAutomation: (automationId: string) => void;
  onClearSelection: () => void;
}) {
  const selectedCard = cards.find((card) => card.id === selectedAutomationId);

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
      <section
        aria-label="Inhoudelijke uitvoeringslijn"
        className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Uitvoering
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950">
              Inhoudelijke uitvoeringslijn
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Dit is wat er inhoudelijk gebeurt vanaf het startpunt tot waar de procesreis stopt.
            </p>
          </div>
          {selectedCard ? (
            <button
              type="button"
              onClick={onClearSelection}
              className="w-fit rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
            >
              Toon alle stappen
            </button>
          ) : (
            <span className="w-fit rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
              {steps.length} stappen
            </span>
          )}
        </div>

        {steps.length === 0 ? (
          <EmptyPanel text="Er zijn nog geen inhoudelijke processtappen beschikbaar." />
        ) : (
          <ol className="relative mt-6 space-y-4">
            <span className="absolute left-[1.12rem] top-3 hidden h-[calc(100%-1.5rem)] w-px bg-slate-200 sm:block" />
            {steps.map((step) => {
              const stepAutomationIds = step.automationIds.length > 0 ? step.automationIds : [step.automationId];
              const highlighted = selectedAutomationId !== null && stepAutomationIds.includes(selectedAutomationId);
              const dimmed = selectedAutomationId !== null && !stepAutomationIds.includes(selectedAutomationId);

              return (
                <li
                  key={step.id}
                  data-automation-id={step.automationId}
                  data-automation-ids={stepAutomationIds.join(" ")}
                  data-highlighted={highlighted ? "true" : "false"}
                  data-dimmed={dimmed ? "true" : "false"}
                  className={`relative rounded-2xl border p-4 transition-all sm:pl-14 ${executionStepClass(step.tone, highlighted, dimmed)}`}
                >
                  <div className={`absolute left-4 top-4 hidden h-7 w-7 items-center justify-center rounded-full text-xs font-bold sm:flex ${executionStepDotClass(step.kind)}`}>
                    {step.index}
                  </div>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <SourceBadge tone={step.tone} label={step.sourceLabel} />
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${stepKindBadgeClass(step.kind)}`}>
                          {step.kind === "stop" ? "einde" : step.badges[1] ?? "stap"}
                        </span>
                        <span className="text-xs font-medium text-slate-400">
                          Stap {step.index}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-bold tracking-normal text-slate-950">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
                    </div>
                    <Link
                      to={step.href}
                      className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                    >
                      Open
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <aside
        aria-label="Betrokken automations"
        className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Selectie
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950">
              Betrokken automations
            </h2>
          </div>
          {selectedAutomationId && (
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            >
              Reset
            </button>
          )}
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Klik op een automation om de bijbehorende stappen in de uitvoeringslijn te markeren.
        </p>

        <div className="mt-5 space-y-2">
          {cards.map((card) => {
            const selected = selectedAutomationId === card.id;
            return (
              <button
                key={card.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectAutomation(card.id)}
                className={`w-full rounded-2xl border p-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 ${selected ? "border-slate-900 bg-slate-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <SourceBadge tone={card.tone} label={card.sourceLabel} />
                    <p className="mt-2 line-clamp-2 text-sm font-bold leading-5 text-slate-950">
                      {card.title}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                    {card.stepCount} stap{card.stepCount === 1 ? "" : "pen"}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                  {card.description}
                </p>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function ProcessJourneyChainReaction({
  nodes,
  transitions,
}: {
  nodes: ProcessJourneyNodePresentation[];
  transitions: ProcessJourneyTransitionPresentation[];
}) {
  const columns = buildGraphColumns(nodes, transitions);

  return (
    <section className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Kettingreactie
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950">
            Kettingreactie van startpunt tot eindpunt
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Deze kaart volgt wat een bewezen startpunt technisch in gang zet. Elke pijl is een exacte webhook- of endpoint-overdracht; individuele bronanalyse blijft op de automation-detailpagina.
          </p>
        </div>
        <span className="inline-flex w-fit shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
          {transitions.length > 0 ? "Hard bewijs" : "Geen vervolgbewijs"}
        </span>
      </div>

      {nodes.length === 0 ? (
        <EmptyPanel text="Er zijn nog geen beschikbare automations in deze procesreis." />
      ) : (
        <div className="mt-5 w-full max-w-full overflow-x-auto pb-2" aria-label="Procesreis kettingreactie">
          <div className="inline-flex min-w-max items-stretch">
            {columns.map((column, index) => (
              <div key={`reaction-column-${index}`} className="flex items-stretch">
                <ReactionColumn column={column} index={index} totalColumns={columns.length} />
                {index < columns.length - 1 && (
                  <ReactionTransitionGroup transitions={transitionsBetweenColumns(columns, index, transitions)} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ReactionColumn({
  column,
  index,
  totalColumns,
}: {
  column: ChainGraphColumn;
  index: number;
  totalColumns: number;
}) {
  return (
    <div className="flex h-full w-[260px] shrink-0 flex-col">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {reactionColumnLabel(column, index, totalColumns)}
      </p>
      <div className={`flex flex-1 flex-col gap-3 ${column.nodes.length === 1 ? "justify-center" : "justify-start"}`}>
        {column.nodes.map((node) => (
          <ReactionNode key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}

function ReactionNode({ node }: { node: ProcessJourneyNodePresentation }) {
  return (
    <Link to={node.href} className="block shrink-0 transition-transform hover:-translate-y-0.5">
      <div className={`flex min-h-[140px] flex-col justify-between rounded-2xl border bg-white p-4 shadow-sm ${sourceBorderClass(node.tone)}`}>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <SourceBadge tone={node.tone} label={node.sourceLabel} />
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </div>
          <h3 className="mt-3 line-clamp-2 text-sm font-bold leading-5 text-slate-950">
            {node.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{node.roleLabel}</p>
        </div>
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{node.description}</p>
      </div>
    </Link>
  );
}

function ReactionTransitionGroup({ transitions }: { transitions: ProcessJourneyTransitionPresentation[] }) {
  if (transitions.length === 0) {
    return (
      <div className="flex w-[176px] shrink-0 flex-col justify-center px-3 text-center">
        <span className="mx-auto rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
          Bewijs stopt
        </span>
        <div className="mt-2 flex items-center justify-center">
          <span className="h-px flex-1 bg-slate-200" />
          <AlertTriangle className="mx-1 h-5 w-5 shrink-0 text-amber-600" />
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <p className="mt-2 text-[11px] leading-4 text-slate-500">Geen volgende webhook-match.</p>
      </div>
    );
  }

  if (transitions.length === 1) return <ReactionArrow transition={transitions[0]} />;

  const fromCount = new Set(transitions.map((transition) => transition.fromId)).size;
  const toCount = new Set(transitions.map((transition) => transition.toId)).size;
  const subtitle = fromCount > 1 && toCount === 1
    ? "Komen samen bij dezelfde automation"
    : fromCount === 1 && toCount > 1
      ? `Vertakt naar ${toCount} bewezen vervolgen`
      : "Parallelle webhook-overdrachten";

  return (
    <div
      role="separator"
      aria-label={`Vertakking: ${transitions.length} webhook-routes`}
      className="flex w-[190px] shrink-0 flex-col justify-center px-3 text-center"
    >
      <span className="mx-auto max-w-full rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
        {transitions.length} webhook-routes
      </span>
      <div className="mt-2 flex items-center justify-center">
        <span className="h-px flex-1 bg-slate-300" />
        <GitBranch className="mx-1 h-5 w-5 shrink-0 text-slate-900" />
        <span className="h-px flex-1 bg-slate-300" />
      </div>
      <p className="mt-2 text-[11px] leading-4 text-slate-500">{subtitle}</p>
    </div>
  );
}

function ReactionArrow({ transition }: { transition: ProcessJourneyTransitionPresentation }) {
  const route = extractRouteFromTransition(transition);
  return (
    <div
      role="separator"
      aria-label={`${transition.label}: ${transition.description}`}
      className="flex w-[176px] shrink-0 flex-col justify-center px-3 text-center"
    >
      <span className={`mx-auto max-w-full rounded-full px-2.5 py-1 text-[11px] font-bold ${transitionTonePillClass(transition.tone)}`}>
        {transition.label}
      </span>
      <div className="mt-2 flex items-center justify-center">
        <span className="h-px flex-1 bg-slate-300" />
        <ArrowRight className="mx-1 h-5 w-5 shrink-0 text-slate-900" />
        <span className="h-px flex-1 bg-slate-300" />
      </div>
      <p className="mt-2 text-[11px] leading-4 text-slate-500">100% bewezen</p>
      {route && (
        <code className="mt-1 block truncate rounded bg-slate-50 px-1.5 py-1 text-[10px] text-slate-500">
          {route}
        </code>
      )}
    </div>
  );
}

function ReactionStepList({
  nodes,
  transitions,
}: {
  nodes: ProcessJourneyNodePresentation[];
  transitions: ProcessJourneyTransitionPresentation[];
}) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      aria-label="Kettingreactie stap voor stap"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Overdrachten
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-normal text-slate-950">Wat triggert wat?</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            De stappen hieronder beschrijven alleen de bewezen kettingreactie tussen automations.
          </p>
        </div>
        <span className="w-fit rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
          {transitions.length} overdracht{transitions.length === 1 ? "" : "en"}
        </span>
      </div>

      {transitions.length === 0 ? (
        <EmptyPanel text="Er is nog geen bewezen overdracht tussen automations." />
      ) : (
        <div className="mt-5 space-y-3">
          {transitions.map((transition, index) => {
            const from = nodeMap.get(transition.fromId);
            const to = nodeMap.get(transition.toId);
            const route = extractRouteFromTransition(transition);
            return (
              <div key={`${transition.id}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Route-laag {index + 1}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-950">
                      <span>{from?.title ?? transition.fromId}</span>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                      <span>{to?.title ?? transition.toId}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{transition.description}</p>
                  </div>
                  <span className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${transitionTonePillClass(transition.tone)}`}>
                    {transition.evidenceLabel}
                  </span>
                </div>
                {route && (
                  <code className="mt-3 block w-fit max-w-full truncate rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-600 shadow-sm ring-1 ring-slate-200">
                    {route}
                  </code>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function reactionColumnLabel(column: ChainGraphColumn, index: number, totalColumns: number): string {
  if (index === 0) return column.nodes.length > 1 ? "Startpunten" : "Startpunt";
  if (index === totalColumns - 1) return column.nodes.length > 1 ? "Meerdere eindpunten" : "Eindpunt";
  return column.nodes.length > 1 ? "Parallelle tussenstappen" : "Tussenstap";
}

function extractRouteFromTransition(transition: ProcessJourneyTransitionPresentation): string {
  return transition.description.match(/\/[a-z0-9][a-z0-9/_{}.-]+/i)?.[0] ?? "";
}

interface ChainGraphColumn {
  nodes: ProcessJourneyNodePresentation[];
}

function buildGraphColumns(
  nodes: ProcessJourneyNodePresentation[],
  transitions: ProcessJourneyTransitionPresentation[],
): ChainGraphColumn[] {
  if (nodes.length === 0) return [];
  if (transitions.length === 0) return [{ nodes }];

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, ProcessJourneyTransitionPresentation[]>();

  for (const node of nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  }

  for (const transition of transitions) {
    if (!nodeById.has(transition.fromId) || !nodeById.has(transition.toId)) continue;
    incoming.set(transition.toId, (incoming.get(transition.toId) ?? 0) + 1);
    outgoing.get(transition.fromId)?.push(transition);
  }

  const roots = nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
  const startNodes = roots.length > 0 ? roots : nodes.slice(0, 1);
  const levelById = new Map<string, number>();
  const queue: ProcessJourneyNodePresentation[] = [];

  for (const node of startNodes) {
    levelById.set(node.id, 0);
    queue.push(node);
  }

  while (queue.length > 0) {
    const node = queue.shift()!;
    const level = levelById.get(node.id) ?? 0;
    for (const transition of outgoing.get(node.id) ?? []) {
      if (levelById.has(transition.toId)) continue;
      const target = nodeById.get(transition.toId);
      if (!target) continue;
      levelById.set(transition.toId, level + 1);
      queue.push(target);
    }
  }

  const maxLevel = Math.max(0, ...levelById.values());
  for (const node of nodes) {
    if (!levelById.has(node.id)) levelById.set(node.id, maxLevel + 1);
  }

  const columns = new Map<number, ProcessJourneyNodePresentation[]>();
  for (const node of nodes) {
    const level = levelById.get(node.id) ?? 0;
    const columnNodes = columns.get(level) ?? [];
    columnNodes.push(node);
    columns.set(level, columnNodes);
  }

  return [...columns.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, columnNodes]) => ({
      nodes: columnNodes.sort((left, right) => (nodeOrder.get(left.id) ?? 0) - (nodeOrder.get(right.id) ?? 0)),
    }));
}

function transitionsBetweenColumns(
  columns: ChainGraphColumn[],
  index: number,
  transitions: ProcessJourneyTransitionPresentation[],
): ProcessJourneyTransitionPresentation[] {
  const fromIds = new Set(columns[index]?.nodes.map((node) => node.id) ?? []);
  const laterIds = new Set(columns.slice(index + 1).flatMap((column) => column.nodes.map((node) => node.id)));

  return transitions.filter((transition) => fromIds.has(transition.fromId) && laterIds.has(transition.toId));
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
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
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
        <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.id}
              to={card.href}
              className={`group min-w-0 overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition-colors hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 ${sourceBorderClass(card.tone)}`}
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
              {card.insights.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {card.insights.slice(0, 4).map((insight) => (
                    <span
                      key={insight}
                      className="min-w-0 max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                    >
                      {insight}
                    </span>
                  ))}
                </div>
              )}
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
  flowName,
  automationIds,
  onBevestig,
}: {
  flowId: string;
  flowName: string;
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

function executionStepClass(
  tone: ProcessJourneyNodePresentation["tone"],
  highlighted: boolean,
  dimmed: boolean,
): string {
  const sourceClass = tone === "hubspot"
    ? "border-red-100 bg-red-50/30"
    : tone === "zapier"
      ? "border-orange-100 bg-orange-50/30"
      : tone === "gitlab"
        ? "border-violet-100 bg-violet-50/30"
        : tone === "typeform"
          ? "border-slate-200 bg-slate-50/70"
          : "border-blue-100 bg-blue-50/30";

  if (highlighted) return `${sourceClass} shadow-md ring-2 ring-slate-900/10`;
  if (dimmed) return "border-slate-200 bg-white opacity-45";
  return `${sourceClass} shadow-sm`;
}

function executionStepDotClass(kind: ProcessJourneyStepPresentation["kind"]): string {
  if (kind === "start") return "bg-pink-100 text-pink-700";
  if (kind === "read") return "bg-purple-100 text-purple-700";
  if (kind === "determine") return "bg-blue-100 text-blue-700";
  if (kind === "write") return "bg-teal-100 text-teal-700";
  if (kind === "handoff") return "bg-emerald-100 text-emerald-700";
  return "bg-amber-100 text-amber-700";
}

function stepKindBadgeClass(kind: ProcessJourneyStepPresentation["kind"]): string {
  if (kind === "start") return "bg-pink-50 text-pink-700";
  if (kind === "read") return "bg-purple-50 text-purple-700";
  if (kind === "determine") return "bg-blue-50 text-blue-700";
  if (kind === "write") return "bg-teal-50 text-teal-700";
  if (kind === "handoff") return "bg-emerald-50 text-emerald-700";
  return "bg-amber-50 text-amber-700";
}

function metricToneClass(tone: ProcessJourneyMetricPresentation["tone"]): string {
  if (tone === "good") return "border-emerald-200";
  if (tone === "warning") return "border-amber-200";
  return "border-slate-200";
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
