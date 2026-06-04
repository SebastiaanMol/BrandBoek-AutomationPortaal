import { useMemo, useState } from "react";
import { useCallback, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  GitBranch,
  List,
  Loader2,
  MessageSquareText,
  Pencil,
  Search,
  Zap,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useAllConfirmedAutomationLinks,
  useAutomatiseringen,
  useAutomatiseringenIncludingLegacyGitlab,
  useFlowSuggesties,
  useFlows,
} from "@/lib/hooks";
import { detectFlows } from "@/lib/detectFlows";
import { buildConceptJourneys, type ConceptJourney } from "@/lib/conceptJourneys";
import {
  buildProcessJourneyTrace,
} from "@/lib/processJourneyTrace";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlowSuggestiesTab } from "@/components/FlowSuggestiesTab";
import { ConceptJourneyReviewList } from "@/components/flows/ConceptJourneyReviewList";
import { SourceQualityMatrixTab } from "@/components/flows/SourceQualityMatrixTab";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Automatisering, Flow } from "@/lib/types";
import { invokeEdgeFunction } from "@/lib/storage/edgeFunctions";
import {
  buildProcessJourneyTitleFromAutomations,
  isGenericProcessJourneyTitle,
} from "@/lib/processJourneyCopy";
import {
  readNavigationMemory,
  readNavigationMemoryData,
  rememberCurrentRoute,
  restoreNavigationScroll,
} from "@/lib/navigationMemory";

type DetectProgress = {
  label: string;
  current: number;
  total: number;
};

type FlowTab = "procesreizen" | "conceptprocesreizen" | "uitgeschakeld" | "bronkwaliteit";

interface FlowNavigationMemory {
  activeTab?: FlowTab;
}

interface ConfirmedJourneyRow {
  flow: Flow;
  hasUpdate: boolean;
  automationsInJourney: Automatisering[];
  inactiveAutomations: Automatisering[];
  title: string;
}

interface ConceptJourneyRow {
  journey: ConceptJourney;
  automations: Automatisering[];
  inactiveAutomations: Automatisering[];
}

