import { useMemo, useState } from "react";
import { useAutomatiseringen } from "@/lib/hooks";
import {
  Automatisering,
  KLANT_FASEN,
  KlantFase,
  berekenComplexiteit,
  berekenImpact,
} from "@/lib/types";
import { computeSmartEdges } from "@/lib/smartEdges";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { AlertTriangle, Activity, Layers, TrendingUp, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

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
  if (score >= 70) return "Hoog";
  if (score >= 40) return "Gemiddeld";
  return "Laag";
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
  const { data: fetchedData, isLoading } = useAutomatiseringen();
  const data = fetchedData || [];
  const smartEdges = useMemo(() => computeSmartEdges(data), [data]);
  const [expandedFailure, setExpandedFailure] = useState<string | null>(null);

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

  const COLORS = ["#0f172a", "#0066cc", "#ff7a59", "#ff4a00", "#10b981", "#64748b"];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* ═══════════════ KLANTPROCES TIJDLIJN ═══════════════ */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">Klantproces Tijdlijn</h2>
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
                      {autos.length} auto · {activeCount} actief
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
                        Geen automatiseringen
                      </div>
                    ) : (
                      autos.map((a) => (
                        <div
                          key={a.id}
                          className="bg-card border border-border rounded-lg p-2.5 shadow-sm hover:shadow-md transition-shadow"
                          style={{ borderLeftWidth: 3, borderLeftColor: color }}
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

      {/* ═══════════════ IMPACT & COMPLEXITEIT SCORES ═══════════════ */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">Impact & Complexiteit Scores</h2>
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

          {scoredData.map((a) => (
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
                    {a.cascadeCount} geraakt
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Geen</span>
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

      {/* ═══════════════ AFHANKELIJKHEIDSGRAPH ═══════════════ */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <Layers className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">Afhankelijkheidsgraph – Wat breekt als X uitvalt?</h2>
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
                  <span>Complexiteit: <strong style={{ color: getScoreColor(a.complexiteit) }}>{a.complexiteit}</strong></span>
                </div>

                {failures.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground italic">
                    ✅ Geen cascade-effect bij uitval
                  </p>
                ) : (
                  <div>
                    <p className="text-[10px] font-bold text-red-600 mb-1">
                      ⚠️ {failures.length} automatisering{failures.length > 1 ? "en" : ""} geraakt bij uitval:
                    </p>
                    {isExpanded && (
                      <div className="space-y-1 mt-2">
                        {failures.map((fId) => {
                          const dep = data.find((d) => d.id === fId);
                          return (
                            <div key={fId} className="flex items-center gap-2 bg-red-50 dark:bg-red-950/20 rounded p-1.5">
                              <span className="font-mono text-[9px] text-red-600">{fId}</span>
                              <span className="text-[10px] truncate">{dep?.naam || "Onbekend"}</span>
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

      {/* ═══════════════ BESTAANDE CHARTS ═══════════════ */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-6">Overzicht Grafieken</h2>
        <div className="grid lg:grid-cols-2 gap-8">
          <ChartCard title="Per Categorie" data={categorieData} colors={COLORS} />
          <ChartCard title="Per Systeem" data={systeemData} colors={COLORS} />
          <ChartCard title="Per Owner" data={ownerData} colors={COLORS} />
          <ChartCard title="Per Status" data={statusData} colors={COLORS} />
        </div>
      </section>

      {/* ═══════════════ KNELPUNTEN ═══════════════ */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Knelpunten Overzicht</h2>
        {data.filter((a) => a.afhankelijkheden?.trim()).length === 0 ? (
          <p className="text-muted-foreground text-sm">Geen knelpunten geregistreerd.</p>
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
          <Tooltip />
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupBy(arr: any[], key: string): { name: string; count: number }[] {
  const counts: Record<string, number> = {};
  arr.forEach((item) => {
    const val = String(item[key] || "Onbekend");
    counts[val] = (counts[val] || 0) + 1;
  });
  return Object.entries(counts).map(([name, count]) => ({ name, count }));
}
