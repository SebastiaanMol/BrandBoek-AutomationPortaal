import { Fragment, memo, useCallback, useState, useEffect, useMemo, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  useAllConfirmedAutomationLinks,
  useAutomatiseringen,
  useAutomatiseringenIncludingLegacyGitlab,
  useFlows,
  usePortalSettings,
  useSetCleanupDeleteCandidate,
} from "@/lib/hooks";
import { CATEGORIEEN, SYSTEMEN, STATUSSEN, Systeem, Automatisering, type AutomationSourceFinding } from "@/lib/types";
import { StatusBadge, SystemBadge, SourceBadge } from "@/components/Badges";
import { AutomationFunnel } from "@/components/AutomationFunnel";
import { AutomationProcessJourneyMembership } from "@/components/AutomationProcessJourneyMembership";
import { getBackendAutomationTrace } from "@/lib/backendAutomationTrace";
import { getAutomationDetailPresentation } from "@/lib/automationDetailPresentation";
import type { AutomationOverviewPresentation } from "@/lib/automationOverviewPresentation";
import {
  getAutomationCatalogPreviewPresentation,
  getAutomationCatalogRowPresentation,
  type AutomationCatalogRowPresentation,
} from "@/lib/automationCatalogPresentation";
import { sortAutomationsForList, type AutomationListSortOrder } from "@/lib/automationListSort";
import { HubSpotWorkflowCanvas } from "@/components/HubSpotWorkflowCanvas";
import { TypeformProcessCard } from "@/components/flows/TypeformProcessCard";
import { ZapierProcessCard } from "@/components/flows/ZapierProcessCard";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, ChevronDown, Search as SearchIcon, Loader2, Pencil, Zap, Sparkles, Archive, RotateCcw, Clock, SlidersHorizontal, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

type SourceFilter = "alle" | "hubspot" | "gitlab" | "zapier" | "typeform";

const CATALOG_WINDOW_THRESHOLD = 80;
const CATALOG_OVERSCAN_ROWS = 10;
const CATALOG_DESKTOP_ROW_ESTIMATE = 76;
const CATALOG_MOBILE_ROW_ESTIMATE = 140;
const CATALOG_PREVIEW_ESTIMATE = 220;

interface AlleAutomatiseringenProps {
  sourceFilter?: SourceFilter;
  sourceTabs?: Array<{ value: SourceFilter; label: string; count: number }>;
  onSourceFilterChange?: (value: SourceFilter) => void;
}

