import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ExternalLink, Info, XCircle } from "lucide-react";
import {
  useFlows,
  useAutomatiseringenIncludingLegacyGitlab,
  usePipelines,
  useUpdateFlow,
  useDeleteFlow,
} from "@/lib/hooks";
import {
  useBevestigFlowSuggestie,
  useVerwerpFlowSuggestie,
  useOngedaanVerwerpFlowSuggestie,
  useOpenSuggestiesVoorFlow,
  useAllConfirmedAutomationLinks,
} from "@/lib/queryHooks/automationLinks";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import type { Automatisering, Systeem } from "@/lib/types";
import { FlowHeader } from "@/components/flows/FlowHeader";
import { buildFlowEdges, type FlowEdge } from "@/lib/flowEdges";
import { AutomationList } from "@/components/flows/AutomationList";
import { AutomationDetail } from "@/components/flows/AutomationDetail";
import { FlowRuntimeChain } from "@/components/flows/FlowRuntimeChain";
import { ProcessJourneyNarrative } from "@/components/flows/ProcessJourneyNarrative";
import { buildAutomationFunnel } from "@/lib/automationFunnel";
import { displayAutomationName } from "@/lib/automationDisplay";
import { expandFlowAutomationIds } from "@/lib/flowRuntimeChain";
import { getSystemMeta } from "@/lib/systemMeta";
import { findNextProcessJourney } from "@/lib/processJourneyLinks";
import {
  getFlowDetailPresentation,
  getPresentationAutomationLabel,
  getPresentationAutomationSummary,
  type FlowDetailPresentation,
} from "@/lib/flowDetailPresentation";

