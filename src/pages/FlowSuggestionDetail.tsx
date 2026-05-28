import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  CheckCircle2,
  Database,
  GitBranch,
  GitFork,
  Loader2,
  Radio,
  Route,
  Send,
  Workflow,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FlowConfirmDialog } from "@/components/FlowConfirmDialog";
import { FlowSuggestionAiWorkbench } from "@/components/flows/FlowSuggestionAiWorkbench";
import { FlowSuggestionReviewCockpit } from "@/components/flows/FlowSuggestionReviewCockpit";
import { ProcessJourneyNarrative } from "@/components/flows/ProcessJourneyNarrative";
import { StepLogicDetails } from "@/components/flows/StepLogicDetails";
import { useAutomatiseringenIncludingLegacyGitlab } from "@/lib/queryHooks/automations";
import { usePipelines } from "@/lib/queryHooks/pipelines";
import {
  useAccepteerFlowKandidaat,
  useFlowSuggesties,
  useVerwerpFlowSuggestie,
} from "@/lib/queryHooks/automationLinks";
import { useCreateFlow } from "@/lib/queryHooks/flows";
import { groupFlowSuggesties } from "@/lib/flowSuggestionGroups";
import { nameFlow } from "@/lib/storage/flows";
import type { Automatisering, Pipeline, Systeem } from "@/lib/types";
import type { FlowSuggestionGroup } from "@/lib/flowSuggestionGroups";
import { parseSuggestionEdgeDetailId } from "@/lib/flowSuggestionDetailIds";
import {
  buildFlowRuntimeChain,
  getFlowRuntimeTransitionLabel,
  type FlowRuntimeStepType,
  type FlowRuntimeWorker,
} from "@/lib/flowRuntimeChain";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import {
  buildProcessJourneyTitleFromAutomations,
  cleanProcessJourneyTitle,
  resolveAutomationIdsForConceptJourney,
  summarizeAutomationForProcessJourney,
} from "@/lib/processJourneyCopy";
import {
  buildAcceptedFlowDescriptionFromAiResult,
  type FlowSuggestionAiResult,
} from "@/lib/flowSuggestionAi";
import { buildFlowSuggestionAiPrompt } from "@/lib/flowSuggestionPromptBuilder";
import { getFlowSuggestionReviewPresentation } from "@/lib/flowSuggestionReviewPresentation";

interface AcceptState {
  group: FlowSuggestionGroup;
  automationIds: string[];
  aiName: string;
  aiBeschrijving: string;
  aiError: boolean;
  loading: boolean;
  saving: boolean;
}