export default function AlleAutomatiseringen({
  sourceFilter = "alle",
  sourceTabs = [],
  onSourceFilterChange,
}: AlleAutomatiseringenProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data, isLoading } = useAutomatiseringen();
  const { data: portalSettings } = usePortalSettings();
  const [sortOrder, setSortOrder] = useState<AutomationListSortOrder>("created_at");
  const [settingsApplied, setSettingsApplied] = useState(false);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<string>("alle");
  const [sysFilter, setSysFilter] = useState<string>("alle");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [koppelingFilter, setKoppelingFilter] = useState<string>("alle");
  const [sourceFindingFilter, setSourceFindingFilter] = useState<string>("alle");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedAutomationId, setExpandedAutomationId] = useState<string | null>(null);
  const rowGroupRef = useRef<HTMLDivElement | null>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 60 });

  // Backwards compatibility for older links that opened the detail dialog.
  const pendingOpen = searchParams.get("open");
  useEffect(() => {
    if (!pendingOpen) return;
    navigate(`/automations/${encodeURIComponent(pendingOpen)}`, { replace: true });
  }, [navigate, pendingOpen]);

  useEffect(() => {
    if (portalSettings && !settingsApplied) {
      setStatusFilter(portalSettings.standaardStatusFilter);
      setSortOrder(portalSettings.standaardSortering);
      setSettingsApplied(true);
    }
  }, [portalSettings, settingsApplied]);

  const all = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => all.filter((a) => {
    const q = query.toLowerCase();
    const matchesQuery =
      !q ||
      Object.values(a).some((v) =>
        typeof v === "string"
          ? v.toLowerCase().includes(q)
          : Array.isArray(v)
            ? v.some((x) => String(x).toLowerCase().includes(q))
            : false
      );
    const matchesCat = catFilter === "alle" || a.categorie === catFilter;
    const matchesSys = sysFilter === "alle" || a.systemen.includes(sysFilter as Systeem);
    const matchesStatus = statusFilter === "alle" || a.status === statusFilter;
    const matchesKoppeling =
      koppelingFilter === "alle" ||
      (koppelingFilter === "verbonden" && a.koppelingen.length > 0) ||
      (koppelingFilter === "niet-verbonden" && a.koppelingen.length === 0);
    const hasSourceFinding = getActiveSourceWarningFinding(a) != null;
    const matchesSourceFinding =
      sourceFindingFilter === "alle" ||
      (sourceFindingFilter === "met-waarschuwing" && hasSourceFinding) ||
      (sourceFindingFilter === "zonder-waarschuwing" && !hasSourceFinding);
    const matchesSource =
      sourceFilter === "alle" ||
      (sourceFilter === "hubspot" && isHubSpotAutomation(a)) ||
      (sourceFilter === "gitlab" && isGitLabAutomation(a)) ||
      (sourceFilter === "zapier" && isZapierAutomation(a)) ||
      (sourceFilter === "typeform" && isTypeformAutomation(a));
    return matchesQuery && matchesCat && matchesSys && matchesStatus && matchesKoppeling && matchesSourceFinding && matchesSource;
  }), [
    all,
    catFilter,
    koppelingFilter,
    query,
    sourceFilter,
    sourceFindingFilter,
    statusFilter,
    sysFilter,
  ]);

  const sorted = useMemo(
    () => sortAutomationsForList(filtered, sortOrder),
    [filtered, sortOrder],
  );
  const shouldWindowRows = sorted.length > CATALOG_WINDOW_THRESHOLD;
  const visibleStart = shouldWindowRows
    ? Math.min(visibleRange.start, Math.max(sorted.length - 1, 0))
    : 0;
  const visibleEnd = shouldWindowRows
    ? Math.min(sorted.length, Math.max(visibleRange.end, visibleStart + 1))
    : sorted.length;
  const visibleAutomations = useMemo(
    () => sorted.slice(visibleStart, visibleEnd),
    [sorted, visibleEnd, visibleStart],
  );

  const catalogRows = useMemo(
    () => new Map(sorted.map((a) => [a.id, getAutomationCatalogRowPresentation(a)])),
    [sorted],
  );
  const expandedAutomation = useMemo(
    () => sorted.find((automation) => automation.id === expandedAutomationId) ?? null,
    [expandedAutomationId, sorted],
  );
  const expandedPresentation = useMemo(
    () => expandedAutomation ? getAutomationCatalogPreviewPresentation(expandedAutomation) : null,
    [expandedAutomation],
  );
  const handleToggleAutomation = useCallback((automationId: string) => {
    setExpandedAutomationId((current) => current === automationId ? null : automationId);
  }, []);
  const expandedIndex = useMemo(
    () => sorted.findIndex((automation) => automation.id === expandedAutomationId),
    [expandedAutomationId, sorted],
  );
  const rowHeightEstimate = getCatalogRowHeightEstimate();
  const topSpacerHeight = shouldWindowRows
    ? visibleStart * rowHeightEstimate + (expandedIndex >= 0 && expandedIndex < visibleStart ? CATALOG_PREVIEW_ESTIMATE : 0)
    : 0;
  const bottomSpacerHeight = shouldWindowRows
    ? (sorted.length - visibleEnd) * rowHeightEstimate + (expandedIndex >= visibleEnd ? CATALOG_PREVIEW_ESTIMATE : 0)
    : 0;

  useEffect(() => {
    if (!shouldWindowRows) {
      setVisibleRange((current) => current.start === 0 && current.end === sorted.length
        ? current
        : { start: 0, end: sorted.length });
      return;
    }

    let frame: number | null = null;
    const requestFrame = window.requestAnimationFrame ?? ((callback: FrameRequestCallback) => window.setTimeout(callback, 16));
    const cancelFrame = window.cancelAnimationFrame ?? window.clearTimeout;

    const updateVisibleRange = () => {
      const rowGroup = rowGroupRef.current;
      if (!rowGroup) return;

      const rowHeight = getCatalogRowHeightEstimate();
      const listTop = rowGroup.getBoundingClientRect().top + window.scrollY;
      const viewportTop = window.scrollY - listTop;
      const viewportBottom = viewportTop + window.innerHeight;
      const nextStart = clampNumber(
        Math.floor(viewportTop / rowHeight) - CATALOG_OVERSCAN_ROWS,
        0,
        sorted.length,
      );
      const nextEnd = clampNumber(
        Math.ceil(viewportBottom / rowHeight) + CATALOG_OVERSCAN_ROWS,
        Math.min(nextStart + 1, sorted.length),
        sorted.length,
      );

      setVisibleRange((current) => current.start === nextStart && current.end === nextEnd
        ? current
        : { start: nextStart, end: nextEnd });
    };

    const scheduleUpdate = () => {
      if (frame != null) return;
      frame = requestFrame(() => {
        frame = null;
        updateVisibleRange();
      });
    };

    updateVisibleRange();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frame != null) cancelFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [shouldWindowRows, sorted.length]);

  const defaultSortOrder = portalSettings?.standaardSortering ?? "created_at";
  const activeFilterChips = [
    query.trim() ? `Zoek: ${query.trim()}` : null,
    catFilter !== "alle" ? `Categorie: ${catFilter}` : null,
    sysFilter !== "alle" ? `Systeem: ${sysFilter}` : null,
    statusFilter !== "alle" ? `Status: ${statusFilter}` : null,
    koppelingFilter !== "alle" ? `Koppeling: ${formatFilterValue(koppelingFilter)}` : null,
    sourceFindingFilter !== "alle" ? `Bronwaarschuwing: ${formatFilterValue(sourceFindingFilter)}` : null,
    sortOrder !== defaultSortOrder ? `Sortering: ${formatSortOrder(sortOrder)}` : null,
  ].filter(Boolean) as string[];

  const hasActiveFilters = Boolean(
    query.trim() ||
    catFilter !== "alle" ||
    sysFilter !== "alle" ||
    statusFilter !== "alle" ||
    koppelingFilter !== "alle" ||
    sourceFindingFilter !== "alle" ||
    sortOrder !== defaultSortOrder,
  );
  const activeHiddenFilterCount = [
    catFilter !== "alle",
    sysFilter !== "alle",
    statusFilter !== "alle",
    koppelingFilter !== "alle",
    sourceFindingFilter !== "alle",
    sortOrder !== defaultSortOrder,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setQuery("");
    setCatFilter("alle");
    setSysFilter("alle");
    setStatusFilter("alle");
    setKoppelingFilter("alle");
    setSourceFindingFilter("alle");
    setSortOrder(defaultSortOrder);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="sr-only">Automations overzicht</h1>
      <section
        role="region"
        aria-label="Automations catalogus"
        className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      >
        <div className="flex flex-col gap-3 bg-card px-4 py-4 sm:px-5">
          {sourceTabs.length > 0 && (
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-none bg-transparent p-0">
              {sourceTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  onClick={() => onSourceFilterChange?.(tab.value)}
                  className="min-h-9 gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-foreground/80 shadow-none data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  {tab.label}
                  <span className="text-xs leading-none text-muted-foreground">
                    {new Intl.NumberFormat("nl-NL").format(tab.count)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          )}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative min-w-0">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek op naam, bron, trigger of beschrijving..."
                className="min-h-11 pl-9"
              />
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeHiddenFilterCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">
                  {activeHiddenFilterCount}
                </span>
              )}
            </button>
          </div>
          {filtersOpen && (
            <div className="grid w-full gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:grid-cols-2 xl:basis-full xl:grid-cols-6">
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="min-h-11 w-full"><SelectValue placeholder="Categorie" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle categorieen</SelectItem>
              {CATEGORIEEN.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sysFilter} onValueChange={setSysFilter}>
            <SelectTrigger className="min-h-11 w-full"><SelectValue placeholder="Systeem" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle systemen</SelectItem>
              {SYSTEMEN.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="min-h-11 w-full"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle statussen</SelectItem>
              {STATUSSEN.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={koppelingFilter} onValueChange={setKoppelingFilter}>
            <SelectTrigger className="min-h-11 w-full"><SelectValue placeholder="Koppelingen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle koppelingen</SelectItem>
              <SelectItem value="verbonden">Verbonden</SelectItem>
              <SelectItem value="niet-verbonden">Niet verbonden</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFindingFilter} onValueChange={setSourceFindingFilter}>
            <SelectTrigger className="min-h-11 w-full"><SelectValue placeholder="Bronwaarschuwingen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle bronwaarschuwingen</SelectItem>
              <SelectItem value="met-waarschuwing">Met bronwaarschuwing</SelectItem>
              <SelectItem value="zonder-waarschuwing">Zonder bronwaarschuwing</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as typeof sortOrder)}>
            <SelectTrigger className="min-h-11 w-full"><SelectValue placeholder="Sortering" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at">Aanmaakdatum</SelectItem>
              <SelectItem value="naam">Naam (A–Z)</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
            </div>
          )}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterChips.map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground"
                >
                  {chip}
                </span>
              ))}
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-8 items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Filters wissen
              </button>
            </div>
          )}
        </div>

      <div role="table" aria-label="Automations overzicht" className="overflow-hidden border-t border-border">
        {sorted.length > 0 && (
          <div role="rowgroup" className="hidden border-b border-border bg-muted/40 md:block">
            <div role="row" className="grid grid-cols-[minmax(280px,1.6fr)_130px_130px_160px_112px] gap-4 px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <span role="columnheader">Naam</span>
              <span role="columnheader">Source</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Gesynchroniseerd</span>
              <span role="columnheader" className="text-right">Acties</span>
            </div>
          </div>
        )}

        <div ref={rowGroupRef} role="rowgroup" className="divide-y divide-border">
          {topSpacerHeight > 0 && (
            <div
              aria-hidden="true"
              role="presentation"
              style={{ height: topSpacerHeight }}
            />
          )}
          {visibleAutomations.map((a) => {
            const isExpanded = expandedAutomationId === a.id;
            const catalog = catalogRows.get(a.id)!;
            return (
              <AutomationCatalogRow
                key={a.id}
                automation={a}
                catalog={catalog}
                isExpanded={isExpanded}
                presentation={isExpanded ? expandedPresentation : null}
                onToggle={handleToggleAutomation}
              />
            );
          })}
          {bottomSpacerHeight > 0 && (
            <div
              aria-hidden="true"
              role="presentation"
              style={{ height: bottomSpacerHeight }}
            />
          )}
        </div>
      </div>
        {sorted.length === 0 && (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            Geen automations gevonden met deze zoekopdracht of filters.
          </p>
        )}
      </section>
    </div>
  );
}

