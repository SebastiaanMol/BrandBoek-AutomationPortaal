import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search, Workflow } from "lucide-react";
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
import { buildConceptJourneys } from "@/lib/conceptJourneys";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlowSuggestiesTab } from "@/components/FlowSuggestiesTab";
import { Badge } from "@/components/ui/badge";
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

type DetectProgress = {
  label: string;
  current: number;
  total: number;
};

export default function Flows() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: automations = [] } = useAutomatiseringen();
  const { data: journeyAutomations = [] } = useAutomatiseringenIncludingLegacyGitlab();
  const { data: flows = [] } = useFlows();
  const { data: confirmedLinks = [] } = useAllConfirmedAutomationLinks();
  const { data: suggesties = [] } = useFlowSuggesties();
  const [isDetecting, setIsDetecting] = useState(false);
  const [progress, setProgress] = useState<DetectProgress | null>(null);

  const journeyAutoMap = useMemo(
    () => new Map(journeyAutomations.map((automation) => [automation.id, automation])),
    [journeyAutomations],
  );

  const proposals = useMemo(
    () => detectFlows(automations, confirmedLinks),
    [automations, confirmedLinks],
  );

  const confirmedJourneys = useMemo(
    () =>
      flows.map((flow) => ({
        flow,
        hasUpdate: proposals.some((proposal) => {
          const proposalIds = new Set(proposal.automationIds);
          return (
            flow.automationIds.every((id) => proposalIds.has(id)) &&
            proposalIds.size > flow.automationIds.length
          );
        }),
      })),
    [flows, proposals],
  );

  const conceptJourneys = useMemo(
    () => buildConceptJourneys(suggesties.filter((suggestie) => !suggestie.rejected)),
    [suggesties],
  );

  const totalSystems = useMemo(() => {
    const systems = new Set<string>();

    for (const flow of flows) {
      for (const system of flow.systemen) systems.add(system);
    }

    for (const journey of conceptJourneys) {
      for (const id of journey.automationIds) {
        const automation = journeyAutoMap.get(id);
        for (const system of automation?.systemen ?? []) systems.add(system);
      }
    }

    return systems.size;
  }, [flows, journeyAutoMap, conceptJourneys]);

  async function handleDetectProcessJourneys() {
    const batchSize = 10;
    setIsDetecting(true);
    setProgress({ label: "Voorbereiden", current: 0, total: 2 });

    try {
      await invokeEdgeFunction("detect-flow-links", {
        mode: "meta",
        limit: batchSize,
      });

      setProgress({ label: "Webhook en backend-bewijs controleren", current: 1, total: 2 });
      await invokeEdgeFunction("detect-flow-links", { mode: "webhook", limit: batchSize });

      setProgress({ label: "Conceptprocesreizen verversen", current: 2, total: 2 });
      await queryClient.invalidateQueries({ queryKey: ["flowSuggesties"] });
      toast.success("Conceptprocesreizen gedetecteerd");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Detectie mislukt");
    } finally {
      setIsDetecting(false);
      setProgress(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10 lg:py-10 animate-fade-in">
        <header className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-primary-soft">
          <div className="px-8 py-8">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Workflow className="h-4 w-4" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                Automatiseringsportaal
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Procesreizen</h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Een procesreis laat zien hoe werk door HubSpot, GitLab workers en vervolgprocessen
              beweegt: wat iets start, wat er verandert en wat daarna kan gebeuren.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <StatBadge label="Bevestigd" value={confirmedJourneys.length} />
              <StatBadge label="Concepten" value={conceptJourneys.length} />
              <StatBadge label="Automations" value={automations.length} />
              <StatBadge label="Systemen" value={totalSystems} />
            </div>
          </div>
        </header>

        <Tabs defaultValue="procesreizen" className="mt-4">
          <TabsList>
            <TabsTrigger value="procesreizen">Procesreizen</TabsTrigger>
            <TabsTrigger value="conceptprocesreizen">
              Conceptprocesreizen
              {conceptJourneys.length > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {conceptJourneys.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="procesreizen" className="mt-4">
            <div className="mb-5 rounded-xl border border-border bg-muted/20 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Bevestigde procesreis = gecontroleerde route van startsignaal naar vervolgproces.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Dit zijn procesreizen die zijn beoordeeld en opgeslagen als officiele uitleg van hoe
                    werk door het bedrijf beweegt.
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

            {confirmedJourneys.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-[22%]">Procesreis</TableHead>
                      <TableHead className="w-[18%]">Startsignaal</TableHead>
                      <TableHead>Domein</TableHead>
                      <TableHead>Systemen</TableHead>
                      <TableHead>Stappen</TableHead>
                      <TableHead>Impact</TableHead>
                      <TableHead>Eigenaar</TableHead>
                      <TableHead>Laatst bijgewerkt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {confirmedJourneys.map(({ flow, hasUpdate }) => {
                      const automationsInJourney = getFlowAutomations(flow, journeyAutoMap);
                      const systems = buildSystemLabel(automationsInJourney, flow.systemen);
                      const title = isGenericProcessJourneyTitle(flow.naam)
                        ? buildProcessJourneyTitleFromAutomations(automationsInJourney, flow.naam)
                        : flow.naam;

                      return (
                        <TableRow
                          key={`confirmed-${flow.id}`}
                          role="link"
                          tabIndex={0}
                          className="cursor-pointer align-top"
                          onClick={() => navigate(`/flows/${flow.id}`)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              navigate(`/flows/${flow.id}`);
                            }
                          }}
                        >
                          <TableCell>
                            <p className="font-semibold leading-snug text-foreground">
                              {title}
                            </p>
                            {flow.beschrijving && (
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                {flow.beschrijving}
                              </p>
                            )}
                            {hasUpdate && (
                              <p className="mt-2 text-xs font-medium text-amber-700">
                                Nieuwe suggestie beschikbaar
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium leading-snug text-foreground">
                              {buildConfirmedStartSignal(flow, automationsInJourney)}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm text-foreground">
                              {buildDomainLabel(automationsInJourney)}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm text-foreground">{systems}</p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium text-foreground">
                              {flow.automationIds.length}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">automations</p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm text-foreground">
                              {buildImpactLabel(automationsInJourney)}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm text-foreground">
                              {buildOwnerLabel(automationsInJourney)}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm text-muted-foreground">
                              {formatJourneyDate(flow.updatedAt ?? flow.createdAt)}
                            </p>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="card-elevated p-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Nog geen bevestigde procesreizen. Bekijk de conceptprocesreizen om routes te
                  beoordelen en vast te leggen.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="conceptprocesreizen" className="mt-4">
            <div className="mb-5 rounded-xl border border-border bg-muted/20 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Conceptprocesreis = gereconstrueerde route uit startsignaal, endpoint en
                    automation-bewijs.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Beoordeel hier of de reconstructie klopt. Na bevestiging kan een conceptprocesreis
                    een officiele procesreis worden.
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

            {conceptJourneys.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-[22%]">Startsignaal</TableHead>
                      <TableHead className="w-[22%]">Bronautomation</TableHead>
                      <TableHead className="w-[26%]">GitLab worker / endpoint</TableHead>
                      <TableHead>Zekerheid</TableHead>
                      <TableHead>Impact</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conceptJourneys.map((journey) => {
                      const automationsInJourney = journey.automationIds
                        .map((id) => journeyAutoMap.get(id))
                        .filter((automation): automation is Automatisering => Boolean(automation));
                      const systems = buildSystemLabel(automationsInJourney);
                      const impact = buildImpactLabel(automationsInJourney);

                      return (
                        <TableRow
                          key={`suggestion-${journey.id}`}
                          role="link"
                          tabIndex={0}
                          className="cursor-pointer align-top"
                          onClick={() => navigate(journey.href)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              navigate(journey.href);
                            }
                          }}
                        >
                          <TableCell>
                            <p className="font-semibold leading-snug text-foreground">
                              {journey.startSignal}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Hier begint de kettingreactie.
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium leading-snug text-foreground">
                              {journey.hubspotAutomation}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {journey.sourceSystem} routeert naar backend.
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium leading-snug text-foreground">
                              {journey.gitlabWorker}
                            </p>
                            {journey.endpoint && (
                              <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                                {journey.endpoint}
                              </code>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={journey.confidenceTone === "strong" ? "default" : "secondary"}
                              className={
                                journey.confidenceTone === "strong"
                                  ? "bg-green-100 text-green-800 hover:bg-green-100"
                                  : "bg-amber-100 text-amber-800 hover:bg-amber-100"
                              }
                            >
                              {journey.confidenceLabel}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium text-foreground">{impact}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{systems}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">Te beoordelen</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="card-elevated p-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Geen conceptprocesreizen gevonden. Detecteer suggesties om nieuwe procesreizen te
                  reconstrueren.
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
        </Tabs>
      </div>
    </div>
  );
}

const StatBadge = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl border border-border bg-card/80 px-4 py-2.5 backdrop-blur-sm">
    <p className="text-xl font-semibold leading-tight text-foreground tabular-nums">{value}</p>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
  </div>
);

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

function buildSystemLabel(automations: Automatisering[], fallbackSystems: string[] = []): string {
  const systems = [
    ...new Set([
      ...fallbackSystems,
      ...automations.flatMap((automation) => automation.systemen),
    ]),
  ];
  return systems.length > 0 ? systems.join(" / ") : "Systemen nog onbekend";
}

function getFlowAutomations(
  flow: Flow,
  autoMap: Map<string, Automatisering>,
): Automatisering[] {
  return flow.automationIds
    .map((id) => autoMap.get(id))
    .filter((automation): automation is Automatisering => Boolean(automation));
}

function buildConfirmedStartSignal(flow: Flow, automations: Automatisering[]): string {
  const firstAutomation = automations[0];
  if (firstAutomation?.trigger) return firstAutomation.trigger;
  if (firstAutomation?.naam) return inferStartSignal(firstAutomation.naam);
  return inferStartSignal(flow.naam);
}

function buildDomainLabel(automations: Automatisering[]): string {
  const text = automations
    .map((automation) => `${automation.naam} ${automation.doel} ${automation.trigger} ${automation.fasen.join(" ")}`)
    .join(" ")
    .toUpperCase();
  const domains = ["BTW", "JR", "IB", "VPB", "VA", "Sales"].filter((domain) =>
    text.includes(domain.toUpperCase()),
  );

  return domains.length > 0 ? domains.join(" / ") : "Algemeen";
}

function buildOwnerLabel(automations: Automatisering[]): string {
  const owners = [
    ...new Set(
      automations
        .map((automation) => automation.owner?.trim())
        .filter((owner): owner is string => Boolean(owner)),
    ),
  ];

  if (owners.length === 0) return "Niet toegewezen";
  if (owners.length <= 2) return owners.join(" / ");
  return `${owners.slice(0, 2).join(" / ")} +${owners.length - 2}`;
}

function formatJourneyDate(value?: string | null): string {
  if (!value) return "Onbekend";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Onbekend";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function buildImpactLabel(automations: Automatisering[]): string {
  const text = automations
    .map((automation) => `${automation.naam} ${automation.doel} ${automation.trigger} ${automation.fasen.join(" ")}`)
    .join(" ")
    .toUpperCase();
  const domains = ["BTW", "JR", "IB", "VPB", "VA", "Sales"].filter((domain) =>
    text.includes(domain.toUpperCase()),
  );

  if (domains.length >= 2) return `${domains.join(" / ")} geraakt`;
  if (domains.length === 1) return `${domains[0]} proces geraakt`;
  return "Vervolgproces mogelijk";
}
