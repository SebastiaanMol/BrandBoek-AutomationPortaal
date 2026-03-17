import { Link } from "react-router-dom";
import { StatusBadge, CategorieBadge } from "@/components/Badges";
import { useAutomatiseringen } from "@/lib/hooks";
import { getVerificatieStatus } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { Loader2, ClipboardCheck } from "lucide-react";

export default function Dashboard() {
  const { data, isLoading } = useAutomatiseringen();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const all = data || [];
  const totaal = all.length;
  const actief = all.filter((a) => a.status === "Actief").length;
  const verouderd = all.filter((a) => a.status === "Verouderd").length;
  const uitgeschakeld = all.filter((a) => a.status === "Uitgeschakeld").length;

  const vGeverifieerd = all.filter((a) => getVerificatieStatus(a) === "geverifieerd").length;
  const vVerouderd = all.filter((a) => getVerificatieStatus(a) === "verouderd").length;
  const vNooit = all.filter((a) => getVerificatieStatus(a) === "nooit").length;
  const vProgress = totaal > 0 ? (vGeverifieerd / totaal) * 100 : 0;

  const metrics = [
    { label: "Totaal Vastgelegd", value: totaal, color: "text-foreground" },
    { label: "Actief", value: actief, color: "text-status-active" },
    { label: "Verouderd", value: verouderd, color: "text-status-outdated" },
    { label: "Uitgeschakeld", value: uitgeschakeld, color: "text-status-disabled" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="metric-card">
            <p className="label-uppercase mb-1">{m.label}</p>
            <span className={`text-3xl font-mono font-bold ${m.color}`}>{m.value}</span>
          </div>
        ))}
      </div>

      {/* Verificatie samenvatting */}
      <Link to="/verificatie" className="block">
        <div className="metric-card hover:border-primary/30 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              <p className="label-uppercase">Verificatie Status</p>
            </div>
            <span className="text-xs text-muted-foreground">{vGeverifieerd}/{totaal} up-to-date</span>
          </div>
          <Progress value={vProgress} className="h-2 mb-3" />
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <span className="text-xl font-mono font-bold text-[hsl(var(--status-active))]">{vGeverifieerd}</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">🟢 Geverifieerd</p>
            </div>
            <div>
              <span className="text-xl font-mono font-bold text-[hsl(var(--status-review))]">{vVerouderd}</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">🟡 &gt;90 dagen</p>
            </div>
            <div>
              <span className="text-xl font-mono font-bold text-[hsl(var(--status-outdated))]">{vNooit}</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">🔴 Nooit</p>
            </div>
          </div>
        </div>
      </Link>

      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground mb-4">
          Recente Automatiseringen
        </h2>
        <div className="space-y-3">
          {all.slice(-10).reverse().map((a) => (
            <div
              key={a.id}
              className="bg-card border border-border rounded-[var(--radius-inner)] p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs text-muted-foreground shrink-0">{a.id}</span>
                <span className="font-medium text-foreground truncate">{a.naam}</span>
                <CategorieBadge categorie={a.categorie} />
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={a.status} />
                <span className="text-xs text-muted-foreground">{a.owner}</span>
              </div>
            </div>
          ))}
          {all.length === 0 && (
            <p className="text-muted-foreground text-sm">Nog geen automatiseringen vastgelegd.</p>
          )}
        </div>
      </div>

      <Link
        to="/nieuw"
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
      >
        + Nieuwe Automatisering
      </Link>
    </div>
  );
}
