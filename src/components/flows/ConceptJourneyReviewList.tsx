import { useMemo, useState } from "react";
import { ArrowRight, Search, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Automatisering } from "@/lib/types";
import type { ConceptJourney } from "@/lib/conceptJourneys";

interface ConceptJourneyReviewListProps {
  journeys: ConceptJourney[];
  automationMap: Map<string, Automatisering>;
  onOpenJourney: (journey: ConceptJourney) => void;
}

type SourceFilter = "all" | "hubspot" | "zapier" | "typeform";
type EvidenceFilter = "all" | "with-endpoint" | "multi-transition";
type JourneyChainNode = { id: string; name: string; source: string | null; role: string };

export function ConceptJourneyReviewList({
  journeys,
  automationMap,
  onOpenJourney,
}: ConceptJourneyReviewListProps) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>("all");

  const filteredJourneys = useMemo(
    () =>
      journeys.filter((journey) => {
        const chain = buildJourneyChain(journey, automationMap);
        const source = chain[0]?.source ?? normalizedSource(journey.sourceSystem);
        const haystack = [
          journey.title,
          journey.description,
          journey.startSignal,
          journey.hubspotAutomation,
          journey.gitlabWorker,
          journey.endpoint,
          journey.structureSummary,
          chain.map((node) => `${node.name} ${node.source}`).join(" "),
        ].join(" ").toLowerCase();
        const matchesQuery = query.trim().length === 0 || haystack.includes(query.trim().toLowerCase());
        const matchesSource = sourceFilter === "all" || source === sourceFilter;
        const matchesEvidence =
          evidenceFilter === "all" ||
          (evidenceFilter === "with-endpoint" && Boolean(journey.endpoint)) ||
          (evidenceFilter === "multi-transition" && journey.transitionCount > 1);

        return matchesQuery && matchesSource && matchesEvidence;
      }),
    [automationMap, evidenceFilter, journeys, query, sourceFilter],
  );

  const totals = useMemo(() => {
    const automationIds = new Set<string>();
    let transitionCount = 0;

    for (const journey of filteredJourneys) {
      for (const id of journey.automationIds) automationIds.add(id);
      transitionCount += journey.transitionCount;
    }

    return {
      automations: automationIds.size,
      transitions: transitionCount,
    };
  }, [filteredJourneys]);

  return (
    <section className="space-y-4" aria-label="Conceptprocesreizen reviewlijst">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-base font-semibold text-foreground">
              {filteredJourneys.length} conceptreizen klaar voor review
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {totals.automations} unieke automations · {totals.transitions} webhook-overgangen in beeld
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_150px_190px] lg:w-[680px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <label htmlFor="concept-journey-search" className="sr-only">
                Zoek conceptreizen
              </label>
              <Input
                id="concept-journey-search"
                aria-label="Zoek conceptreizen"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Zoek conceptreis..."
                className="pl-9"
              />
            </div>

            <label className="sr-only" htmlFor="concept-source-filter">
              Filter op bron
            </label>
            <select
              id="concept-source-filter"
              aria-label="Filter op bron"
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="all">Alle bronnen</option>
              <option value="hubspot">HubSpot</option>
              <option value="zapier">Zapier</option>
              <option value="typeform">Typeform</option>
            </select>

            <label className="sr-only" htmlFor="concept-evidence-filter">
              Filter op bewijs
            </label>
            <select
              id="concept-evidence-filter"
              aria-label="Filter op bewijs"
              value={evidenceFilter}
              onChange={(event) => setEvidenceFilter(event.target.value as EvidenceFilter)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="all">Alle matches</option>
              <option value="with-endpoint">Met endpoint</option>
              <option value="multi-transition">Meer dan 1 overgang</option>
            </select>
          </div>
        </div>
      </div>

      {filteredJourneys.length > 0 ? (
        <div className="grid gap-4">
          {filteredJourneys.map((journey) => (
            <ConceptJourneyCard
              key={journey.id}
              journey={journey}
              automationMap={automationMap}
              onOpen={() => onOpenJourney(journey)}
            />
          ))}
        </div>
      ) : (
        <div className="card-elevated p-10 text-center">
          <p className="text-sm font-medium text-foreground">Geen conceptprocesreizen gevonden</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pas je zoekterm of filters aan om andere webhook-matches te zien.
          </p>
        </div>
      )}
    </section>
  );
}

