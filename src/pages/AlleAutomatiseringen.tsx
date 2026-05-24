import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  useAllConfirmedAutomationLinks,
  useAutomatiseringen,
  useAutomatiseringenIncludingLegacyGitlab,
  useFlows,
  usePortalSettings,
  useSetCleanupDeleteCandidate,
} from "@/lib/hooks";
import { exportToCSV } from "@/lib/supabaseStorage";
import { CATEGORIEEN, SYSTEMEN, STATUSSEN, Systeem, Automatisering } from "@/lib/types";
import { StatusBadge, CategorieBadge, SystemBadge, SourceBadge } from "@/components/Badges";
import { AutomationFunnel } from "@/components/AutomationFunnel";
import { AutomationProcessJourneyMembership } from "@/components/AutomationProcessJourneyMembership";
import { getBackendAutomationTrace } from "@/lib/backendAutomationTrace";
import { getAutomationDetailPresentation } from "@/lib/automationDetailPresentation";
import { sortAutomationsForList, type AutomationListSortOrder } from "@/lib/automationListSort";
import { HubSpotWorkflowCanvas } from "@/components/HubSpotWorkflowCanvas";
import { TypeformProcessCard } from "@/components/flows/TypeformProcessCard";
import { ZapierProcessCard } from "@/components/flows/ZapierProcessCard";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Search as SearchIcon, Loader2, Pencil, Zap, Sparkles, Archive, RotateCcw, Clock, SlidersHorizontal, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

type SourceFilter = "alle" | "hubspot" | "gitlab" | "zapier" | "typeform";

interface AlleAutomatiseringenProps {
  sourceFilter?: SourceFilter;
}

export default function AlleAutomatiseringen({
  sourceFilter = "alle",
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

  const all = data || [];

  const filtered = all.filter((a) => {
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
    const hasSourceFinding = getActiveSourceMissingFinding(a) != null;
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
  });

  const sorted = sortAutomationsForList(filtered, sortOrder);

  const hasActiveFilters = Boolean(
    query.trim() ||
    catFilter !== "alle" ||
    sysFilter !== "alle" ||
    statusFilter !== "alle" ||
    koppelingFilter !== "alle" ||
    sourceFindingFilter !== "alle" ||
    sortOrder !== (portalSettings?.standaardSortering ?? "created_at"),
  );
  const activeHiddenFilterCount = [
    catFilter !== "alle",
    sysFilter !== "alle",
    statusFilter !== "alle",
    koppelingFilter !== "alle",
    sourceFindingFilter !== "alle",
    sortOrder !== (portalSettings?.standaardSortering ?? "created_at"),
  ].filter(Boolean).length;

  const clearFilters = () => {
    setQuery("");
    setCatFilter("alle");
    setSysFilter("alle");
    setStatusFilter("alle");
    setKoppelingFilter("alle");
    setSourceFindingFilter("alle");
    setSortOrder(portalSettings?.standaardSortering ?? "created_at");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const downloadCSV = () => {
    const csv = exportToCSV(sorted);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "automatiseringen.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-5">
      <h1 className="sr-only">Automations overzicht</h1>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 bg-muted/20 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek automations..." className="min-h-11 pl-9" />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeHiddenFilterCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">
                {activeHiddenFilterCount}
              </span>
            )}
          </button>
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
        </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{sorted.length}</span> van {all.length} automations
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Filters wissen
                </button>
              )}
              <button
                onClick={downloadCSV}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Download className="h-4 w-4" /> Download CSV
              </button>
            </div>
          </div>
        </div>

      <div role="table" aria-label="Automations overzicht" className="overflow-hidden border-t border-border">
        {sorted.length > 0 && (
          <div role="rowgroup" className="hidden border-b border-border bg-muted/30 md:block">
            <div role="row" className="grid grid-cols-[minmax(260px,1fr)_150px_140px_96px] gap-4 px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <span role="columnheader">Automation name</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Source</span>
              <span role="columnheader" className="text-right">Acties</span>
            </div>
          </div>
        )}

        <div role="rowgroup" className="divide-y divide-border">
          {sorted.map((a) => {
            const sourceMissingFinding = getActiveSourceMissingFinding(a);
            return (
              <div
                key={a.id}
                role="row"
                className={`grid gap-3 px-4 py-4 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(260px,1fr)_150px_140px_96px] md:items-center md:gap-4 md:px-5 ${
                  sourceMissingFinding ? "bg-red-50/60 ring-1 ring-inset ring-red-200" : ""
                }`}
              >
                <div role="cell" className="min-w-0">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium text-foreground" title={a.naam}>{a.naam}</span>
                    {sourceMissingFinding && (
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                        <AlertTriangle className="h-3 w-3" />
                        Bronwaarschuwing
                      </span>
                    )}
                    {a.doel && (
                      <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {a.doel}
                      </span>
                    )}
                  </div>
                </div>
                <div role="cell" className="flex items-center justify-between gap-3 md:justify-start">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground md:hidden">
                    Status
                  </span>
                  <StatusBadge status={a.status} />
                </div>
                <div role="cell" className="flex items-center justify-between gap-3 md:justify-start">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground md:hidden">
                    Source
                  </span>
                  <div className="flex flex-col items-end gap-1 md:items-start">
                    <SourceBadge source={a.source} />
                    {sourceMissingFinding && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                        <AlertTriangle className="h-3 w-3" />
                        Niet gevonden bij {formatSourceName(sourceMissingFinding.source)}
                      </span>
                    )}
                  </div>
                </div>
                <div role="cell" className="flex items-center justify-stretch md:justify-end">
                  <Link
                    to={`/automations/${encodeURIComponent(a.id)}`}
                    aria-label={`Open ${a.naam}`}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:w-auto"
                  >
                    Open
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
        {sorted.length === 0 && (
          <p className="px-5 py-8 text-sm text-muted-foreground">Geen automations gevonden.</p>
        )}
      </div>
    </div>
  );
}

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

function isSourceLabel(source: string | undefined, label: string): boolean {
  const normalizedSource = source?.toLowerCase();
  if (!normalizedSource) return false;
  const normalizedLabel = label.toLowerCase();

  if (normalizedSource === "hubspot") return normalizedLabel.includes("hubspot");
  if (normalizedSource === "gitlab") return normalizedLabel.includes("gitlab");
  if (normalizedSource === "zapier") return normalizedLabel.includes("zapier");
  if (normalizedSource === "typeform") return normalizedLabel.includes("typeform");
  return normalizedLabel === normalizedSource;
}

function isHubSpotAutomation(a: Automatisering): boolean {
  return a.source === "hubspot";
}

function isGitLabAutomation(a: Automatisering): boolean {
  return a.source === "gitlab" || Boolean(a.gitlabFilePath);
}

function isZapierAutomation(a: Automatisering): boolean {
  return a.source === "zapier";
}

function isTypeformAutomation(a: Automatisering): boolean {
  return a.source === "typeform";
}

function getActiveSourceMissingFinding(a: Automatisering) {
  return a.sourceFindings?.find((finding) => finding.type === "source_missing" && !finding.resolvedAt);
}

function formatSourceName(source: string | undefined | null): string {
  if (source === "hubspot") return "HubSpot";
  if (source === "gitlab") return "GitLab";
  if (source === "zapier") return "Zapier";
  if (source === "typeform") return "Typeform";
  return "de bron";
}
