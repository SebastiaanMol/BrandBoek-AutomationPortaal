import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAutomatiseringen, useSetCleanupDeleteCandidate } from "@/lib/hooks";
import {
  Automatisering,
  KLANT_FASEN,
  KlantFase,
  berekenComplexiteit,
  berekenImpact,
} from "@/lib/types";
import { computeSmartEdges } from "@/lib/smartEdges";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { AlertTriangle, Activity, Layers, TrendingUp, ChevronDown, ChevronUp, Loader2, Filter, Info, BarChart3, Archive, Clock, ShieldCheck, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const FASE_COLORS: Record<KlantFase, string> = {
  Marketing: "#8b5cf6",
  Sales: "#ff7a59",
  Onboarding: "#0066cc",
  Boekhouding: "#10b981",
  Offboarding: "#64748b",
};

const FASE_ICONS: Record<KlantFase, string> = {
  Marketing: "📢",
  Sales: "🤝",
  Onboarding: "🚀",
  Boekhouding: "📊",
  Offboarding: "👋",
};

function getScoreColor(score: number): string {
  if (score >= 70) return "#ef4444";
  if (score >= 40) return "#f59e0b";
  return "#10b981";
}

function getScoreLabel(score: number): string {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

type CleanupLevel = "delete" | "review" | "keep";

interface CleanupAdvice {
  automation: Automatisering;
  score: number;
  level: CleanupLevel;
  label: string;
  reasons: string[];
  summary: string;
}

interface RejectedHubSpotAutomation {
  id: string;
  naam: string;
  status: string | null;
  external_id: string | null;
  last_synced_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  stappen: string[] | null;
}

async function fetchRejectedHubSpotAutomations(): Promise<RejectedHubSpotAutomation[]> {
  const { data, error } = await supabase
    .from("automatiseringen")
    .select("id,naam,status,external_id,last_synced_at,rejection_reason,created_at,stappen")
    .eq("import_status", "rejected")
    .or("source.eq.hubspot,import_source.eq.hubspot")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as RejectedHubSpotAutomation[];
}

const LEGACY_SYSTEM_PATTERNS = [
  { pattern: /pipedream/i, label: "Pipedream" },
  { pattern: /docufy/i, label: "Docufy" },
];

function getAutomationSearchText(a: Automatisering): string {
  return [
    a.naam,
    a.doel,
    a.trigger,
    a.afhankelijkheden,
    a.source,
    a.systemen.join(" "),
    a.stappen.join(" "),
    a.beschrijvingInSimpeleTaal?.join(" ") ?? "",
  ].join(" ");
}

function formatRunCount(count: number): string {
  return new Intl.NumberFormat("nl-NL").format(count);
}

function buildCleanupAdvice(a: Automatisering, currentYear = new Date().getFullYear()): CleanupAdvice {
  const reasons: string[] = [];
  const metadataReasons: string[] = [];
  let score = 0;
  const searchText = getAutomationSearchText(a);
  const name = a.naam.toLowerCase();
  let hasRecentHubSpotRun = false;

  if (a.status === "Uitgeschakeld") {
    score += 38;
    reasons.push("Staat uitgeschakeld en lijkt dus niet actief gebruikt te worden.");
  }

  if (a.status === "Verouderd") {
    score += 30;
    reasons.push("Heeft de status verouderd.");
  }

  if (a.source === "hubspot") {
    if (a.hubspotLastRunAt) {
      const lastRun = new Date(a.hubspotLastRunAt);
      if (!Number.isNaN(lastRun.getTime())) {
        const daysSinceLastRun = Math.floor((Date.now() - lastRun.getTime()) / (24 * 60 * 60 * 1000));
        if (daysSinceLastRun <= 90) {
          hasRecentHubSpotRun = true;
          score -= 35;
          reasons.push(`Recent nog gedraaid in HubSpot (${daysSinceLastRun === 0 ? "vandaag" : `${daysSinceLastRun} dagen geleden`}); dit is geen verwijderkandidaat zonder handmatige controle.`);
        } else if (daysSinceLastRun >= 365) {
          score += 30;
          reasons.push(`Is al ${daysSinceLastRun} dagen niet meer gedraaid in HubSpot.`);
        } else if (daysSinceLastRun >= 180) {
          score += 16;
          reasons.push(`Is al ${daysSinceLastRun} dagen niet meer gedraaid in HubSpot.`);
        }
      }
    } else if (a.hubspotRunCount365d === 0) {
      score += 24;
      reasons.push("Heeft geen HubSpot-runs in de afgelopen 365 dagen.");
    } else {
      score += 18;
      reasons.push("Run-data is niet beschikbaar via de HubSpot API; behandel deze workflow als verouderd totdat hij handmatig is gecontroleerd.");
    }
  }

  for (const legacy of LEGACY_SYSTEM_PATTERNS) {
    if (legacy.pattern.test(searchText)) {
      score += 35;
      reasons.push(`Gebruikt of verwijst naar ${legacy.label}, een systeem dat waarschijnlijk niet meer de standaardroute is.`);
    }
  }

  const years = Array.from(name.matchAll(/\b(20\d{2})\b/g))
    .map((match) => Number(match[1]))
    .filter((year) => year < currentYear - 1);
  if (years.length > 0) {
    const oldest = Math.min(...years);
    score += oldest <= currentYear - 4 ? 28 : 18;
    reasons.push(`Naam bevat oude jaargang(en): ${[...new Set(years)].join(", ")}.`);
  }

  if (/\b(cloned|copy|kopie)\b/i.test(a.naam)) {
    score += 14;
    reasons.push("Lijkt een clone/kopie te zijn; controleer of dit geen duplicaat is.");
  }

  if (a.stappen.length === 0) {
    score += 12;
    reasons.push("Heeft geen duidelijke stappen in het portaal.");
  }

  const weakGoal = !a.doel.trim() || /automatisch gegenereerd op basis van naam/i.test(a.doel);
  if (weakGoal) {
    metadataReasons.push("Doel is leeg of nog automatisch afgeleid uit de naam.");
  }

  if (a.koppelingen.length === 0) {
    metadataReasons.push("Heeft geen handmatige koppelingen naar andere automations.");
  }

  if ((a.fasen ?? []).length === 0) {
    metadataReasons.push("Is niet gekoppeld aan een klantfase.");
  }

  const clampedScore = Math.max(0, Math.min(score, 100));
  const allReasons = [...reasons, ...metadataReasons];
  const level: CleanupLevel = hasRecentHubSpotRun
    ? "keep"
    : clampedScore >= 70 ? "delete" : clampedScore >= 35 ? "review" : "keep";
  const label = level === "delete" ? "Waarschijnlijk verwijderen" : level === "review" ? "Controleren" : "Behouden";
  const summary = reasons[0] ?? metadataReasons[0] ?? "Geen sterke opruimsignalen gevonden.";

  return { automation: a, score: clampedScore, level, label, reasons: allReasons, summary };
}

// --- Dependency graph: find cascading failures ---
function findCascadeFailures(
  targetId: string,
  alle: Automatisering[]
): string[] {
  const affected = new Set<string>();
  const queue = [targetId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    // Find automations that depend on current (have a koppeling TO current)
    alle.forEach((a) => {
      if (a.id !== targetId && !affected.has(a.id)) {
        const dependsOnCurrent = a.koppelingen?.some((k) => k.doelId === current);
        if (dependsOnCurrent) {
          affected.add(a.id);
          queue.push(a.id);
        }
      }
    });
    // Also find automations that current links to (current's output feeds them)
    const currentAuto = alle.find((a) => a.id === current);
    currentAuto?.koppelingen?.forEach((k) => {
      if (!affected.has(k.doelId) && k.doelId !== targetId) {
        affected.add(k.doelId);
        queue.push(k.doelId);
      }
    });
  }
  return [...affected];
}

export default function Analyse() {
  const navigate = useNavigate();
  const { data: fetchedData, isLoading } = useAutomatiseringen();
  const { data: rejectedHubSpotAutomations = [], isLoading: isLoadingRejectedHubSpot } = useQuery({
    queryKey: ["rejected-hubspot-automations"],
    queryFn: fetchRejectedHubSpotAutomations,
  });
  const data = useMemo(() => fetchedData ?? [], [fetchedData]);
  const smartEdges = useMemo(() => computeSmartEdges(data), [data]);
  const [expandedFailure, setExpandedFailure] = useState<string | null>(null);
  const [impactFilter, setImpactFilter] = useState<string>("alle");
  const [complexFilter, setComplexFilter] = useState<string>("alle");

  const cleanupMarker = useSetCleanupDeleteCandidate();

  async function setCleanupMarker(automation: Automatisering, marked: boolean): Promise<void> {
    try {
      await cleanupMarker.mutateAsync({ id: automation.id, marked });
      if (marked) {
        toast.success(`"${automation.naam}" staat op de verwijderlijst`, {
          duration: 5000,
          action: {
            label: "Ongedaan maken",
            onClick: () => {
              void cleanupMarker.mutateAsync({ id: automation.id, marked: false });
            },
          },
        });
      } else {
        toast.success(`"${automation.naam}" is van de verwijderlijst gehaald`);
      }
    } catch {
      toast.error(marked
        ? "Kon automation niet op de verwijderlijst zetten"
        : "Kon automation niet van de verwijderlijst halen");
    }
  }

  const categorieData = useMemo(() => groupBy(data, "categorie"), [data]);
  const statusData = useMemo(() => groupBy(data, "status"), [data]);
  const ownerData = useMemo(() => groupBy(data, "owner"), [data]);

  const systeemData = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach((a) => a.systemen.forEach((s) => { counts[s] = (counts[s] || 0) + 1; }));
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [data]);

  const scoredData = useMemo(() =>
    data.map((a) => ({
      ...a,
      complexiteit: berekenComplexiteit(a),
      impact: berekenImpact(a, data),
      cascadeCount: findCascadeFailures(a.id, data).length,
    })).sort((a, b) => b.impact - a.impact),
    [data]
  );

  const cleanupAdvice = useMemo(() =>
    data
      .map((automation) => buildCleanupAdvice(automation))
      .filter((advice) => advice.level !== "keep" || advice.automation.cleanupDeleteCandidate)
      .sort((a, b) => {
        if (a.automation.cleanupDeleteCandidate !== b.automation.cleanupDeleteCandidate) {
          return a.automation.cleanupDeleteCandidate ? -1 : 1;
        }
        return b.score - a.score;
      }),
    [data]
  );

  const cleanupDeleteCount = cleanupAdvice.filter((item) => item.level === "delete").length;
  const cleanupReviewCount = cleanupAdvice.filter((item) => item.level === "review").length;
  const cleanupDeleteList = data.filter((item) => item.cleanupDeleteCandidate);
  const cleanupListCount = cleanupDeleteList.length;
  const removalListCount = cleanupListCount + rejectedHubSpotAutomations.length;

  const faseAutoMap = useMemo(() => {
    const map: Record<KlantFase, Automatisering[]> = {
      Marketing: [], Sales: [], Onboarding: [], Boekhouding: [], Offboarding: [],
    };
    data.forEach((a) => {
      (a.fasen || []).forEach((f) => {
        if (map[f]) map[f].push(a);
      });
    });
    return map;
  }, [data]);

  const COLORS = ["#0f172a", "#0066cc", "#ff7a59", "#65A30D", "#10b981", "#64748b"];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeCount    = data.filter(a => a.status === "Actief").length;
  const highRiskCount  = scoredData.filter(a => a.impact >= 70 || a.complexiteit >= 70).length;

  return (
    <div className="flex flex-col gap-0">
      <h1 className="sr-only">Analysis</h1>

      <Tabs defaultValue="timeline" className="w-full">
        {/* Hero + tab nav as one connected card */}
        <div className="mx-6 mt-6 rounded-2xl border border-border overflow-hidden shadow-sm">
          <header className="relative bg-primary-soft px-8 py-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                <BarChart3 className="w-4 h-4" />
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-primary">
                Automation Portal
              </span>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">Analyse</h2>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Inzicht in impact, complexiteit en afhankelijkheden van alle automations.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <StatBadge label="Automations" value={data.length} />
              <StatBadge label="Actief" value={activeCount} />
              <StatBadge label="Hoog risico" value={highRiskCount} />
              <StatBadge label="Opruimadvies" value={cleanupAdvice.length} />
              <StatBadge label="Verwijderlijst" value={removalListCount} />
            </div>
          </header>
          <div className="border-t border-border bg-card px-6">
            <TabsList className="h-auto bg-transparent p-0 gap-0 rounded-none">
              <TabsTrigger value="timeline" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium">
                Timeline
              </TabsTrigger>
              <TabsTrigger value="scores" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium">
                Impact & Scores
              </TabsTrigger>
              <TabsTrigger value="dependency" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium">
                Dependency Graph
              </TabsTrigger>
              <TabsTrigger value="charts" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium">
                Charts
              </TabsTrigger>
              <TabsTrigger value="bottlenecks" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium">
                Bottlenecks
              </TabsTrigger>
              <TabsTrigger value="cleanup" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium">
                Opruimadvies
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* ═══════════════ KLANTPROCES TIJDLIJN ═══════════════ */}
        <TabsContent value="timeline" className="p-6 mt-6">
      <section>
        <div className="flex items-center gap-2 mb-6">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">Customer Process Timeline</h2>
        </div>

        {/* Timeline connector line */}
        <div className="relative">
          {/* Horizontal line */}
          <div className="hidden lg:block absolute top-8 left-0 right-0 h-1 bg-border rounded-full z-0" />
          
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {KLANT_FASEN.map((fase, faseIdx) => {
              const autos = faseAutoMap[fase];
              const color = FASE_COLORS[fase];
              const activeCount = autos.filter((a) => a.status === "Actief").length;
              
              return (
                <div key={fase} className="relative">
                  {/* Fase header */}
                  <div
                    className="relative z-10 flex flex-col items-center mb-3"
                  >
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-xl border-[3px] bg-card shadow-md"
                      style={{ borderColor: color }}
                    >
                      {FASE_ICONS[fase]}
                    </div>
                    <span className="text-xs font-bold mt-2" style={{ color }}>
                      {fase}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {autos.length} auto · {activeCount} active
                    </span>
                  </div>

                  {/* Arrow between phases */}
                  {faseIdx < KLANT_FASEN.length - 1 && (
                    <div className="hidden lg:block absolute top-7 -right-3 text-border text-xl z-20">→</div>
                  )}

                  {/* Automation cards */}
                  <div className="space-y-1.5">
                    {autos.length === 0 ? (
                      <div className="text-[10px] text-muted-foreground text-center italic py-3">
                        No automations
                      </div>
                    ) : (
                      autos.map((a) => (
                        <div
                          key={a.id}
                          className="bg-card border border-border rounded-lg p-2.5 shadow-sm hover:shadow-md transition-shadow cursor-pointer hover:bg-secondary/50"
                          style={{ borderLeftWidth: 3, borderLeftColor: color }}
                          onClick={() => navigate(`/automations/${encodeURIComponent(a.id)}`)}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[9px] text-muted-foreground">{a.id}</span>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              a.status === "Actief" ? "bg-green-500" :
                              a.status === "Verouderd" ? "bg-red-500" :
                              a.status === "In review" ? "bg-yellow-500" : "bg-gray-400"
                            }`} />
                          </div>
                          <p className="text-[11px] font-medium leading-tight mt-0.5 truncate">{a.naam}</p>
                          <p className="text-[9px] text-muted-foreground truncate">{a.systemen.join(", ")}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
        </TabsContent>

        {/* ═══════════════ IMPACT & COMPLEXITEIT SCORES ═══════════════ */}
        <TabsContent value="scores" className="p-6 mt-6">
      <section>
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight">Impact & Complexity Scores</h2>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-sm">
                  <p className="font-semibold mb-1">Complexity (0-100)</p>
                  <ul className="list-disc pl-4 mb-2 space-y-0.5">
                    <li>Steps × 10 (max 40)</li>
                    <li>Systems × 12 (max 36)</li>
                    <li>Dependencies: +15</li>
                    <li>Links × 5 (max 15)</li>
                  </ul>
                  <p className="font-semibold mb-1">Impact (0-100)</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Customer phases × 12</li>
                    <li>Systems × 8</li>
                    <li>Direct dependencies × 20</li>
                    <li>Status Active: +10</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={impactFilter} onValueChange={setImpactFilter}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Impact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">All impact</SelectItem>
                  <SelectItem value="hoog">High (≥70)</SelectItem>
                  <SelectItem value="gemiddeld">Medium (40-69)</SelectItem>
                  <SelectItem value="laag">Low (&lt;40)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={complexFilter} onValueChange={setComplexFilter}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="Complexiteit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">All complexity</SelectItem>
                <SelectItem value="hoog">High (≥70)</SelectItem>
                <SelectItem value="gemiddeld">Medium (40-69)</SelectItem>
                <SelectItem value="laag">Low (&lt;40)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="bg-card border border-border rounded-[var(--radius-outer)] overflow-hidden shadow-sm">
          <div className="grid grid-cols-[auto_1fr_100px_100px_100px_80px] gap-0 px-4 py-2.5 border-b border-border bg-secondary text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="w-20">ID</span>
            <span>Naam</span>
            <span className="text-center">Impact</span>
            <span className="text-center">Complexiteit</span>
            <span className="text-center">Cascade</span>
            <span className="text-center">Status</span>
          </div>

          {scoredData.filter((a) => {
            const matchImpact = impactFilter === "alle" ||
              (impactFilter === "hoog" && a.impact >= 70) ||
              (impactFilter === "gemiddeld" && a.impact >= 40 && a.impact < 70) ||
              (impactFilter === "laag" && a.impact < 40);
            const matchComplex = complexFilter === "alle" ||
              (complexFilter === "hoog" && a.complexiteit >= 70) ||
              (complexFilter === "gemiddeld" && a.complexiteit >= 40 && a.complexiteit < 70) ||
              (complexFilter === "laag" && a.complexiteit < 40);
            return matchImpact && matchComplex;
          }).map((a) => (
            <div
              key={a.id}
              className="grid grid-cols-[auto_1fr_100px_100px_100px_80px] gap-0 px-4 py-3 border-b border-border last:border-0 items-center hover:bg-secondary/50 transition-colors"
            >
              <span className="font-mono text-xs text-muted-foreground w-20">{a.id}</span>
              <span className="text-sm font-medium truncate pr-4">{a.naam}</span>

              {/* Impact score */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${a.impact}%`, background: getScoreColor(a.impact) }}
                  />
                </div>
                <span className="text-[10px] font-bold" style={{ color: getScoreColor(a.impact) }}>
                  {a.impact} – {getScoreLabel(a.impact)}
                </span>
              </div>

              {/* Complexity score */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${a.complexiteit}%`, background: getScoreColor(a.complexiteit) }}
                  />
                </div>
                <span className="text-[10px] font-bold" style={{ color: getScoreColor(a.complexiteit) }}>
                  {a.complexiteit} – {getScoreLabel(a.complexiteit)}
                </span>
              </div>

              {/* Cascade */}
              <div className="text-center">
                {a.cascadeCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: "#ef4444" }}>
                    <AlertTriangle className="h-3 w-3" />
                    {a.cascadeCount} affected
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">None</span>
                )}
              </div>

              {/* Status */}
              <div className="text-center">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  a.status === "Actief" ? "bg-green-500/10 text-green-600" :
                  a.status === "Verouderd" ? "bg-red-500/10 text-red-600" :
                  a.status === "In review" ? "bg-yellow-500/10 text-yellow-600" :
                  "bg-gray-500/10 text-gray-500"
                }`}>
                  {a.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
        </TabsContent>

        {/* ═══════════════ AFHANKELIJKHEIDSGRAPH ═══════════════ */}
        <TabsContent value="dependency" className="p-6 mt-6">
      <section>
        <div className="flex items-center gap-2 mb-6">
          <Layers className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">Dependency Graph – What breaks if X fails?</h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scoredData.filter((a) => a.status === "Actief").map((a) => {
            const failures = findCascadeFailures(a.id, data);
            const isExpanded = expandedFailure === a.id;
            const riskLevel = failures.length >= 2 ? "high" : failures.length >= 1 ? "medium" : "low";

            return (
              <div
                key={a.id}
                className={`bg-card border rounded-[var(--radius-inner)] p-4 shadow-sm transition-all cursor-pointer hover:shadow-md ${
                  riskLevel === "high" ? "border-red-300" :
                  riskLevel === "medium" ? "border-yellow-300" : "border-border"
                }`}
                onClick={() => setExpandedFailure(isExpanded ? null : a.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground">{a.id}</span>
                    <p className="text-sm font-semibold leading-tight">{a.naam}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {riskLevel === "high" && <AlertTriangle className="h-4 w-4 text-red-500" />}
                    {riskLevel === "medium" && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
                  <span>Impact: <strong style={{ color: getScoreColor(a.impact) }}>{a.impact}</strong></span>
                  <span>Complexity: <strong style={{ color: getScoreColor(a.complexiteit) }}>{a.complexiteit}</strong></span>
                </div>

                {failures.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground italic">
                    ✅ No cascade effect on failure
                  </p>
                ) : (
                  <div>
                    <p className="text-[10px] font-bold text-red-600 mb-1">
                      ⚠️ {failures.length} automation{failures.length > 1 ? "s" : ""} affected on failure:
                    </p>
                    {isExpanded && (
                      <div className="space-y-1 mt-2">
                        {failures.map((fId) => {
                          const dep = data.find((d) => d.id === fId);
                          return (
                            <div key={fId} className="flex items-center gap-2 bg-red-50 dark:bg-red-950/20 rounded p-1.5">
                              <span className="font-mono text-[9px] text-red-600">{fId}</span>
                              <span className="text-[10px] truncate">{dep?.naam || "Unknown"}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
        </TabsContent>

        {/* ═══════════════ BESTAANDE CHARTS ═══════════════ */}
        <TabsContent value="charts" className="p-6 mt-6">
      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-6">Overview Charts</h2>
        <div className="grid lg:grid-cols-2 gap-8">
          <ChartCard title="By Category" data={categorieData} colors={COLORS} />
          <ChartCard title="By System" data={systeemData} colors={COLORS} />
          <ChartCard title="By Owner" data={ownerData} colors={COLORS} />
          <ChartCard title="By Status" data={statusData} colors={COLORS} />
        </div>
      </section>
        </TabsContent>

        {/* ═══════════════ KNELPUNTEN ═══════════════ */}
        <TabsContent value="bottlenecks" className="p-6 mt-6">
      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Bottlenecks Overview</h2>
        {data.filter((a) => a.afhankelijkheden?.trim()).length === 0 ? (
          <p className="text-muted-foreground text-sm">No bottlenecks registered.</p>
        ) : (
          <div className="space-y-3">
            {data.filter((a) => a.afhankelijkheden?.trim()).map((a) => (
              <div key={a.id} className="bg-card border border-border rounded-[var(--radius-inner)] p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
                  <span className="font-medium text-sm">{a.naam}</span>
                </div>
                <p className="text-sm text-muted-foreground">{a.afhankelijkheden}</p>
              </div>
            ))}
          </div>
        )}
      </section>
        </TabsContent>

        <TabsContent value="cleanup" className="p-6 mt-6">
          <section className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Archive className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold tracking-tight">Opruimadvies</h2>
                </div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Automations die mogelijk opgeschoond kunnen worden op basis van status, oude jaargangen, legacy systemen,
                  ontbrekende stappen en losse koppelingen. Zet kandidaten eerst op de verwijderlijst voordat je ze buiten het portaal opruimt.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:flex">
                <StatBadge label="Waarschijnlijk verwijderen" value={cleanupDeleteCount} />
                <StatBadge label="Controleren" value={cleanupReviewCount} />
                <StatBadge label="Verwijderlijst" value={removalListCount} />
              </div>
            </div>

            <div className="rounded-[var(--radius-outer)] border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Trash2 className="h-4 w-4 text-destructive" />
                    <h3 className="text-sm font-semibold">Verwijderlijst</h3>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Items die gecontroleerd moeten worden voordat ze definitief uit de bron of uit het portaal verdwijnen.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-secondary px-2.5 py-1 font-medium text-foreground">
                    {cleanupListCount} handmatig gemarkeerd
                  </span>
                  <span className="rounded-full bg-secondary px-2.5 py-1 font-medium text-foreground">
                    {rejectedHubSpotAutomations.length} afgewezen HubSpot
                  </span>
                </div>
              </div>

              {removalListCount === 0 && !isLoadingRejectedHubSpot ? (
                <div className="py-8 text-center">
                  <ShieldCheck className="mx-auto h-7 w-7 text-green-600" />
                  <p className="mt-2 text-sm font-medium">De verwijderlijst is leeg</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Gebruik de knop in het opruimadvies om een automation hier klaar te zetten.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {cleanupDeleteList.map((automation) => (
                    <div
                      key={automation.id}
                      className="flex cursor-pointer flex-col gap-2 py-3 transition-colors hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
                      onClick={() => navigate(`/automations/${encodeURIComponent(automation.id)}`)}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Handmatig</span>
                          <span className="font-mono text-[11px] text-muted-foreground">{automation.id}</span>
                          <span className="truncate text-sm font-semibold">{automation.naam}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Toegevoegd vanuit opruimadvies{automation.cleanupDeleteCandidateAt ? ` op ${new Date(automation.cleanupDeleteCandidateAt).toLocaleDateString("nl-NL")}` : ""}.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <span className="rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground">{automation.status}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 text-xs"
                          disabled={cleanupMarker.isPending}
                          onClick={(event) => {
                            event.stopPropagation();
                            void setCleanupMarker(automation, false);
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Van lijst
                        </Button>
                      </div>
                    </div>
                  ))}

                  {isLoadingRejectedHubSpot ? (
                    <p className="py-4 text-sm text-muted-foreground">Afgewezen HubSpot automations laden...</p>
                  ) : rejectedHubSpotAutomations.map((automation) => (
                    <div key={automation.id} className="py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">HubSpot afgewezen</span>
                            <span className="font-mono text-[11px] text-muted-foreground">{automation.external_id ?? automation.id}</span>
                            <span className="truncate text-sm font-semibold">{automation.naam}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Verwijder deze workflow handmatig in HubSpot. Na HubSpot sync verdwijnt hij hier pas als HubSpot hem niet meer terugstuurt.
                          </p>
                          {automation.rejection_reason && (
                            <p className="mt-1 text-xs text-muted-foreground">Reden: {automation.rejection_reason}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 sm:justify-end">
                          <span className="rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
                            {automation.status ?? "Onbekend"}
                          </span>
                          {automation.last_synced_at && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {new Date(automation.last_synced_at).toLocaleDateString("nl-NL")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cleanupAdvice.length === 0 ? (
              <div className="rounded-[var(--radius-outer)] border border-border bg-card p-8 text-center shadow-sm">
                <ShieldCheck className="mx-auto h-8 w-8 text-green-600" />
                <p className="mt-3 text-sm font-semibold">Geen duidelijke opruimkandidaten gevonden</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Op basis van de huidige signalen lijkt er niets direct verdacht.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[var(--radius-outer)] border border-border bg-card shadow-sm">
                <div className="hidden grid-cols-[190px_1fr_110px_140px_150px] gap-4 border-b border-border bg-secondary px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground lg:grid">
                  <span>Advies</span>
                  <span>Automation</span>
                  <span>Score</span>
                  <span>Bron/status</span>
                  <span>Actie</span>
                </div>

                <div className="divide-y divide-border">
                  {cleanupAdvice.map((item) => {
                    const a = item.automation;
                    const isDelete = item.level === "delete";
                    const isOnDeleteList = Boolean(a.cleanupDeleteCandidate);
                    return (
                      <div
                        key={a.id}
                        onClick={() => navigate(`/automations/${encodeURIComponent(a.id)}`)}
                        className="grid w-full cursor-pointer gap-3 px-4 py-4 text-left transition-colors hover:bg-secondary/50 lg:grid-cols-[190px_1fr_110px_140px_150px] lg:items-start lg:gap-4"
                      >
                        <div>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            isOnDeleteList ? "bg-slate-900 text-white" : isDelete ? "bg-red-500/10 text-red-700" : "bg-yellow-500/10 text-yellow-700"
                          }`}>
                            {isOnDeleteList ? "Op verwijderlijst" : item.label}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground">{a.id}</span>
                            <span className="text-sm font-semibold text-foreground">{a.naam}</span>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.reasons.slice(1, 4).map((reason) => (
                              <span key={reason} className="rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
                                {reason}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 lg:block">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-secondary lg:w-full">
                            <div
                              className={`h-full rounded-full ${isDelete ? "bg-red-500" : "bg-yellow-500"}`}
                              style={{ width: `${item.score}%` }}
                            />
                          </div>
                          <span className={`text-xs font-bold ${isDelete ? "text-red-700" : "text-yellow-700"}`}>
                            {item.score}/100
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5 lg:flex-col lg:items-start">
                          <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-medium text-foreground">
                            {a.source ?? "manual"}
                          </span>
                          <span className="rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
                            {a.status}
                          </span>
                          {a.hubspotLastRunAt ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              Gedraaid {new Date(a.hubspotLastRunAt).toLocaleDateString("nl-NL")}
                              {typeof a.hubspotRunCount365d === "number" ? ` · ${formatRunCount(a.hubspotRunCount365d)} runs` : ""}
                            </span>
                          ) : a.hubspotRunCount365d === 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-[11px] text-red-700">
                              <Clock className="h-3 w-3" />
                              0 runs 365d
                            </span>
                          ) : a.source === "hubspot" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-700">
                              <Clock className="h-3 w-3" />
                              Runs onbekend/verouderd
                            </span>
                          ) : a.lastSyncedAt && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {new Date(a.lastSyncedAt).toLocaleDateString("nl-NL")}
                            </span>
                          )}
                        </div>

                        <div className="flex items-start">
                          <Button
                            type="button"
                            size="sm"
                            variant={isOnDeleteList ? "secondary" : "outline"}
                            className="h-8 w-full gap-1.5 text-xs"
                            disabled={isOnDeleteList || cleanupMarker.isPending}
                            onClick={(event) => {
                              event.stopPropagation();
                              void setCleanupMarker(a, true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {isOnDeleteList ? "Toegevoegd" : "Naar lijst"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChartCard({ title, data, colors }: { title: string; data: { name: string; count: number }[]; colors: string[] }) {
  return (
    <div className="bg-card border border-border rounded-[var(--radius-outer)] p-6 shadow-sm">
      <p className="label-uppercase mb-4">{title}</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <RechartsTooltip />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-card/80 backdrop-blur-sm border border-border px-4 py-2.5">
      <p className="text-xl font-semibold text-foreground tabular-nums leading-tight">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
    </div>
  );
}

function groupBy<T extends Record<string, unknown>>(arr: T[], key: keyof T): { name: string; count: number }[] {
  const counts: Record<string, number> = {};
  arr.forEach((item) => {
    const val = String(item[key] || "Onbekend");
    counts[val] = (counts[val] || 0) + 1;
  });
  return Object.entries(counts).map(([name, count]) => ({ name, count }));
}