export default function Flows() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: automations = [] } = useAutomatiseringen();
  const { data: journeyAutomations = [] } = useAutomatiseringenIncludingLegacyGitlab();
  const { data: flows = [] } = useFlows();
  const { data: confirmedLinks = [] } = useAllConfirmedAutomationLinks();
  const { data: suggesties = [] } = useFlowSuggesties();
  const rememberedFlowNavigation = useMemo(
    () => readNavigationMemoryData<FlowNavigationMemory>("flows"),
    [],
  );
  const [activeTab, setActiveTab] = useState<FlowTab>(
    isFlowTab(rememberedFlowNavigation?.activeTab) ? rememberedFlowNavigation.activeTab : "procesreizen",
  );
  const [overviewMode, setOverviewMode] = useState<"timeline" | "list">("list");
  const [isDetecting, setIsDetecting] = useState(false);
  const [progress, setProgress] = useState<DetectProgress | null>(null);
  const restoredScrollRef = useRef(false);

  const journeyAutoMap = useMemo(
    () => new Map(journeyAutomations.map((automation) => [automation.id, automation])),
    [journeyAutomations],
  );

  const proposals = useMemo(
    () => detectFlows(journeyAutomations, confirmedLinks),
    [journeyAutomations, confirmedLinks],
  );

  const conceptJourneys = useMemo(
    () => buildConceptJourneys(suggesties.filter((suggestie) => !suggestie.rejected)),
    [suggesties],
  );

  const tracedFlowAutomationsById = useMemo(() => {
    const tracedAutomations = new Map<string, Automatisering[]>();

    for (const flow of flows) {
      tracedAutomations.set(
        flow.id,
        getTracedFlowAutomations(flow, journeyAutomations, journeyAutoMap),
      );
    }

    return tracedAutomations;
  }, [flows, journeyAutomations, journeyAutoMap]);

  const confirmedJourneyRows = useMemo<ConfirmedJourneyRow[]>(
    () =>
      flows.map((flow) => {
        const automationsInJourney =
          tracedFlowAutomationsById.get(flow.id) ??
          getFlowAutomations(flow, journeyAutoMap);
        const title = isGenericProcessJourneyTitle(flow.naam)
          ? buildProcessJourneyTitleFromAutomations(automationsInJourney, flow.naam)
          : flow.naam;
        const hasUpdate = proposals.some((proposal) => {
          const proposalIds = new Set(proposal.automationIds);
          return (
            flow.automationIds.every((id) => proposalIds.has(id)) &&
            proposalIds.size > flow.automationIds.length
          );
        });

        return {
          flow,
          hasUpdate,
          automationsInJourney,
          inactiveAutomations: getInactiveAutomations(automationsInJourney),
          title,
        };
      }),
    [flows, journeyAutoMap, proposals, tracedFlowAutomationsById],
  );

  const activeConfirmedJourneys = useMemo(
    () => confirmedJourneyRows.filter((row) => row.inactiveAutomations.length === 0),
    [confirmedJourneyRows],
  );

  const inactiveConfirmedJourneys = useMemo(
    () => confirmedJourneyRows.filter((row) => row.inactiveAutomations.length > 0),
    [confirmedJourneyRows],
  );

  const conceptJourneyRows = useMemo<ConceptJourneyRow[]>(
    () =>
      conceptJourneys.map((journey) => {
        const conceptAutomations = getAutomationsByIds(journey.automationIds, journeyAutoMap);
        return {
          journey,
          automations: conceptAutomations,
          inactiveAutomations: getInactiveAutomations(conceptAutomations),
        };
      }),
    [conceptJourneys, journeyAutoMap],
  );

  const activeConceptJourneyRows = useMemo(
    () => conceptJourneyRows.filter((row) => row.inactiveAutomations.length === 0),
    [conceptJourneyRows],
  );

  const inactiveConceptJourneyRows = useMemo(
    () => conceptJourneyRows.filter((row) => row.inactiveAutomations.length > 0),
    [conceptJourneyRows],
  );

  const activeConceptJourneys = useMemo(
    () => activeConceptJourneyRows.map((row) => row.journey),
    [activeConceptJourneyRows],
  );

  const inactiveJourneyCount = inactiveConfirmedJourneys.length + inactiveConceptJourneyRows.length;
  const activeJourneyAutomationCount = useMemo(
    () => activeConfirmedJourneys.reduce((total, row) => total + row.automationsInJourney.length, 0),
    [activeConfirmedJourneys],
  );
  const activeJourneySourceRows = useMemo(
    () => buildSourceRows(activeConfirmedJourneys.flatMap((row) => row.automationsInJourney)),
    [activeConfirmedJourneys],
  );
  const activeJourneyUpdatedAt = useMemo(
    () => formatLatestJourneyDate(activeConfirmedJourneys.map((row) => row.flow.updatedAt ?? row.flow.createdAt)),
    [activeConfirmedJourneys],
  );

  async function handleDetectProcessJourneys() {
    const batchSize = 10;
    setIsDetecting(true);
    setProgress({ label: "Voorbereiden", current: 0, total: 2 });

    try {
      await invokeEdgeFunction("detect-flow-links", {
        mode: "meta",
        limit: batchSize,
      });

      setProgress({ label: "Exacte webhook-matches controleren", current: 1, total: 2 });
      await invokeEdgeFunction("detect-flow-links", { mode: "webhook", limit: batchSize });

      setProgress({ label: "Conceptprocesreizen verversen", current: 2, total: 2 });
      await queryClient.invalidateQueries({ queryKey: ["flowSuggesties"] });
      toast.success("Webhook-bewezen procesreizen gedetecteerd");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Detectie mislukt");
    } finally {
      setIsDetecting(false);
      setProgress(null);
    }
  }

  const rememberFlowNavigation = useCallback(() => {
    rememberCurrentRoute("flows", { activeTab } satisfies FlowNavigationMemory);
  }, [activeTab]);

  useEffect(() => {
    if (restoredScrollRef.current) return;
    const memory = readNavigationMemory("flows");
    if (!memory || memory.scrollY <= 0) return;
    restoredScrollRef.current = true;
    restoreNavigationScroll("flows");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-5 lg:px-10 lg:py-6 animate-fade-in">
        <header className="border-b border-border pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-7 items-center rounded-md bg-stone-100 px-2.5 text-xs font-semibold text-stone-700">
                  Procesreis
                </span>
                {inactiveJourneyCount > 0 && (
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-amber-50 px-2.5 text-xs font-semibold text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {inactiveJourneyCount} issue{inactiveJourneyCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Procesreizen</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Overzicht van webhook-bewezen procesreizen, concepten, bronkwaliteit en automations die gaps veroorzaken.
              </p>
              <div className="mt-4 flex flex-wrap gap-5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5" />
                  {formatCount(activeConfirmedJourneys.length, "procesreis", "procesreizen")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  {automations.length} automations
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Bijgewerkt {activeJourneyUpdatedAt}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border bg-card p-1">
                <Button
                  type="button"
                  variant={overviewMode === "timeline" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 gap-1.5 px-3 text-xs"
                  onClick={() => setOverviewMode("timeline")}
                >
                  <GitBranch className="h-4 w-4" />
                  Tijdlijn
                </Button>
                <Button
                  type="button"
                  variant={overviewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 gap-1.5 px-3 text-xs"
                  onClick={() => setOverviewMode("list")}
                >
                  <List className="h-4 w-4" />
                  Lijst
                </Button>
              </div>
              <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
                <Link to="/flows/review">
                  <MessageSquareText className="h-4 w-4" />
                  Review
                </Link>
              </Button>
              <Button size="sm" className="h-9 gap-1.5" onClick={handleDetectProcessJourneys} disabled={isDetecting}>
                {isDetecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Detecteren...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Detecteer
                  </>
                )}
              </Button>
              <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
                <Link to="/flows/review">
                  <Pencil className="h-4 w-4" />
                  Bewerken
                </Link>
              </Button>
            </div>
          </div>
          {isDetecting && progress && <DetectionProgress progress={progress} />}
        </header>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <OverviewMetric label="Procesreizen" value={activeConfirmedJourneys.length.toString()} detail="In volgorde" />
          <OverviewMetric label="Automations" value={activeJourneyAutomationCount.toString()} detail={`Across ${activeJourneySourceRows.length} bronnen`} />
          <OverviewMetric
            label="Issues"
            value={inactiveJourneyCount.toString()}
            detail={inactiveJourneyCount === 1 ? "1 waarschuwing" : `${inactiveJourneyCount} waarschuwingen`}
            tone="warning"
          />
          <OverviewMetric
            label="Volledig actief"
            value={`${activeConfirmedJourneys.length} / ${confirmedJourneyRows.length}`}
            detail={`${inactiveJourneyCount} reizen hebben gaps`}
            tone={inactiveJourneyCount > 0 ? "danger" : "default"}
          />
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as FlowTab)} className="mt-4">
          <TabsList>
            <TabsTrigger value="procesreizen">Procesreizen</TabsTrigger>
            <TabsTrigger value="conceptprocesreizen">
              Conceptprocesreizen
              {activeConceptJourneys.length > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {activeConceptJourneys.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="uitgeschakeld">
              Uitgeschakelde automations
              {inactiveJourneyCount > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-600 px-1.5 text-[11px] font-semibold text-white">
                  {inactiveJourneyCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="bronkwaliteit">Bronkwaliteit</TabsTrigger>
          </TabsList>

          <TabsContent value="procesreizen" className="mt-4">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
              {activeConfirmedJourneys.length > 0 ? (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Procesreizen</p>
                  <div className="overflow-hidden rounded-lg border border-border bg-card">
                    <Table aria-label="Procesreizen overzicht">
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Naam</TableHead>
                          <TableHead className="w-28">Status</TableHead>
                          <TableHead className="w-40">Bronnen</TableHead>
                          <TableHead className="w-24">Autos</TableHead>
                          <TableHead className="w-12" aria-label="Openen" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeConfirmedJourneys.map(({ flow, hasUpdate, automationsInJourney, title }, index) => (
                          <TableRow
                            key={`confirmed-${flow.id}`}
                            role="link"
                            tabIndex={0}
                            className={["cursor-pointer align-top", hasUpdate ? "bg-amber-50/40" : ""].join(" ")}
                            onClick={() => {
                              rememberFlowNavigation();
                              navigate(`/flows/${flow.id}`);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                rememberFlowNavigation();
                                navigate(`/flows/${flow.id}`);
                              }
                            }}
                          >
                            <TableCell className="font-semibold text-muted-foreground">{index + 1}</TableCell>
                            <TableCell>
                              <p className="max-w-[360px] truncate font-semibold leading-snug text-foreground">
                                {title}
                              </p>
                              <p className="mt-0.5 max-w-[360px] truncate text-xs text-muted-foreground">
                                {buildConfirmedStartSignal(flow, automationsInJourney)}
                              </p>
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex rounded-md bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                                Actief
                              </span>
                            </TableCell>
                            <TableCell>
                              <SourceBadges automations={automationsInJourney} fallbackSystems={flow.systemen} />
                            </TableCell>
                            <TableCell className="font-semibold text-foreground">{automationsInJourney.length}</TableCell>
                            <TableCell className="text-muted-foreground">
                              <ArrowRight className="h-4 w-4" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="card-elevated p-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Nog geen actieve webhook-bewezen procesreizen. Reizen met uitgeschakelde automations staan in de aparte tab.
                  </p>
                </div>
              )}

              <aside className="space-y-4" aria-label="Procesreis issues en bronnen">
                <OverviewPanel title="Issues">
                  {inactiveJourneyCount === 0 ? (
                    <p className="text-sm text-muted-foreground">Geen actieve issues.</p>
                  ) : (
                    <div className="space-y-3">
                      {inactiveConfirmedJourneys.map((row) => (
                        <div key={`issue-${row.flow.id}`} className="border-b border-border pb-3 last:border-0 last:pb-0">
                          <div className="flex items-start gap-2">
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold leading-snug text-foreground">
                                {row.title} heeft uitgeschakelde automations
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {row.inactiveAutomations.length} automation{row.inactiveAutomations.length === 1 ? "" : "s"} uitgeschakeld
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </OverviewPanel>

                <OverviewPanel title="Bronnen">
                  <div className="space-y-2">
                    {activeJourneySourceRows.map((source) => (
                      <div key={source.label} className="flex items-center justify-between gap-3 text-sm">
                        <span
                          className="inline-flex max-w-[120px] items-center rounded px-1.5 py-0.5 text-xs font-semibold text-white"
                          style={{ backgroundColor: sourceColor(source.label) }}
                        >
                          {source.label}
                        </span>
                        <span className="text-muted-foreground">
                          {source.count} automation{source.count === 1 ? "" : "s"}
                        </span>
                      </div>
                    ))}
                  </div>
                </OverviewPanel>
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="conceptprocesreizen" className="mt-4">
            <div className="mb-5 rounded-xl border border-border bg-muted/20 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Conceptprocesreis = nog niet opgeslagen route met 100% webhook-match.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Alleen exacte webhook/endpoint-overdrachten komen in deze lijst terecht.
                  </p>
                </div>
                <Button size="sm" onClick={handleDetectProcessJourneys} disabled={isDetecting}>
                  {isDetecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Detecteren...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Detecteer procesreizen
                    </>
                  )}
                </Button>
              </div>
              {isDetecting && progress && <DetectionProgress progress={progress} />}
            </div>

            {activeConceptJourneys.length > 0 ? (
              <ConceptJourneyReviewList
                journeys={activeConceptJourneys}
                automationMap={journeyAutoMap}
                onOpenJourney={(journey) => {
                  rememberFlowNavigation();
                  navigate(journey.href);
                }}
              />
            ) : (
              <div className="card-elevated p-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Geen actieve webhook-matches gevonden. Concepten met uitgeschakelde automations staan in de aparte tab.
                </p>
              </div>
            )}

            <details className="mt-6 rounded-2xl border border-border bg-card shadow-sm">
              <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-foreground">
                Technische suggestielijst en detectie tonen
              </summary>
              <div className="border-t border-border p-5">
                <FlowSuggestiesTab />
              </div>
            </details>
          </TabsContent>

          <TabsContent value="uitgeschakeld" className="mt-4">
            <InactiveAutomationJourneysTab
              confirmedJourneys={inactiveConfirmedJourneys}
              conceptJourneys={inactiveConceptJourneyRows}
              onOpenConfirmed={(flow) => {
                rememberFlowNavigation();
                navigate(`/flows/${flow.id}`);
              }}
              onOpenConcept={(journey) => {
                rememberFlowNavigation();
                navigate(journey.href);
              }}
            />
          </TabsContent>

          <TabsContent value="bronkwaliteit" className="mt-4">
            <SourceQualityMatrixTab automations={journeyAutomations} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function isFlowTab(value: unknown): value is FlowTab {
  return value === "procesreizen" || value === "conceptprocesreizen" || value === "uitgeschakeld" || value === "bronkwaliteit";
}

function OverviewMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning" | "danger";
}) {
  const valueClass = tone === "danger" ? "text-red-700" : tone === "warning" ? "text-amber-700" : "text-foreground";
  return (
    <div className="rounded-lg bg-stone-50 px-4 py-3">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold leading-none tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function OverviewPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function SourceBadges({
  automations,
  fallbackSystems,
}: {
  automations: Automatisering[];
  fallbackSystems: string[];
}) {
  const labels = automations.length > 0
    ? [...new Set(automations.map((automation) => sourceLabel(automation)).filter(Boolean))]
    : [...new Set(fallbackSystems.filter(Boolean))];
  const plainLabel = labels.join(" / ");

  return (
    <div className="flex flex-wrap gap-1">
      {plainLabel && <span className="sr-only">{plainLabel}</span>}
      {labels.slice(0, 3).map((label) => (
        <span
          key={label}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: sourceColor(label) }}
        >
          {label}
        </span>
      ))}
      {labels.length === 0 && <span className="text-xs text-muted-foreground">-</span>}
    </div>
  );
}

function buildSourceRows(automations: Automatisering[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const automation of automations) {
    const label = sourceLabel(automation) || "Onbekend";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function sourceLabel(automation: Automatisering): string {
  const source = automation.source?.toLowerCase();
  if (source === "hubspot") return "HubSpot";
  if (source === "gitlab") return "GitLab";
  if (source === "zapier") return "Zapier";
  if (source === "typeform") return "Typeform";
  return automation.systemen[0] ?? "";
}

function sourceColor(label: string): string {
  if (label === "HubSpot") return "#ff6b4a";
  if (label === "GitLab") return "#fc6d26";
  if (label === "Zapier") return "#ff4a00";
  if (label === "Typeform") return "#262627";
  return "#64748b";
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatLatestJourneyDate(values: Array<string | null | undefined>): string {
  const latest = values
    .map((value) => (value ? new Date(value) : null))
    .filter((date): date is Date => Boolean(date) && !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (!latest) return "onbekend";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(latest);
}

function InactiveAutomationJourneysTab({
  confirmedJourneys,
  conceptJourneys,
  onOpenConfirmed,
  onOpenConcept,
}: {
  confirmedJourneys: ConfirmedJourneyRow[];
  conceptJourneys: ConceptJourneyRow[];
  onOpenConfirmed: (flow: Flow) => void;
  onOpenConcept: (journey: ConceptJourney) => void;
}) {
  const total = confirmedJourneys.length + conceptJourneys.length;

  return (
    <section className="space-y-4" aria-label="Procesreizen met uitgeschakelde automations">
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Procesreizen met uitgeschakelde automations
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Deze reizen zijn niet verdwenen. Ze staan apart omdat minstens een betrokken automation niet actief is.
            </p>
          </div>
        </div>
      </div>

      {total === 0 ? (
        <div className="card-elevated p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Geen procesreizen met uitgeschakelde automations gevonden.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {confirmedJourneys.map((row) => (
            <InactiveAutomationJourneyCard
              key={`inactive-confirmed-${row.flow.id}`}
              typeLabel="Procesreis"
              title={row.title}
              description={row.flow.beschrijving}
              automationCount={row.automationsInJourney.length}
              inactiveAutomations={row.inactiveAutomations}
              onOpen={() => onOpenConfirmed(row.flow)}
            />
          ))}
          {conceptJourneys.map((row) => (
            <InactiveAutomationJourneyCard
              key={`inactive-concept-${row.journey.id}`}
              typeLabel="Conceptprocesreis"
              title={row.journey.title}
              description={row.journey.description}
              automationCount={row.journey.automationCount}
              inactiveAutomations={row.inactiveAutomations}
              onOpen={() => onOpenConcept(row.journey)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function InactiveAutomationJourneyCard({
  typeLabel,
  title,
  description,
  automationCount,
  inactiveAutomations,
  onOpen,
}: {
  typeLabel: string;
  title: string;
  description?: string;
  automationCount: number;
  inactiveAutomations: Automatisering[];
  onOpen: () => void;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {typeLabel}
            </span>
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {automationCount} automation{automationCount === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
              {inactiveAutomations.length} uitgeschakeld
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold leading-snug text-foreground">
            {title}
          </h3>
          {description && (
            <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {inactiveAutomations.map((automation) => (
              <span
                key={automation.id}
                className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
              >
                {automation.naam} · {automation.status}
              </span>
            ))}
          </div>
        </div>
        <Button className="w-fit shrink-0" variant="outline" onClick={onOpen}>
          Bekijk
        </Button>
      </div>
    </article>
  );
}

function DetectionProgress({ progress }: { progress: DetectProgress }) {
  const percentage = Math.min(100, Math.max(6, Math.round((progress.current / Math.max(1, progress.total)) * 100)));

  return (
    <div className="mt-3 rounded-lg border border-border bg-background/70 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-foreground">{progress.label}</span>
        <span className="shrink-0 text-muted-foreground">
          {Math.min(progress.current, progress.total)} / {progress.total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function inferStartSignal(name: string): string {
  const cleaned = name
    .replace(/\s+instellen$/i, "")
    .replace(/\s+workflow$/i, "")
    .replace(/^['"]|['"]$/g, "")
    .trim();

  return cleaned || "HubSpot wijziging";
}

function getFlowAutomations(
  flow: Flow,
  autoMap: Map<string, Automatisering>,
): Automatisering[] {
  return flow.automationIds
    .map((id) => autoMap.get(id))
    .filter((automation): automation is Automatisering => Boolean(automation));
}

function getAutomationsByIds(
  ids: string[],
  autoMap: Map<string, Automatisering>,
): Automatisering[] {
  return ids
    .map((id) => autoMap.get(id))
    .filter((automation): automation is Automatisering => Boolean(automation));
}

function getInactiveAutomations(automations: Automatisering[]): Automatisering[] {
  return automations.filter((automation) => !isAutomationActive(automation));
}

function isAutomationActive(automation: Automatisering): boolean {
  const status = automation.status?.trim().toLowerCase();
  return status === "actief" || status === "active" || status === "enabled";
}

function getTracedFlowAutomations(
  flow: Flow,
  automations: Automatisering[],
  autoMap: Map<string, Automatisering>,
): Automatisering[] {
  const trace = buildProcessJourneyTrace({
    automations,
    seedIds: flow.automationIds,
  });

  const tracedIds = trace.orderedNodeIds.length > 0
    ? [...trace.orderedNodeIds]
    : [...flow.automationIds];
  const seenIds = new Set(tracedIds);
  for (const id of flow.automationIds) {
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    tracedIds.push(id);
  }

  return tracedIds
    .map((id) => autoMap.get(id))
    .filter((automation): automation is Automatisering => Boolean(automation));
}

function buildConfirmedStartSignal(flow: Flow, automations: Automatisering[]): string {
  const firstAutomation = automations[0];
  if (firstAutomation?.trigger) return firstAutomation.trigger;
  if (firstAutomation?.naam) return inferStartSignal(firstAutomation.naam);
  return inferStartSignal(flow.naam);
}

