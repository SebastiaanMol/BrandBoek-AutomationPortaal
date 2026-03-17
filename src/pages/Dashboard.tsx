import { useMemo } from "react";
import { Link } from "react-router-dom";
import { getAutomatiseringen } from "@/lib/storage";
import { StatusBadge, CategorieBadge } from "@/components/Badges";

export default function Dashboard() {
  const data = useMemo(() => getAutomatiseringen(), []);

  const totaal = data.length;
  const actief = data.filter((a) => a.status === "Actief").length;
  const verouderd = data.filter((a) => a.status === "Verouderd").length;
  const uitgeschakeld = data.filter((a) => a.status === "Uitgeschakeld").length;

  const metrics = [
    { label: "Totaal Vastgelegd", value: totaal, color: "text-foreground" },
    { label: "Actief", value: actief, color: "text-status-active" },
    { label: "Verouderd", value: verouderd, color: "text-status-outdated" },
    { label: "Uitgeschakeld", value: uitgeschakeld, color: "text-status-disabled" },
  ];

  return (
    <div className="space-y-8">
      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="metric-card">
            <p className="label-uppercase mb-1">{m.label}</p>
            <span className={`text-3xl font-mono font-bold ${m.color}`}>{m.value}</span>
          </div>
        ))}
      </div>

      {/* Recent */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground mb-4">
          Recente Automatiseringen
        </h2>
        <div className="space-y-3">
          {data.slice(-10).reverse().map((a) => (
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
          {data.length === 0 && (
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