const AutomationCatalogRow = memo(function AutomationCatalogRow({
  automation,
  catalog,
  isExpanded,
  presentation,
  onToggle,
}: {
  automation: Automatisering;
  catalog: AutomationCatalogRowPresentation;
  isExpanded: boolean;
  presentation: AutomationOverviewPresentation | null;
  onToggle: (automationId: string) => void;
}) {
  const sourceFinding = getActiveSourceWarningFinding(automation);
  const sourceFindingIsCritical = sourceFinding?.severity === "critical" || sourceFinding?.type === "source_missing";
  const sourceFindingRowClass = sourceFinding
    ? sourceFindingIsCritical
      ? "bg-red-50/60 ring-1 ring-inset ring-red-200"
      : "bg-amber-50/60 ring-1 ring-inset ring-amber-200"
    : "";
  const toggleExpanded = () => onToggle(automation.id);

  return (
    <Fragment>
      <div
        role="row"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={toggleExpanded}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleExpanded();
          }
        }}
        className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(280px,1.6fr)_130px_130px_160px_112px] md:items-center md:gap-4 md:px-5 ${sourceFindingRowClass} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`}
      >
        <div role="cell" className="col-span-2 min-w-0 md:col-span-1">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-semibold text-foreground" title={catalog.displayName}>
              {catalog.displayName}
            </span>
            {sourceFinding && (
              <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                sourceFindingIsCritical
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}>
                <AlertTriangle className="h-3 w-3" />
                Bronwaarschuwing
              </span>
            )}
            <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {catalog.shortDescription}
            </span>
          </div>
        </div>
        <div role="cell" className="flex items-center justify-start gap-3">
          <div className="flex flex-col items-end gap-1 md:items-start">
            <SourceBadge source={automation.source} />
            {sourceFinding && (
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                sourceFindingIsCritical ? "text-red-700" : "text-amber-700"
              }`}>
                <AlertTriangle className="h-3 w-3" />
                {formatSourceFindingMessage(sourceFinding)}
              </span>
            )}
          </div>
        </div>
        <div role="cell" className="flex items-center justify-end gap-3 md:justify-start">
          <StatusBadge status={automation.status} />
        </div>
        <div role="cell" className="col-span-2 flex items-center justify-end md:col-span-1 md:block">
          <div className="text-right md:text-left">
            <p className="text-sm font-semibold text-foreground">{catalog.lastSeenDetail}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{catalog.lastSeenLabel}</p>
          </div>
        </div>
        <div role="cell" className="col-span-2 flex items-center justify-stretch gap-2 md:col-span-1 md:justify-end">
          <button
            type="button"
            aria-label={`${isExpanded ? "Verberg" : "Toon"} proceslijn voor ${automation.naam}`}
            aria-expanded={isExpanded}
            onClick={(event) => {
              event.stopPropagation();
              toggleExpanded();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
          </button>
          <Link
            to={`/automations/${encodeURIComponent(automation.id)}`}
            aria-label={`Open ${automation.naam}`}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:w-auto"
          >
            Open
          </Link>
        </div>
      </div>
      {isExpanded && presentation && (
        <AutomationOverviewExpansion automation={automation} presentation={presentation} />
      )}
    </Fragment>
  );
});

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-uppercase mb-0.5">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

