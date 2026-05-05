import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAutomatiseringen, usePortalSettings, useAutomationLinks, useConfirmLink, useSetCleanupDeleteCandidate } from "@/lib/hooks";
import { exportToCSV } from "@/lib/supabaseStorage";
import { CATEGORIEEN, SYSTEMEN, STATUSSEN, Systeem, Automatisering } from "@/lib/types";
import { StatusBadge, CategorieBadge, SystemBadge, SourceBadge } from "@/components/Badges";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Download, Search as SearchIcon, Loader2, Pencil, Zap, Sparkles, Archive, RotateCcw, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export default function AlleAutomatiseringen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data, isLoading } = useAutomatiseringen();
  const { data: portalSettings } = usePortalSettings();
  const [sortOrder, setSortOrder] = useState<"created_at" | "naam" | "status">("created_at");
  const [settingsApplied, setSettingsApplied] = useState(false);
  const cleanupMarker = useSetCleanupDeleteCandidate();
  const [openId, setOpenId] = useState<string | null>(searchParams.get("open") || null);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<string>("alle");
  const [sysFilter, setSysFilter] = useState<string>("alle");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [koppelingFilter, setKoppelingFilter] = useState<string>("alle");
  const automationRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // When navigated here with ?open=ID, wait for data then open that item (clear filters so it's visible)
  const pendingOpen = searchParams.get("open");
  useEffect(() => {
    if (!pendingOpen || !data) return;
    const exists = data.some((a) => a.id === pendingOpen);
    if (exists) {
      setOpenId(pendingOpen);
      setQuery("");
      setCatFilter("alle");
      setSysFilter("alle");
      setStatusFilter("alle");
      setKoppelingFilter("alle");
      setSortOrder(portalSettings?.standaardSortering ?? "created_at");
      setSettingsApplied(true);
    }
  }, [pendingOpen, data, portalSettings]);

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
    return matchesQuery && matchesCat && matchesSys && matchesStatus && matchesKoppeling;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortOrder === "naam") return a.naam.localeCompare(b.naam, "nl");
    if (sortOrder === "status") return a.status.localeCompare(b.status, "nl");
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const hasActiveFilters = Boolean(
    query.trim() ||
    catFilter !== "alle" ||
    sysFilter !== "alle" ||
    statusFilter !== "alle" ||
    koppelingFilter !== "alle" ||
    sortOrder !== (portalSettings?.standaardSortering ?? "created_at"),
  );

  const clearFilters = () => {
    setQuery("");
    setCatFilter("alle");
    setSysFilter("alle");
    setStatusFilter("alle");
    setKoppelingFilter("alle");
    setSortOrder(portalSettings?.standaardSortering ?? "created_at");
  };

  const toggleAutomation = (id: string) => {
    const nextOpenId = openId === id ? null : id;
    setOpenId(nextOpenId);

    const next = new URLSearchParams(searchParams);
    if (nextOpenId) {
      next.delete("tab");
      next.set("open", nextOpenId);
    } else {
      next.delete("open");
    }
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (!pendingOpen || openId !== pendingOpen || sorted.length === 0) return;

    const centerAutomation = () => {
      const element = automationRefs.current[pendingOpen];
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const stickyHeaderOffset = 56;
      const availableHeight = window.innerHeight - stickyHeaderOffset;
      const targetTop = rect.height >= availableHeight
        ? window.scrollY + rect.top - stickyHeaderOffset - 12
        : window.scrollY + rect.top - stickyHeaderOffset - ((availableHeight - rect.height) / 2);

      window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
    };

    const frame = window.requestAnimationFrame(centerAutomation);
    const afterExpand = window.setTimeout(centerAutomation, 350);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(afterExpand);
    };
  }, [openId, pendingOpen, sorted.length]);

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
    <div className="space-y-4">
      <h1 className="sr-only">All Automations</h1>
      <div className="card-elevated p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all fields..." className="pl-9" />
          </div>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-full lg:w-44"><SelectValue placeholder="Categorie" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">All categories</SelectItem>
              {CATEGORIEEN.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sysFilter} onValueChange={setSysFilter}>
            <SelectTrigger className="w-full lg:w-40"><SelectValue placeholder="Systeem" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">All systems</SelectItem>
              {SYSTEMEN.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full lg:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">All statuses</SelectItem>
              {STATUSSEN.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={koppelingFilter} onValueChange={setKoppelingFilter}>
            <SelectTrigger className="w-full lg:w-44"><SelectValue placeholder="Koppelingen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle koppelingen</SelectItem>
              <SelectItem value="verbonden">Verbonden</SelectItem>
              <SelectItem value="niet-verbonden">Niet verbonden</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as typeof sortOrder)}>
            <SelectTrigger className="w-full lg:w-44"><SelectValue placeholder="Sortering" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at">Aanmaakdatum</SelectItem>
              <SelectItem value="naam">Naam (A–Z)</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{sorted.length}</span> van {all.length} automations
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-secondary"
                >
                  Filters wissen
                </button>
              )}
              <button
                onClick={downloadCSV}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-secondary"
              >
                <Download className="h-4 w-4" /> Download CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {sorted.length > 0 && (
        <div className="hidden grid-cols-[72px_minmax(220px,1fr)_128px_116px_minmax(280px,1.1fr)_88px_24px] gap-4 px-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground md:grid">
          <span>ID</span>
          <span>Naam</span>
          <span>Status</span>
          <span>Bron</span>
          <span>Labels</span>
          <span>Compleet</span>
          <span />
        </div>
      )}

      {sorted.map((a) => {
        const isOpen = openId === a.id;
        const score = completenessScore(a);
        const showCategorie = !isSourceLabel(a.source, a.categorie);
        const primarySystem = a.systemen[0] || "Anders";
        const showPrimarySystem = !isSourceLabel(a.source, primarySystem);
        return (
          <div
            key={a.id}
            ref={(node) => {
              automationRefs.current[a.id] = node;
            }}
            className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
          >
            <button
              onClick={() => toggleAutomation(a.id)}
              className="grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50 md:grid-cols-[72px_minmax(220px,1fr)_128px_116px_minmax(280px,1.1fr)_88px_24px] md:items-center md:gap-4"
            >
              <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
              <div className="min-w-0">
                <span className="block truncate font-medium text-foreground" title={a.naam}>{a.naam}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground md:hidden">
                  {a.doel || "Geen doel ingevuld"}
                </span>
              </div>
              <div className="flex min-w-0 items-center justify-start">
                <StatusBadge status={a.status} />
              </div>
              <div className="flex min-w-0 items-center justify-start">
                <SourceBadge source={a.source} />
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-start gap-2">
                {showCategorie && <CategorieBadge categorie={a.categorie} />}
                {showPrimarySystem && <SystemBadge systeem={primarySystem} />}
                {a.gitlabFilePath && (
                  <span className="badge-gitlab">GL</span>
                )}
              </div>
              <CompletenessBadge score={score} />
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="overflow-hidden"
                >
                  <AutomatiseringDetailPanel
                    a={a}
                    cleanupMarker={cleanupMarker}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      {sorted.length === 0 && <p className="text-muted-foreground text-sm">No results found.</p>}
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

function AutomatiseringDetailPanel({
  a,
  cleanupMarker,
}: {
  a: Automatisering;
  cleanupMarker: ReturnType<typeof useSetCleanupDeleteCandidate>;
}) {
  const navigate = useNavigate();
  const { data: links } = useAutomationLinks(a.id);
  const confirmMutation = useConfirmLink();
  const hubSpotUsage = formatHubSpotUsage(a);

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
    <div className="px-5 pb-5 pt-3 border-t border-border space-y-5">
      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        </div>
      </div>

      {/* Plain-language description */}
      {a.beschrijvingInSimpeleTaal && a.beschrijvingInSimpeleTaal.length > 0 ? (
        <div className="bg-secondary/40 rounded-md px-4 py-3 space-y-1.5">
          <p className="label-uppercase mb-2">Wat doet deze automatisering?</p>
          {a.beschrijvingInSimpeleTaal.map((line, i) => (
            <p key={i} className="text-sm text-foreground leading-relaxed">{line}</p>
          ))}
        </div>
      ) : a.doel ? (
        <div className="bg-secondary/40 rounded-md px-4 py-3">
          <p className="label-uppercase mb-1">Wat doet deze automatisering?</p>
          <p className="text-sm text-foreground leading-relaxed">{a.doel}</p>
        </div>
      ) : null}

      {/* Trigger */}
      {a.trigger && (
        <div className="flex items-start gap-2">
          <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="label-uppercase mb-0.5">Wordt gestart door</p>
            <p className="text-sm text-foreground">{a.trigger}</p>
          </div>
        </div>
      )}

      {/* Flow steps */}
      {a.stappen.length > 0 && (
        <div>
          <p className="label-uppercase mb-2">Hoe werkt het?</p>
          <div className="flex flex-col gap-1.5">
            {a.stappen.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-foreground leading-snug pt-0.5">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase + meta row */}
      <div className="grid md:grid-cols-2 gap-4 pt-1 border-t border-border">
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

      {/* Systems */}
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

      {/* Backend Script (shown on HubSpot automations with matched GitLab links) */}
      {links && links.asSource.length > 0 && (
        <div className="border-t border-border pt-4">
          <p className="label-uppercase mb-2">Backend Script</p>
          <div className="space-y-2">
            {links.asSource.map((link) => (
              <div key={link.id} className="bg-secondary rounded-[var(--radius-inner)] p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground shrink-0">{link.target?.id}</span>
                    <span className="text-sm font-medium truncate">{link.target?.naam}</span>
                  </div>
                  {link.target?.gitlab_file_path && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{link.target.gitlab_file_path}</p>
                  )}
                </div>
                {link.confirmed ? (
                  <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Gekoppeld</span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Suggestie</span>
                    <button
                      onClick={() => confirmMutation.mutate(link.id)}
                      disabled={confirmMutation.isPending}
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      Bevestig
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HubSpot Workflows (shown on GitLab automations called by HubSpot workflows) */}
      {links && links.asTarget.length > 0 && (
        <div className="border-t border-border pt-4">
          <p className="label-uppercase mb-2">HubSpot Workflows</p>
          <div className="space-y-2">
            {links.asTarget.map((link) => (
              <div key={link.id} className="bg-secondary rounded-[var(--radius-inner)] p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground shrink-0">{link.source?.id}</span>
                  <span className="text-sm font-medium truncate">{link.source?.naam}</span>
                </div>
                {link.confirmed ? (
                  <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Gekoppeld</span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Suggestie</span>
                    <button
                      onClick={() => confirmMutation.mutate(link.id)}
                      disabled={confirmMutation.isPending}
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      Bevestig
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function completenessScore(a: Automatisering): number {
  const checks = [
    !!a.doel?.trim(),
    !!a.trigger?.trim(),
    a.stappen?.length > 0,
    a.systemen?.length > 0,
    !!a.owner?.trim(),
    a.fasen?.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
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

function CompletenessBadge({ score }: { score: number }) {
  const color =
    score === 100 ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
    score >= 67   ? "text-amber-600 bg-amber-50 border-amber-200" :
                    "text-red-600 bg-red-50 border-red-200";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${color}`}>
      {score}%
    </span>
  );
}