const ICONS: Record<FlowRuntimeStepType, ComponentType<{ className?: string }>> = {
  signal: Radio,
  zapier_step: Route,
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

const STEP_STYLE: Record<FlowRuntimeStepType, string> = {
  signal: "border-blue-300 bg-blue-50 text-blue-900 ring-1 ring-blue-100",
  zapier_step: "border-orange-200 bg-orange-50 text-orange-950 ring-1 ring-orange-100",
  hubspot_workflow: "border-blue-300 bg-blue-50 text-blue-900 ring-1 ring-blue-100",
  hubspot_branching: "border-blue-300 bg-blue-50/70 text-blue-900 ring-1 ring-blue-100",
  gitlab_backend_block: "border-purple-300 bg-purple-50 text-purple-900 ring-1 ring-purple-100",
  gitlab_worker: "border-purple-300 bg-purple-50 text-purple-900 ring-1 ring-purple-100",
  automation: "border-slate-200 bg-slate-50 text-slate-900",
  return_to_hubspot: "border-blue-200 bg-white text-blue-900",
  state_write: "border-blue-100 bg-white text-blue-900",
  emitted_signal: "border-dashed border-blue-300 bg-blue-50/50 text-blue-900 opacity-80",
  downstream: "border-dashed border-indigo-200 bg-indigo-50/50 text-indigo-950 ring-1 ring-indigo-100",
};

function resolveGroupId(param: string | undefined): string {
  if (!param) return "";
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

function getSuggestionGroupTitle(group: FlowSuggestionGroup, automations: Automatisering[] = []): string {
  const first = automations[0]?.naam ?? group.nodes[0]?.naam ?? "Procesreis kandidaat";
  const last = automations.at(-1)?.naam ?? group.nodes[group.nodes.length - 1]?.naam ?? "onbekend einde";
  return `${cleanProcessJourneyTitle(first)} naar ${cleanProcessJourneyTitle(last)}`;
}

function buildChainGroupFromId(groupId: string, suggesties: FlowSuggestie[]): FlowSuggestionGroup | undefined {
  const ids = groupId.split("__").filter(Boolean);
  if (ids.length < 2) return undefined;

  const chainSuggestions: FlowSuggestie[] = [];
  for (let index = 0; index < ids.length - 1; index += 1) {
    const suggestion = suggesties.find(
      (candidate) => candidate.fromId === ids[index] && candidate.toId === ids[index + 1],
    );
    if (!suggestion) return undefined;
    chainSuggestions.push(suggestion);
  }

  return groupFlowSuggesties(chainSuggestions)[0];
}

export default function FlowSuggestionDetail(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: suggesties = [], isLoading } = useFlowSuggesties();
  const { data: automations = [] } = useAutomatiseringenIncludingLegacyGitlab();
  const { data: pipelines = [] } = usePipelines();
  const createFlow = useCreateFlow();
  const accepteerKandidaat = useAccepteerFlowKandidaat();
  const verwerp = useVerwerpFlowSuggestie();
  const [acceptState, setAcceptState] = useState<AcceptState | null>(null);
  const [manualAiResult, setManualAiResult] = useState<FlowSuggestionAiResult | null>(null);

  const webhookSuggesties = useMemo(
    () => suggesties.filter((suggestion) => suggestion.zekerheid === "webhook"),
    [suggesties],
  );
  const groups = useMemo(() => groupFlowSuggesties(webhookSuggesties), [webhookSuggesties]);
  const groupId = resolveGroupId(id);
  const edgeSelection = useMemo(() => parseSuggestionEdgeDetailId(groupId), [groupId]);
  const edgeGroup = useMemo(() => {
    if (!edgeSelection) return undefined;
    const suggestion = webhookSuggesties.find(
      (candidate) =>
        candidate.fromId === edgeSelection.fromId &&
        candidate.toId === edgeSelection.toId,
    );
    return suggestion ? groupFlowSuggesties([suggestion])[0] : undefined;
  }, [edgeSelection, webhookSuggesties]);
  const chainGroup = useMemo(
    () => buildChainGroupFromId(groupId, webhookSuggesties),
    [groupId, webhookSuggesties],
  );
  const group = edgeGroup ?? groups.find((candidate) => candidate.id === groupId) ?? chainGroup;

  const autoMap = useMemo(
    () => new Map(automations.map((automation) => [automation.id, automation])),
    [automations],
  );
  const endpointEvidence = useMemo(
    () => extractEndpointFromSuggestionReason(group?.suggestions.find((suggestion) => suggestion.zekerheid === "webhook")?.redenering ?? ""),
    [group],
  );
  const orderedAutomationIds = useMemo(
    () => resolveAutomationIdsForConceptJourney(group?.nodes.map((node) => node.id) ?? [], autoMap, endpointEvidence),
    [autoMap, endpointEvidence, group],
  );
  const involvedAutomations = useMemo(
    () =>
      orderedAutomationIds
        .map((automationId) => autoMap.get(automationId))
        .filter((automation): automation is Automatisering => automation !== undefined),
    [orderedAutomationIds, autoMap],
  );
  const reviewPresentation = useMemo(
    () =>
      group
        ? getFlowSuggestionReviewPresentation({
            group,
            automations: involvedAutomations,
            endpointEvidence,
            aiResult: manualAiResult,
          })
        : null,
    [endpointEvidence, group, involvedAutomations, manualAiResult],
  );
  const aiPrompt = useMemo(
    () =>
      group
        ? buildFlowSuggestionAiPrompt({
            group,
            automations: involvedAutomations,
            endpointEvidence,
          })
        : "",
    [endpointEvidence, group, involvedAutomations],
  );
  const actionPending = verwerp.isPending;

  async function handleVerwerpProcesreis(): Promise<void> {
    if (!group) return;
    try {
      await Promise.all(
        group.suggestions.map((suggestion) =>
          verwerp.mutateAsync({ fromId: suggestion.fromId, toId: suggestion.toId }),
        ),
      );
      toast.success("Procesreis verworpen");
      navigate("/flows");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwerpen mislukt");
    }
  }

  async function handleAccepteer(groupToAccept: FlowSuggestionGroup): Promise<void> {
    const acceptEndpoint = extractEndpointFromSuggestionReason(
      groupToAccept.suggestions.find((suggestion) => suggestion.zekerheid === "webhook")?.redenering ?? "",
    );
    const orderedIds = resolveAutomationIdsForConceptJourney(
      groupToAccept.nodes.map((node) => node.id),
      autoMap,
      acceptEndpoint,
    );
    const autos = orderedIds
      .map((automationId) => autoMap.get(automationId))
      .filter((automation): automation is Automatisering => automation !== undefined);

    setAcceptState({
      group: groupToAccept,
      automationIds: orderedIds,
      aiName: "",
      aiBeschrijving: "",
      aiError: false,
      loading: true,
      saving: false,
    });

    if (manualAiResult) {
      const fallback = buildFallbackProcessJourneyCopy(groupToAccept, autos);
      setAcceptState((prev) =>
        prev
          ? {
              ...prev,
              aiName: manualAiResult.title || fallback.naam,
              aiBeschrijving: buildAcceptedFlowDescriptionFromAiResult(manualAiResult) || fallback.beschrijving,
              aiError: false,
              loading: false,
            }
          : null,
      );
      return;
    }

    try {
      const result = await nameFlow(autos);
      setAcceptState((prev) =>
        prev ? { ...prev, aiName: result.naam, aiBeschrijving: result.beschrijving, loading: false } : null,
      );
    } catch {
      const fallback = buildFallbackProcessJourneyCopy(groupToAccept, autos);
      setAcceptState((prev) =>
        prev
          ? {
              ...prev,
              aiName: fallback.naam,
              aiBeschrijving: fallback.beschrijving,
              aiError: false,
              loading: false,
            }
          : null,
      );
    }
  }

  async function handleRetryAi(): Promise<void> {
    if (!acceptState) return;
    setAcceptState((prev) => (prev ? { ...prev, aiError: false, loading: true } : null));
    try {
      const autos = acceptState.automationIds
        .map((automationId) => autoMap.get(automationId))
        .filter((automation): automation is Automatisering => automation !== undefined);
      const result = await nameFlow(autos);
      setAcceptState((prev) =>
        prev ? { ...prev, aiName: result.naam, aiBeschrijving: result.beschrijving, loading: false } : null,
      );
    } catch {
      const autos = acceptState.automationIds
        .map((automationId) => autoMap.get(automationId))
        .filter((automation): automation is Automatisering => automation !== undefined);
      const fallback = buildFallbackProcessJourneyCopy(acceptState.group, autos);
      setAcceptState((prev) =>
        prev
          ? {
              ...prev,
              aiName: fallback.naam,
              aiBeschrijving: fallback.beschrijving,
              aiError: false,
              loading: false,
            }
          : null,
      );
    }
  }

  async function handleSaveFlow(naam: string, beschrijving: string): Promise<void> {
    if (!acceptState) return;
    setAcceptState((prev) => (prev ? { ...prev, saving: true } : null));
    try {
      const autos = acceptState.automationIds
        .map((automationId) => autoMap.get(automationId))
        .filter((automation): automation is Automatisering => automation !== undefined);
      const systemen = [...new Set(autos.flatMap((automation) => automation.systemen))] as Systeem[];
      const newFlow = await createFlow.mutateAsync({
        naam,
        beschrijving,
        automationIds: acceptState.automationIds,
        systemen,
      });
      await accepteerKandidaat.mutateAsync({
        nodeIds: acceptState.group.nodes.map((node) => node.id),
        flowId: newFlow.id,
      });
      toast.success(`Procesreis "${naam}" aangemaakt`);
      setAcceptState(null);
      navigate(`/flows/${newFlow.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
      setAcceptState((prev) => (prev ? { ...prev, saving: false } : null));
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!group) {
    return <Navigate to="/flows" replace />;
  }

  if (!reviewPresentation) {
    return <Navigate to="/flows" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1600px] items-center px-6 py-4 lg:px-10">
            <Link
              to="/flows"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Terug naar procesreizen
            </Link>
        </div>
      </header>

      <main className="mx-auto min-h-0 min-w-0 w-full max-w-[1600px] flex-1 space-y-6 overflow-x-hidden px-5 py-6 sm:px-6 lg:px-10">
        <FlowSuggestionReviewCockpit
          presentation={reviewPresentation}
          onAccept={() => handleAccepteer(group)}
          onReject={handleVerwerpProcesreis}
          rejectPending={actionPending}
        />
        <FlowSuggestionAiWorkbench
          prompt={aiPrompt}
          aiResult={manualAiResult}
          onApply={setManualAiResult}
        />
      </main>

      {acceptState && !acceptState.loading && (
        <FlowConfirmDialog
          automations={acceptState.automationIds
            .map((automationId) => autoMap.get(automationId))
            .filter((automation): automation is Automatisering => automation !== undefined)}
          initialName={acceptState.aiName}
          initialBeschrijving={acceptState.aiBeschrijving}
          aiError={acceptState.aiError}
          onRetryAi={handleRetryAi}
          onSave={handleSaveFlow}
          onCancel={() => setAcceptState(null)}
          saving={acceptState.saving}
        />
      )}
    </div>
  );
}

function RuntimeJourney({ steps }: { steps: ReturnType<typeof buildFlowRuntimeChain> }) {
  if (steps.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Deze procesreis heeft nog onvoldoende data om processtappen te tonen.
      </div>
    );
  }

  const startSignal = steps.find((step) => step.type === "signal") ?? null;
  const followUpSteps = steps.filter((step) => step.type === "emitted_signal" || step.type === "downstream");
  const journeySteps = steps.filter(
    (step) => step.type !== "signal" && step.type !== "emitted_signal" && step.type !== "downstream",
  );

  return (
    <div className="min-w-0 space-y-4">
      {startSignal && (
        <section
          aria-label="Startsignaal"
          className="min-w-0 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900 shadow-sm"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
            Startsignaal
          </p>
          <p className="mt-1 break-words text-sm font-semibold">{startSignal.title}</p>
          <p className="mt-1 break-words text-xs leading-relaxed text-blue-800/80">
            {startSignal.description}
          </p>
          {startSignal.evidence && <StepLogicDetails logic={startSignal.evidence} className="text-blue-900" />}
        </section>
      )}

      <section
        aria-label="Stap voor stap overzicht"
        className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Procesreis
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            Stap voor stap overzicht
          </h2>
        </div>

        <ol className="min-w-0 space-y-3">
        {journeySteps.map((step, index) => {
          const Icon = ICONS[step.type];
          const isDownstream = step.type === "downstream";
          const displayLabel = isDownstream ? "Downstream controle" : step.label;
          const displayTitle = isDownstream ? "Wat kan hierna reageren?" : step.title;
          const transitionLabel = getFlowRuntimeTransitionLabel(step);
          return (
            <li key={step.id} className="min-w-0">
              {index > 0 && (
                <div
                  role="separator"
                  aria-label={`Overgang: ${transitionLabel}`}
                  title={step.transitionFromPrevious?.description ?? "Deze stap volgt op de vorige stap in de procesreis."}
                  className="my-2 ml-[3.25rem] flex min-w-0 items-center justify-center gap-2 py-1 text-[11px] font-semibold text-muted-foreground"
                >
                  <span className="h-px min-w-4 flex-1 bg-border" aria-hidden />
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 shadow-sm">
                    <ArrowDown className="h-3 w-3 text-primary" aria-hidden />
                    <span>{transitionLabel}</span>
                  </span>
                  <span className="h-px min-w-4 flex-1 bg-border" aria-hidden />
                </div>
              )}
              <div className="grid min-w-0 gap-3 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
                <div className="flex sm:flex-col sm:items-center">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-full border bg-background shadow-sm ${runtimeIconClass(step.type)}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  {index < journeySteps.length - 1 && (
                    <span className="ml-3 h-px flex-1 bg-border sm:ml-0 sm:mt-2 sm:h-6 sm:w-px" />
                  )}
                </div>
                <div className={`min-w-0 rounded-xl border px-4 py-3 ${STEP_STYLE[step.type]} ${isDownstream ? "shadow-none" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${runtimeSystemBadgeClass(step.type)}`}>
                    {runtimeSystemLabel(step)}
                  </span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    {index + 1}. {displayLabel}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm font-semibold leading-snug text-current">{displayTitle}</p>
                <p className="mt-1 break-words text-xs leading-relaxed text-current/75">{step.description}</p>
                {step.evidence && <StepLogicDetails logic={step.evidence} />}
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
                  <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-3">
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
                {isDownstream && (
                  <div className="mt-3 rounded-md border border-indigo-200 bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-indigo-900">
                    <p className="font-semibold">Nog geen vervolgproces gekoppeld.</p>
                    <p className="mt-0.5 text-indigo-900/70">
                      Deze downstream-stap blijft zichtbaar als controlepunt totdat property/waarde naar trigger-match bewezen is.
                    </p>
                  </div>
                )}
                {step.workers && step.workers.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-purple-800/75">
                      GitLab automations in dit backendblok
                    </p>
                    {step.workers.map((worker, workerIndex) => (
                      <div key={worker.id} className="min-w-0 rounded-lg border border-purple-200 bg-white/75 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-800">
                            GitLab automation {workerIndex + 1}
                          </span>
                        </div>
                        <p className="mt-1 break-words text-sm font-semibold leading-snug text-purple-950">
                          {worker.title}
                        </p>
                        <p className="mt-1 break-words text-xs leading-relaxed text-purple-900/75">
                          {worker.description}
                        </p>
                        <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">
                          {worker.miniSteps.slice(0, 6).map((miniStep) => (
                            <div key={`${worker.id}-${miniStep.title}`} className="min-w-0 rounded-md border border-purple-100 bg-purple-50/60 px-2.5 py-2">
                              <p className="break-words text-[10px] font-bold uppercase tracking-wider text-purple-800">
                                {miniStep.title}
                              </p>
                              <p className="mt-1 break-words text-[11px] leading-relaxed text-purple-900/75">
                                {miniStep.summary}
                              </p>
                            </div>
                          ))}
                        </div>
                        <ConceptWorkerBackendTrace worker={worker} />
                      </div>
                    ))}
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
          className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 px-4 py-3 text-blue-900"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
            Vervolgcontrole
          </p>
          <div className="mt-2 space-y-2">
            {followUpSteps.map((step) => (
              <div key={step.id} className="rounded-lg border border-blue-200/70 bg-white/70 px-3 py-2.5">
                <p className="text-xs font-semibold">
                  {step.type === "downstream" ? "Vervolgcontrole" : step.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-blue-950">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-blue-900/75">{step.description}</p>
                {step.evidence && <StepLogicDetails logic={step.evidence} />}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function runtimeSystemLabel(step: { type: FlowRuntimeStepType; title: string; description: string; evidence?: string }): string {
  const type = step.type;
  const text = `${step.title} ${step.description} ${step.evidence ?? ""}`.toLowerCase();
  if (type === "zapier_step") return "Zapier";
  if ((type === "signal" || type === "automation") && text.includes("zapier")) return "Zapier";
  if (type === "gitlab_backend_block" || type === "gitlab_worker") return "GitLab";
  if (type === "automation") return "Automation";
  if (type === "return_to_hubspot") return "Overdracht";
  if (type === "state_write") {
    if (text.includes("wefact")) return "WeFact";
    if (text.includes("hubspot")) return "HubSpot";
    return "Uitkomst";
  }
  if (type === "downstream") return "Downstream";
  return "HubSpot";
}

function runtimeSystemBadgeClass(type: FlowRuntimeStepType): string {
  if (type === "gitlab_backend_block" || type === "gitlab_worker") {
    return "bg-purple-100 text-purple-800";
  }
  if (type === "zapier_step") return "bg-orange-100 text-orange-800";
  if (type === "automation") return "bg-slate-100 text-slate-700";
  if (type === "return_to_hubspot") return "bg-blue-100 text-blue-800";
  if (type === "downstream") return "bg-indigo-100 text-indigo-800";
  return "bg-blue-100 text-blue-800";
}

function runtimeIconClass(type: FlowRuntimeStepType): string {
  if (type === "gitlab_backend_block" || type === "gitlab_worker") {
    return "border-purple-300 text-purple-700 ring-4 ring-purple-100";
  }
  if (type === "zapier_step") return "border-orange-300 text-orange-700 ring-4 ring-orange-100";
  if (type === "automation") return "border-slate-300 text-slate-600";
  if (type === "downstream") return "border-indigo-300 text-indigo-700 ring-4 ring-indigo-100";
  return "border-blue-300 text-blue-700 ring-4 ring-blue-100";
}

function hubSpotActionStyle(tone: "update" | "route" | "workflow"): string {
  if (tone === "update") return "border-emerald-200 bg-emerald-50/70 text-emerald-900";
  if (tone === "route") return "border-amber-200 bg-amber-50/70 text-amber-900";
  return "border-blue-200 bg-white/70 text-blue-950";
}

function ConceptWorkerBackendTrace({ worker }: { worker: FlowRuntimeWorker }): React.ReactNode {
  const [open, setOpen] = useState(false);
  if (!worker.backendTrace) return null;

  return (
    <div className="mt-4 min-w-0 rounded-lg border border-purple-100 bg-white/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-purple-800">
            Technische trace
          </p>
          <p className="mt-0.5 break-words text-[11px] leading-relaxed text-purple-900/70">
            Exacte codepadinformatie achter deze backendstap.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-[44px] items-center rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-[11px] font-semibold text-purple-900 transition-colors hover:bg-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-2"
        >
          {open ? "Verberg technische trace" : "Toon technische trace"}
        </button>
      </div>
      {open && (
        <div className="mt-4 min-w-0 space-y-3 border-t border-purple-100 pt-3">
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
        </div>
      )}
    </div>
  );
}

function EvidenceList({ group }: { group: FlowSuggestionGroup }) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {group.suggestions.map((suggestion) => (
        <div
          key={`${suggestion.fromId}-${suggestion.toId}`}
          className="rounded-xl border border-border bg-muted/20 p-4"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <p className="text-sm font-semibold text-foreground">
              {suggestion.zekerheid === "webhook" ? "100% webhook-match" : "Niet bewezen"}
            </p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {suggestion.zekerheid === "webhook"
              ? buildWebhookEvidenceText(suggestion)
              : "Deze relatie telt niet als procesreis-bewijs zonder exacte webhook-match."}
          </p>
        </div>
      ))}
    </div>
  );
}

function buildWebhookEvidenceText(suggestion: FlowSuggestionGroup["suggestions"][number]): string {
  const from = sourceLabel(suggestion.fromSource);
  const to = sourceLabel(suggestion.toSource);
  const reason = suggestion.redenering.replace(/\.$/, "");
  return reason
    ? `Exacte webhook/endpoint match tussen ${from} en ${to}: ${reason}.`
    : `Exacte webhook/endpoint match tussen ${from} en ${to}.`;
}

function extractEndpointFromSuggestionReason(reason: string): string {
  const trimmed = reason.trim();
  const match = trimmed.match(/(?:GET|POST|PUT|PATCH|DELETE)?\s*(\/[^\s.]+)(?=[\s.]|$)/i);
  return match?.[1]?.replace(/[.,;:]$/, "") ?? trimmed;
}

function sourceLabel(source: string | null): string {
  if (source === "zapier") return "Zapier";
  if (source === "hubspot") return "HubSpot";
  if (source === "gitlab") return "GitLab";
  return "automation";
}

function ImpactSummary({ automations }: { automations: Automatisering[] }) {
  const domains = inferDomains(automations);
  const hasGitLab = automations.some((automation) => automation.source === "gitlab" || automation.gitlabFilePath);

  return (
    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <p className="text-sm font-semibold">
          {hasGitLab ? "HubSpot-status kan veranderen" : "Procesroute in HubSpot"}
        </p>
      </div>
      <ul className="mt-3 space-y-2 text-sm text-red-900">
        <li>Kan vervolgprocessen activeren</li>
        <li>{domains.length ? `Raakt mogelijk: ${domains.join(" / ")}` : "Domein nog niet volledig herkend"}</li>
        <li>{hasGitLab ? "Bevat backend worker" : "Geen backend worker herkend"}</li>
      </ul>
    </div>
  );
}

function AutomationSummary({ automation, pipelines }: { automation: Automatisering; pipelines: Pipeline[] }) {
  const isGitLab = automation.source === "gitlab" || Boolean(automation.gitlabFilePath);
  return (
    <div className="min-w-0 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-foreground">
          {cleanProcessJourneyTitle(automation.naam)}
        </p>
        <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {isGitLab ? "GitLab worker" : automation.source === "hubspot" ? "HubSpot workflow" : automation.source ?? "Automation"}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
        {summarizeAutomationForProcessJourney(automation, { pipelines })}
      </p>
    </div>
  );
}

function buildFallbackProcessJourneyCopy(
  group: FlowSuggestionGroup,
  automations: Automatisering[] = [],
): { naam: string; beschrijving: string } {
  const first = group.nodes[0]?.naam ?? "Startsignaal";
  const last = group.nodes[group.nodes.length - 1]?.naam ?? "vervolgstap";
  const name = automations.length > 0
    ? buildProcessJourneyTitleFromAutomations(automations, buildPlainLanguageFallbackName(first, last))
    : buildPlainLanguageFallbackName(first, last);
  const description = buildPlainLanguageFallbackDescription(first, last);

  return {
    naam: name,
    beschrijving: description,
  };
}

function buildPlainLanguageFallbackName(first: string, last: string): string {
  const text = `${first} ${last}`.toLowerCase();

  if (text.includes("btw") && text.includes("2 maanden")) return "BTW vervolgkwartaal bijwerken";
  if (text.includes("jr") && text.includes("prio")) return "Jaarrekening prioriteit bijwerken";
  if (text.includes("machtiging")) return "Machtiging verwerken";
  if (text.includes("bankkoppeling")) return "Bankkoppeling status bijwerken";
  if (text.includes("typeform")) return "Formuliergegevens verwerken";
  if (text.includes("stage") || text.includes("fase")) return "Procesfase bepalen";
  if (text.includes("lead")) return "Lead verwerken";
  if (text.includes("contact")) return "Contactgegevens bijwerken";
  if (text.includes("dossier")) return "Dossier bijwerken";

  return "Procesreis bijwerken";
}

function buildPlainLanguageFallbackDescription(first: string, last: string): string {
  const text = `${first} ${last}`.toLowerCase();

  if (text.includes("btw") && text.includes("2 maanden")) {
    return "Zodra de BTW van de afgelopen twee maanden als geboekt wordt gemarkeerd, werkt het systeem automatisch het volgende kwartaal bij. De procesreis eindigt bij de bewezen HubSpot-update; eventuele vervolgprocessen worden apart gekoppeld zodra die relatie hard bewezen is.";
  }

  if (text.includes("jr") && text.includes("prio")) {
    return "Zodra duidelijk is dat een jaarrekening extra prioriteit nodig heeft, werkt het systeem automatisch de prioriteit bij. De procesreis eindigt bij de bewezen HubSpot-update; eventuele vervolgprocessen worden apart gekoppeld zodra die relatie hard bewezen is.";
  }

  if (text.includes("machtiging")) {
    return "Zodra de machtiging van een klant verandert, werkt het systeem automatisch de bijbehorende dossiers bij. De procesreis eindigt bij de bewezen HubSpot-update; eventuele vervolgprocessen worden apart gekoppeld zodra die relatie hard bewezen is.";
  }

  if (text.includes("bankkoppeling")) {
    return "Zodra de bankkoppeling verandert, werkt het systeem automatisch de relevante klant- en dossierstatussen bij. De procesreis eindigt bij de bewezen HubSpot-update; eventuele vervolgprocessen worden apart gekoppeld zodra die relatie hard bewezen is.";
  }

  if (text.includes("typeform")) {
    return "Zodra nieuwe formulierinformatie binnenkomt, verwerkt het systeem deze gegevens automatisch in HubSpot. De procesreis eindigt bij de bewezen HubSpot-update; eventuele vervolgprocessen worden apart gekoppeld zodra die relatie hard bewezen is.";
  }

  if (text.includes("stage") || text.includes("fase")) {
    return "Zodra de benodigde klant- of dossiergegevens veranderen, bepaalt het systeem automatisch welke procesfase passend is. De procesreis eindigt bij de bewezen HubSpot-update; eventuele vervolgprocessen worden apart gekoppeld zodra die relatie hard bewezen is.";
  }

  return `Zodra "${first}" gebeurt, voert het systeem automatisch de vervolgstap "${last}" uit. De procesreis eindigt bij de bewezen HubSpot-update; eventuele vervolgprocessen worden apart gekoppeld zodra die relatie hard bewezen is.`;
}

function inferDomains(automations: Automatisering[]): string[] {
  const text = automations
    .map((automation) => `${automation.naam} ${automation.doel} ${automation.trigger} ${automation.fasen.join(" ")}`)
    .join(" ")
    .toUpperCase();
  return ["BTW", "JR", "IB", "VPB", "VA", "Sales"].filter((domain) => text.includes(domain.toUpperCase()));
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-8 items-center rounded-full bg-muted px-3 text-xs font-semibold text-muted-foreground">
      {children}
    </span>
  );
}