function formatHubSpotUsage(a: Automatisering): string | null {
  if (a.source !== "hubspot") return null;

  if (a.hubspotLastRunAt) {
    const lastRun = new Date(a.hubspotLastRunAt);
    const dateLabel = Number.isNaN(lastRun.getTime())
      ? null
      : format(lastRun, "d MMM yyyy", { locale: nl });
    const countLabel = typeof a.hubspotRunCount365d === "number"
      ? `${new Intl.NumberFormat("nl-NL").format(a.hubspotRunCount365d)} runs in 365 dagen`
      : null;

    return [dateLabel ? `Laatst gedraaid: ${dateLabel}` : null, countLabel]
      .filter(Boolean)
      .join(" · ");
  }

  if (a.hubspotRunCount365d === 0) return "Geen runs gevonden in de afgelopen 365 dagen";
  return "Run-data niet beschikbaar via de HubSpot API";
}

export function AutomatiseringDetailPanel({
  a,
  cleanupMarker,
  variant = "inline",
}: {
  a: Automatisering;
  cleanupMarker: ReturnType<typeof useSetCleanupDeleteCandidate>;
  variant?: "inline" | "dialog" | "page";
}) {
  const navigate = useNavigate();
  const { data: flows = [] } = useFlows();
  const { data: journeyAutomations = [] } = useAutomatiseringenIncludingLegacyGitlab();
  const { data: confirmedLinks = [] } = useAllConfirmedAutomationLinks();
  const hubSpotUsage = formatHubSpotUsage(a);
  const backendTrace = getBackendAutomationTrace(a);
  const presentation = getAutomationDetailPresentation(a, backendTrace);
  const hasSourceDetails = ["hubspot", "gitlab", "zapier", "typeform"].includes(a.source ?? "")
    || Boolean(a.gitlabFilePath || a.gitlabEndpoint);

  async function handleCleanupMarker(marked: boolean): Promise<void> {
    try {
      await cleanupMarker.mutateAsync({ id: a.id, marked });
      if (marked) {
        toast.success(`${a.id} staat op de verwijderlijst`, {
          duration: 5000,
          action: {
            label: "Ongedaan maken",
            onClick: () => {
              void cleanupMarker.mutateAsync({ id: a.id, marked: false });
            },
          },
        });
      } else {
        toast.success(`${a.id} is van de verwijderlijst gehaald`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Kon verwijderlijst niet bijwerken");
    }
  }

  return (
    <div className={`${variant === "inline" ? "border-t border-border px-5 pb-5 pt-3" : "px-5 pb-5 pt-4"} space-y-5`}>
      <section aria-label="Standaard automation uitleg" className="space-y-5">
        <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3">
          <p className="label-uppercase mb-2">Wat doet deze automatisering?</p>
          <div className="space-y-1.5">
            {presentation.summaryLines.map((line, i) => (
              <p key={i} className="text-sm text-foreground leading-relaxed">{line}</p>
            ))}
          </div>
        </div>

        <div>
          <p className="label-uppercase mb-2">Processtappen</p>
          <div className="grid gap-2">
            {presentation.processSteps.map((s, i) => (
              <div key={`${s}-${i}`} className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-3">
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <p className="text-sm text-foreground leading-relaxed pt-0.5">{s}</p>
              </div>
            ))}
          </div>
        </div>

        {presentation.triggerText && (
          <div className="flex items-start gap-2">
            <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="label-uppercase mb-0.5">Wordt gestart door</p>
              <p className="text-sm text-foreground">{presentation.triggerText}</p>
            </div>
          </div>
        )}

        <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-2">
          {a.fasen && a.fasen.length > 0 && (
            <div>
              <p className="label-uppercase mb-1.5">Bedrijfsfasen</p>
              <div className="flex gap-1.5 flex-wrap">
                {a.fasen.map((f) => (
                  <span key={f} className="px-2 py-0.5 rounded-full text-[11px] bg-secondary text-foreground border border-border">{f}</span>
                ))}
              </div>
            </div>
          )}
          {a.owner && <Detail label="Owner" value={a.owner} />}
          {a.afhankelijkheden && <Detail label="Dependencies" value={a.afhankelijkheden} />}
          {hubSpotUsage && (
            <div>
              <p className="label-uppercase mb-0.5">HubSpot gebruik</p>
              <p className="inline-flex items-center gap-1.5 text-sm text-foreground">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {hubSpotUsage}
              </p>
            </div>
          )}
        </div>

        <div>
          <p className="label-uppercase mb-1">Systemen</p>
          <div className="flex gap-1.5 flex-wrap">
            {a.systemen.map((s) => <SystemBadge key={s} systeem={s} />)}
          </div>
        </div>

        {a.verbeterideeën && <Detail label="Improvement Ideas" value={a.verbeterideeën} />}

        {a.mermaidDiagram && (
          <div>
            <p className="label-uppercase mb-2">Flow Diagram</p>
            <MermaidDiagram chart={a.mermaidDiagram} />
          </div>
        )}

        <AutomationProcessJourneyMembership
          automation={a}
          automations={journeyAutomations}
          flows={flows}
          confirmedLinks={confirmedLinks}
        />
      </section>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap justify-end gap-3">
        <button
          onClick={() => void handleCleanupMarker(!a.cleanupDeleteCandidate)}
          disabled={cleanupMarker.isPending}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
        >
          {a.cleanupDeleteCandidate ? (
            <>
              <RotateCcw className="h-3.5 w-3.5" /> Van verwijderlijst halen
            </>
          ) : (
            <>
              <Archive className="h-3.5 w-3.5" /> Op verwijderlijst zetten
            </>
          )}
        </button>
        {variant !== "page" && (
          <>
            <button
              onClick={() => navigate(`/brandy?context=${a.id}&naam=${encodeURIComponent(a.naam)}`)}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" /> Vraag Brandy
            </button>
            <button
              onClick={() => navigate(`/bewerk/${a.id}`)}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" /> Bewerken
            </button>
          </>
        )}
        </div>
      </div>

      <section aria-label="Brondetails" className="space-y-4 border-t border-border pt-5">
        <div>
          <p className="label-uppercase">Brondetails</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Bron-specifieke weergave, logica en technisch bewijs staan hier apart van de gewone gebruikersuitleg.
          </p>
        </div>
        {a.source === "hubspot" && <HubSpotWorkflowCanvas automation={a} />}
        <AutomationFunnel automation={a} />
        <ZapierProcessCard automation={a} />
        <TypeformProcessCard automation={a} />
        {!hasSourceDetails && (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            Er zijn voor deze automation nog geen aanvullende brondetails beschikbaar.
          </div>
        )}
      </section>
    </div>
  );
}

function formatFilterValue(value: string): string {
  if (value === "verbonden") return "Verbonden";
  if (value === "niet-verbonden") return "Niet verbonden";
  if (value === "met-waarschuwing") return "Met waarschuwing";
  if (value === "zonder-waarschuwing") return "Zonder waarschuwing";
  return value;
}

function formatSortOrder(value: AutomationListSortOrder): string {
  if (value === "naam") return "Naam";
  if (value === "status") return "Status";
  return "Aanmaakdatum";
}

function getCatalogRowHeightEstimate(): number {
  if (typeof window !== "undefined" && window.innerWidth < 768) {
    return CATALOG_MOBILE_ROW_ESTIMATE;
  }

  return CATALOG_DESKTOP_ROW_ESTIMATE;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isHubSpotAutomation(a: Automatisering): boolean {
  return a.source === "hubspot";
}

function isGitLabAutomation(a: Automatisering): boolean {
  return a.source === "gitlab" || Boolean(a.gitlabFilePath);
}

function AutomationOverviewExpansion({
  automation,
  presentation,
}: {
  automation: Automatisering;
  presentation: AutomationOverviewPresentation;
}) {
  return (
    <div className="border-t border-border bg-muted/20 px-4 py-4 md:px-5">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-stretch">
          <ProcessLineCard label="Trigger" value={presentation.triggerLabel} />
          <div className="hidden items-center justify-center text-muted-foreground lg:flex">
            <ArrowRight className="h-4 w-4" />
          </div>
          <ProcessLineCard label="Acties" value={presentation.actionSummary} />
          <div className="hidden items-center justify-center text-muted-foreground lg:flex">
            <ArrowRight className="h-4 w-4" />
          </div>
          <ProcessLineCard label="Outcome" value={presentation.outcomeLabel} />
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {presentation.evidenceBadges.map((badge) => (
              <span
                key={`${badge.label}-${badge.detail ?? ""}`}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  badge.tone === "good"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : badge.tone === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-border bg-background text-muted-foreground"
                }`}
              >
                <span>{badge.label}</span>
                {badge.detail && <span className="truncate font-normal opacity-80">{badge.detail}</span>}
              </span>
            ))}
            {presentation.warning && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                {presentation.warning}
              </span>
            )}
          </div>
          <Link
            to={`/automations/${encodeURIComponent(automation.id)}`}
            aria-label={`Open volledige details van ${automation.naam}`}
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Volledige details
          </Link>
        </div>
      </div>
    </div>
  );
}

function ProcessLineCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-foreground">
        {value}
      </p>
    </div>
  );
}

function isZapierAutomation(a: Automatisering): boolean {
  return a.source === "zapier";
}

function isTypeformAutomation(a: Automatisering): boolean {
  return a.source === "typeform";
}

function getActiveSourceWarningFinding(a: Automatisering) {
  return a.sourceFindings?.find((finding) =>
    !finding.resolvedAt && (finding.type === "source_missing" || finding.type === "source_data_incomplete")
  );
}

function formatSourceName(source: string | undefined | null): string {
  if (source === "hubspot") return "HubSpot";
  if (source === "gitlab") return "GitLab";
  if (source === "zapier") return "Zapier";
  if (source === "typeform") return "Typeform";
  return "de bron";
}

function formatSourceFindingMessage(finding: AutomationSourceFinding): string {
  if (finding.type === "source_missing") {
    return `Niet gevonden bij ${formatSourceName(finding.source)}`;
  }
  return finding.message || "Brondata incompleet";
}