function ConceptJourneyCard({
  journey,
  automationMap,
  onOpen,
}: {
  journey: ConceptJourney;
  automationMap: Map<string, Automatisering>;
  onOpen: () => void;
}) {
  const chain = buildJourneyChain(journey, automationMap);

  return (
    <article
      aria-label={`Conceptprocesreis ${journey.title}`}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/30"
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                  {journey.evidenceLabel}
                </Badge>
                <Badge variant="outline">{journey.automationCount} automations</Badge>
                <Badge variant="outline">{formatTransitionCount(journey.transitionCount)}</Badge>
              </div>
              <h3 className="text-lg font-semibold leading-snug text-foreground">
                {journey.title}
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {journey.description}
              </p>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto pb-1">
            <WebhookGraphPreview journey={journey} chain={chain} />
          </div>
        </div>

        <aside className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-green-700" />
            Bewijs voor review
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Endpoint
              </dt>
              <dd className="mt-1">
                {journey.endpoint ? (
                  <code className="block rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground">
                    {journey.endpoint}
                  </code>
                ) : (
                  <span className="text-muted-foreground">Endpoint niet opgeslagen</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Omvang
              </dt>
              <dd className="mt-1 text-foreground">
                {journey.automationCount} automations, {formatTransitionCount(journey.transitionCount)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </dt>
              <dd className="mt-1">
                <Badge variant="outline">Te beoordelen</Badge>
              </dd>
            </div>
          </dl>
          <Button className="mt-5 w-full justify-between" onClick={onOpen}>
            Bekijk procesreis
            <ArrowRight className="h-4 w-4" />
          </Button>
        </aside>
      </div>
    </article>
  );
}

function WebhookGraphPreview({
  journey,
  chain,
}: {
  journey: ConceptJourney;
  chain: JourneyChainNode[];
}) {
  const chainById = new Map(chain.map((node, index) => [node.id, { ...node, step: index + 1 }]));
  const parallelStart = buildParallelStartPreview(journey, chainById);
  const fanOut = buildFanOutPreview(journey, chainById);

  if (parallelStart) {
    return <ParallelStartPreview {...parallelStart} />;
  }

  if (fanOut) {
    return <FanOutPreview {...fanOut} />;
  }

  const transitionRows = journey.transitions
    .map((transition) => ({
      from: chainById.get(transition.fromId),
      to: chainById.get(transition.toId),
    }))
    .filter((row): row is {
      from: { id: string; name: string; source: string | null; role: string; step: number };
      to: { id: string; name: string; source: string | null; role: string; step: number };
    } => Boolean(row.from && row.to));

  if (transitionRows.length > 0) {
    return (
      <div className="grid min-w-max gap-2">
        {transitionRows.map(({ from, to }) => (
          <div key={`${journey.id}-${from.id}-${to.id}`} className="flex items-center gap-2">
            <AutomationNodeCard node={from} step={from.step} compact />
            <WebhookArrow />
            <AutomationNodeCard node={to} step={to.step} compact />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-w-max items-stretch gap-2">
      {chain.map((node, index) => (
        <div key={`${journey.id}-${node.id}`} className="flex items-center gap-2">
          <AutomationNodeCard node={node} step={index + 1} />
          {index < chain.length - 1 && <WebhookArrow />}
        </div>
      ))}
    </div>
  );
}

function buildParallelStartPreview(
  journey: ConceptJourney,
  chainById: Map<string, JourneyChainNode & { step: number }>,
): { sources: Array<JourneyChainNode & { step: number }>; target: JourneyChainNode & { step: number } } | null {
  if (!journey.parallelStartNodeIds || journey.parallelStartNodeIds.length < 2) return null;

  const sourceIds = new Set(journey.parallelStartNodeIds);
  const byTarget = new Map<string, Array<JourneyChainNode & { step: number }>>();

  for (const transition of journey.transitions) {
    if (!sourceIds.has(transition.fromId)) continue;
    const source = chainById.get(transition.fromId);
    const target = chainById.get(transition.toId);
    if (!source || !target) continue;
    const sources = byTarget.get(target.id) ?? [];
    sources.push(source);
    byTarget.set(target.id, sources);
  }

  for (const [targetId, sources] of byTarget.entries()) {
    if (sources.length < 2) continue;
    const target = chainById.get(targetId);
    if (!target) continue;
    return {
      sources,
      target,
    };
  }

  return null;
}

function buildFanOutPreview(
  journey: ConceptJourney,
  chainById: Map<string, JourneyChainNode & { step: number }>,
): { source: JourneyChainNode & { step: number }; targets: Array<JourneyChainNode & { step: number }> } | null {
  const bySource = new Map<string, Array<JourneyChainNode & { step: number }>>();

  for (const transition of journey.transitions) {
    const source = chainById.get(transition.fromId);
    const target = chainById.get(transition.toId);
    if (!source || !target) continue;
    const targets = bySource.get(source.id) ?? [];
    targets.push(target);
    bySource.set(source.id, targets);
  }

  for (const [sourceId, targets] of bySource.entries()) {
    const uniqueTargets = [...new Map(targets.map((target) => [target.id, target])).values()];
    if (uniqueTargets.length < 2) continue;
    const source = chainById.get(sourceId);
    if (!source) continue;
    return {
      source,
      targets: uniqueTargets,
    };
  }

  return null;
}

function ParallelStartPreview({
  sources,
  target,
}: {
  sources: Array<JourneyChainNode & { step: number }>;
  target: JourneyChainNode & { step: number };
}) {
  return (
    <div className="flex min-w-max items-center gap-3">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Parallelle starters
        </p>
        <div className="grid gap-2">
          {sources.map((source) => (
            <AutomationNodeCard
              key={source.id}
              node={{ ...source, role: "Parallelle starter" }}
              step={1}
              compact
            />
          ))}
        </div>
      </div>

      <WebhookArrow label="zelfde endpoint" />

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Gezamenlijke backend
        </p>
        <AutomationNodeCard
          node={{ ...target, role: "Ontvangt alle parallelle webhooks" }}
          step={2}
          compact
        />
      </div>
    </div>
  );
}

function FanOutPreview({
  source,
  targets,
}: {
  source: JourneyChainNode & { step: number };
  targets: Array<JourneyChainNode & { step: number }>;
}) {
  return (
    <div className="flex min-w-max items-center gap-3">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Een startautomation
        </p>
        <AutomationNodeCard
          node={{ ...source, role: "Startautomation met meerdere webhooks" }}
          step={1}
          compact
        />
      </div>

      <WebhookArrow label={`${targets.length} endpoints`} />

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Meerdere bewezen vervolgen
        </p>
        <div className="grid gap-2">
          {targets.map((target) => (
            <AutomationNodeCard
              key={target.id}
              node={{ ...target, role: "Ontvangt een bewezen webhook" }}
              step={2}
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AutomationNodeCard({
  node,
  step,
  compact = false,
}: {
  node: { name: string; source: string | null; role: string };
  step: number;
  compact?: boolean;
}) {
  return (
    <div className={`${compact ? "w-64" : "w-56"} rounded-xl border p-3 ${sourceCardClass(node.source)}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${sourcePillClass(node.source)}`}>
          {sourceLabel(node.source)}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Stap {step}
        </span>
      </div>
      <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
        {cleanAutomationName(node.name)}
      </p>
      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
        {node.role}
      </p>
    </div>
  );
}

function WebhookArrow({ label = "webhook" }: { label?: string }) {
  return (
    <div className="flex min-w-16 flex-col items-center justify-center text-muted-foreground">
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
      <span className="mt-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

function buildJourneyChain(
  journey: ConceptJourney,
  automationMap: Map<string, Automatisering>,
): JourneyChainNode[] {
  const fallbackById = new Map(journey.nodes.map((node) => [node.id, node]));
  const chain = journey.automationIds
    .map((id, index) => {
      const automation = automationMap.get(id);
      const fallbackNode = fallbackById.get(id);
      if (!automation && !fallbackNode) return null;
      const source = automation?.source ?? fallbackNode?.source ?? null;

      return {
        id,
        name: automation?.naam ?? fallbackNode?.naam ?? id,
        source,
        role: index === 0 ? "Startautomation" : source === "gitlab" ? "Backend verwerking" : "Vervolgautomation",
      };
    })
    .filter((node): node is { id: string; name: string; source: string | null; role: string } => Boolean(node));

  if (chain.length > 0) return chain;

  return [
    {
      id: `${journey.id}-start`,
      name: journey.hubspotAutomation,
      source: normalizedSource(journey.sourceSystem),
      role: "Startautomation",
    },
    {
      id: `${journey.id}-backend`,
      name: journey.gitlabWorker,
      source: "gitlab",
      role: "Backend verwerking",
    },
  ];
}

function formatTransitionCount(count: number): string {
  return `${count} webhook-overgang${count === 1 ? "" : "en"}`;
}

function normalizedSource(sourceSystem: string): string | null {
  const lower = sourceSystem.toLowerCase();
  if (lower.includes("hubspot")) return "hubspot";
  if (lower.includes("zapier")) return "zapier";
  if (lower.includes("typeform")) return "typeform";
  if (lower.includes("gitlab")) return "gitlab";
  return null;
}

function sourceLabel(source: string | null): string {
  if (source === "hubspot") return "HubSpot";
  if (source === "zapier") return "Zapier";
  if (source === "typeform") return "Typeform";
  if (source === "gitlab") return "GitLab";
  return "Bron";
}

function sourceCardClass(source: string | null): string {
  if (source === "hubspot") return "border-orange-200 bg-orange-50/60";
  if (source === "zapier") return "border-amber-200 bg-amber-50/60";
  if (source === "typeform") return "border-pink-200 bg-pink-50/60";
  if (source === "gitlab") return "border-violet-200 bg-violet-50/60";
  return "border-border bg-background";
}

function sourcePillClass(source: string | null): string {
  if (source === "hubspot") return "bg-orange-100 text-orange-800";
  if (source === "zapier") return "bg-amber-100 text-amber-800";
  if (source === "typeform") return "bg-pink-100 text-pink-800";
  if (source === "gitlab") return "bg-violet-100 text-violet-800";
  return "bg-muted text-muted-foreground";
}

function cleanAutomationName(name: string): string {
  const withoutMethod = name.replace(/\s+\((GET|POST|PUT|PATCH|DELETE)\s+\/.*\)$/i, "");
  return withoutMethod || "Automation";
}