export default function FlowDetail(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: flows = [], isLoading: flowsLoading } = useFlows();
  const { data: automations = [] } = useAutomatiseringenIncludingLegacyGitlab();
  const { data: pipelines = [] } = usePipelines();
  const { data: confirmedLinks = [] } = useAllConfirmedAutomationLinks();
  const updateFlow = useUpdateFlow();
  const deleteFlow = useDeleteFlow();

  const flow = useMemo(() => flows.find((f) => f.id === id), [flows, id]);
  const autoMap = useMemo(
    () => new Map(automations.map((a) => [a.id, a])),
    [automations],
  );

  const [naam, setNaam] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const initializedRef = useRef<string | null>(null);
  const flowId = flow?.id;
  const flowNaam = flow?.naam;
  const flowBeschrijving = cleanConfirmedFlowDescription(flow?.beschrijving ?? "");
  const firstAutoId = flow?.automationIds[0] ?? null;
  const runtimeAutomationIds = useMemo(
    () => flow ? expandFlowAutomationIds(flow.automationIds, confirmedLinks) : [],
    [flow, confirmedLinks],
  );
  const runtimeFlow = useMemo(
    () => flow ? { ...flow, automationIds: runtimeAutomationIds } : null,
    [flow, runtimeAutomationIds],
  );

  useEffect(() => {
    if (flowId && initializedRef.current !== flowId) {
      initializedRef.current = flowId;
      setNaam(flowNaam ?? "");
      setSelectedId(firstAutoId);
    }
  }, [flowId, flowNaam, firstAutoId]);

  const isDirty =
    flow !== undefined &&
    naam !== flow.naam;

  if (flowsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Procesreis niet gevonden.</p>
      </div>
    );
  }

  async function handleSave(): Promise<void> {
    try {
      await updateFlow.mutateAsync({ id: flow!.id, naam });
      toast.success("Opgeslagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await deleteFlow.mutateAsync(flow!.id);
      toast.success("Procesreis verwijderd");
      navigate("/flows");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  }

  async function handleRemoveAutomation(autoId: string): Promise<void> {
    const newIds = flow!.automationIds.filter((i) => i !== autoId);
    const remainingAutos = newIds
      .map((i) => autoMap.get(i))
      .filter((a): a is Automatisering => a !== undefined);
    const newSystemen = [...new Set(remainingAutos.flatMap((a) => a.systemen))] as Systeem[];
    try {
      await updateFlow.mutateAsync({ id: flow!.id, automationIds: newIds, systemen: newSystemen });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  }

  const flowForDisplay = runtimeFlow ?? flow;
  const missingRuntimeIds = flowForDisplay.automationIds.filter((autoId) => !autoMap.get(autoId));
  const involvedAutomations = flowForDisplay.automationIds
    .map((autoId) => autoMap.get(autoId))
    .filter((automation): automation is Automatisering => automation !== undefined);
  const presentation = getFlowDetailPresentation(flow, involvedAutomations);
  const downstreamJourney = findNextProcessJourney(flow, flows, confirmedLinks, autoMap);

  const sharedListProps = {
    flow: flowForDisplay,
    autoMap,
    selectedId,
    onSelect: setSelectedId,
    presentation,
  } as const;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] space-y-8 px-6 py-8 lg:px-10 lg:py-10 animate-fade-in">
          <FlowHeader
            flow={flow}
            automationCount={flowForDisplay.automationIds.length}
          naam={naam}
          setNaam={setNaam}
          isDirty={isDirty}
          onSave={handleSave}
          isSaving={updateFlow.isPending}
        />

        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px] xl:gap-10">
          {/* Left: process journey */}
          <section className="min-w-0 space-y-7">
            <section className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Procesverhaal
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                Wat gebeurt er in deze procesreis?
              </h2>
              <ProcessJourneyNarrative
                automations={involvedAutomations}
                pipelines={pipelines}
                autoMap={autoMap}
                approvedDescription={presentation?.approvedDescription ?? flowBeschrijving}
              />
            </section>

            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Procesreis
              </h2>
              <p className="text-sm text-muted-foreground">
                {presentation?.processJourneyIntro ?? "Een stap-voor-stap overzicht van wat er gebeurt. Startsignaal en vervolgcontrole staan apart."}
              </p>
            </div>

            {!presentation && (
              <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary-soft px-4 py-3 text-xs leading-relaxed text-foreground/80">
                <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                <p>
                  Deze procesreis lees je als volgorde van acties: stap 1, stap 2, de overgang tussen stappen, en daarna pas apart de controle of er een vervolgproces bewezen is.
                </p>
              </div>
            )}

            <FlowRuntimeChain
              flow={flowForDisplay}
              autoMap={autoMap}
              selectedId={selectedId}
              onSelect={setSelectedId}
              downstreamJourney={downstreamJourney}
              pipelines={pipelines}
              presentation={presentation}
            />

            <section className="min-w-0 space-y-4">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Automations in deze procesreis
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {presentation?.automationCardsIntro ?? "Dit zijn de automation-records waaruit deze procesreis bestaat. Klik door om het volledige automation-record te openen."}
                </p>
              </div>
              <ProcessAutomationCards flow={flowForDisplay} autoMap={autoMap} presentation={presentation} />
            </section>

            <FlowEvidenceSummary edges={buildFlowEdges(flowForDisplay.automationIds, autoMap, confirmedLinks)} autoMap={autoMap} presentation={presentation} />
          </section>
          {/* Right: details */}
          <aside className="min-w-0 space-y-6 self-start lg:sticky lg:top-6">
            <div className="card-elevated p-5">
              <p className="px-1 pb-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                Snelle navigatie
              </p>
              <AutomationList {...sharedListProps} />
              {missingRuntimeIds.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  {missingRuntimeIds.map((autoId) => (
                    <div key={autoId} className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate">{autoId} - niet meer beschikbaar</p>
                      <button
                        type="button"
                        className="text-xs text-destructive hover:underline shrink-0"
                        onClick={() => handleRemoveAutomation(autoId)}
                      >
                        Verwijder
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5 pt-1">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Geselecteerde automation
              </h2>
              <p className="text-sm text-muted-foreground">
                {presentation?.selectedAutomationIntro ?? "Wat deze automation doet, in mensentaal."}
              </p>
            </div>
            <AutomationDetail
              automationId={selectedId}
              currentFlowId={flow.id}
              autoMap={autoMap}
              allFlows={flows}
              presentation={presentation}
            />

            {!presentation && (
              <OpenSuggestiesCard
                flowId={flow.id}
                automationIds={flow.automationIds}
                onBevestig={async (fromId: string, toId: string) => {
                  const newIds = [...new Set([...flow.automationIds, fromId, toId])];
                  const newAutos = newIds
                    .map((id) => autoMap.get(id))
                    .filter((a): a is Automatisering => a !== undefined);
                  const newSystemen = [...new Set(newAutos.flatMap((a) => a.systemen))] as Systeem[];
                  await updateFlow.mutateAsync({
                    id: flow.id,
                    automationIds: newIds,
                    systemen: newSystemen,
                  });
                }}
              />
            )}

            <div className="card-elevated p-5">
              {showDeleteConfirm ? (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-muted-foreground">Procesreis verwijderen?</p>
                  <button
                    type="button"
                    className="text-sm text-destructive font-medium hover:underline disabled:opacity-50"
                    onClick={handleDelete}
                    disabled={deleteFlow.isPending}
                  >
                    Ja, verwijder
                  </button>
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Annuleer
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-sm text-destructive hover:text-destructive/80 transition-colors"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Procesreis verwijderen
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function cleanConfirmedFlowDescription(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\s*Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld\.?\s*$/i, "")
    .trim();
}

function FlowEvidenceSummary({
  edges,
  autoMap,
  presentation,
}: {
  edges: FlowEdge[];
  autoMap: Map<string, Automatisering>;
  presentation?: FlowDetailPresentation | null;
}) {
  return (
    <div className="card-elevated p-4">
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Bewijs per overgang
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {presentation?.evidenceIntro ?? "Zo weet je of een overgang hard bevestigd is of alleen uit de volgorde is afgeleid."}
        </p>
      </div>
      {presentation?.evidenceItems.length ? (
        <div className="space-y-2">
          {presentation.evidenceItems.map((item, index) => (
            <div key={item.label} className="rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                  {index + 1}
                </span>
                <EvidenceBadge level={item.status === "Bevestigd" ? "confirmed" : item.status === "Afgeleid" ? "weak" : "uncertain"} label={item.status} />
                <span className="text-xs font-semibold text-muted-foreground">
                  {item.label}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {item.reason}
              </p>
            </div>
          ))}
        </div>
      ) : edges.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3">
          <p className="text-sm font-medium text-foreground">
            Nog geen overgangsbewijs gevonden.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Deze procesreis is opgeslagen, maar er is nog geen directe koppeling tussen de stappen
            bevestigd. Controleer of de juiste automations in deze procesreis staan.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {edges.map((edge, index) => {
            const from = autoMap.get(edge.from);
            const to = autoMap.get(edge.to);
            return (
              <div key={`${edge.from}-${edge.to}`} className="rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                    {index + 1}
                  </span>
                  <EvidenceBadge level={edge.evidence.level} label={edge.evidence.label} />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {edge.evidence.score}% zekerheid
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium leading-snug text-foreground">
                  {from?.naam ?? edge.from}
                  <span className="mx-2 text-muted-foreground">-&gt;</span>
                  {to?.naam ?? edge.to}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {edge.evidence.reason}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProcessAutomationCards({
  flow,
  autoMap,
  presentation,
}: {
  flow: { automationIds: string[] };
  autoMap: Map<string, Automatisering>;
  presentation?: FlowDetailPresentation | null;
}) {
  const automations = flow.automationIds
    .map((automationId) => autoMap.get(automationId))
    .filter((automation): automation is Automatisering => automation !== undefined);

  if (automations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground">
          Er zijn nog geen automation-records gekoppeld aan deze procesreis.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {automations.map((automation, index) => {
        const primarySystem = automation.systemen[0] ?? "Anders";
        const system = getSystemMeta(primarySystem);
        const summary = getPresentationAutomationSummary(
          presentation ?? null,
          automation,
          buildAutomationFunnel(automation)?.narrative || automation.doel || automation.trigger,
        );

        return (
          <Link
            key={automation.id}
            to={`/automations/${encodeURIComponent(automation.id)}`}
            className="group rounded-lg border border-border bg-card p-3.5 shadow-sm transition-colors hover:border-primary/50 hover:bg-primary-soft/40 focus-ring"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border bg-background px-1 text-[9px] font-bold"
                    style={{
                      borderColor: `hsl(var(${system.hue}))`,
                      color: `hsl(var(${system.hue}))`,
                    }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {system.label}
                  </span>
                </div>
                <h3 className="mt-1.5 line-clamp-1 text-sm font-semibold leading-snug text-foreground">
                  {getPresentationAutomationLabel(presentation ?? null, automation, displayAutomationName(automation))}
                </h3>
              </div>
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            {summary && (
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                {summary}
              </p>
            )}
            <p className="mt-2 text-[10px] font-semibold text-primary">
              Open automation
            </p>
          </Link>
        );
      })}
    </div>
  );
}

function EvidenceBadge({ level, label }: { level: FlowEdge["evidence"]["level"]; label: string }) {
  const className =
    level === "confirmed"
      ? "bg-green-100 text-green-700"
      : level === "hard"
        ? "bg-blue-100 text-blue-700"
        : level === "strong"
          ? "bg-indigo-100 text-indigo-700"
          : level === "weak"
            ? "bg-yellow-100 text-yellow-800"
            : "bg-slate-100 text-slate-700";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}>
      {label}
    </span>
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

  const nogTeBeoordelen = suggesties.filter((s) => !s.rejected);
  const afgewezen = suggesties.filter((s) => s.rejected);

  if (suggesties.length === 0) return null;

  const anyPending = bevestig.isPending || verwerp.isPending || ongedaanVerwerp.isPending;

  async function handleBevestig(s: FlowSuggestie): Promise<void> {
    try {
      await onBevestig(s.fromId, s.toId);
      await bevestig.mutateAsync({ fromId: s.fromId, toId: s.toId });
      toast.success("Koppeling bevestigd");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bevestigen mislukt");
    }
  }

  return (
    <div className="card-elevated p-4 space-y-3">
      <p className="px-1 pb-1 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
        Openstaande suggesties
      </p>

      {nogTeBeoordelen.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground">
            Nog te beoordelen ({nogTeBeoordelen.length})
          </p>
          {nogTeBeoordelen.map((s) => (
            <div
              key={`${s.fromId}-${s.toId}`}
              className="grid gap-2 rounded-lg border border-border bg-background p-2"
            >
              <div className="min-w-0 text-xs leading-relaxed">
                <span className="font-medium text-foreground">{s.fromNaam}</span>
                <span className="text-muted-foreground mx-1">-&gt;</span>
                <span className="font-medium text-foreground">{s.toNaam}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <ZekerheidBadge zekerheid={s.zekerheid} />
                <button
                  type="button"
                  className="rounded border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                  disabled={anyPending}
                  onClick={() =>
                    verwerp.mutate(
                      { fromId: s.fromId, toId: s.toId },
                      { onError: (e) => toast.error(e instanceof Error ? e.message : "Verwerpen mislukt") },
                    )
                  }
                >
                  Verwerp
                </button>
                <button
                  type="button"
                  className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                  disabled={anyPending}
                  onClick={() => handleBevestig(s)}
                >
                  Bevestig
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {afgewezen.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground">
            Afgewezen ({afgewezen.length})
          </p>
          {afgewezen.map((s) => (
            <div
              key={`${s.fromId}-${s.toId}`}
              className="grid gap-2 rounded-lg border border-border bg-background p-2 opacity-60"
            >
              <div className="flex min-w-0 gap-2 text-xs leading-relaxed">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                <span>
                  <span className="font-medium text-foreground">{s.fromNaam}</span>
                  <span className="text-muted-foreground mx-1">-&gt;</span>
                  <span className="font-medium text-foreground">{s.toNaam}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pl-5">
                <ZekerheidBadge zekerheid={s.zekerheid} />
                <button
                  type="button"
                  className="rounded border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                  disabled={anyPending}
                  onClick={() =>
                    ongedaanVerwerp.mutate(
                      { fromId: s.fromId, toId: s.toId },
                      { onError: (e) => toast.error(e instanceof Error ? e.message : "Ongedaan maken mislukt") },
                    )
                  }
                >
                  Ongedaan maken
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ZekerheidBadge({ zekerheid }: { zekerheid: "webhook" | "ai" }) {
  return zekerheid === "webhook" ? (
    <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold text-green-700">
      webhook
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[9px] font-semibold text-yellow-700">
      AI
    </span>
  );
}
