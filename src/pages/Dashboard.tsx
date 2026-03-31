import { Link } from "react-router-dom";
import { StatusBadge, CategorieBadge } from "@/components/Badges";
import { useAutomatiseringen } from "@/lib/hooks";
import { Automatisering, getVerificatieStatus } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    { label: "Total Recorded", value: totaal, color: "text-foreground" },
    { label: "Active", value: actief, color: "text-status-active" },
    { label: "Outdated", value: verouderd, color: "text-status-outdated" },
    { label: "Disabled", value: uitgeschakeld, color: "text-status-disabled" },
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
              <p className="label-uppercase">Verification Status</p>
            </div>
            <span className="text-xs text-muted-foreground">{vGeverifieerd}/{totaal} up-to-date</span>
          </div>
          <Progress value={vProgress} className="h-2 mb-3" />
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <span className="text-xl font-mono font-bold text-[hsl(var(--status-active))]">{vGeverifieerd}</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">🟢 Verified</p>
            </div>
            <div>
              <span className="text-xl font-mono font-bold text-[hsl(var(--status-review))]">{vVerouderd}</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">🟡 &gt;90 days</p>
            </div>
            <div>
              <span className="text-xl font-mono font-bold text-[hsl(var(--status-outdated))]">{vNooit}</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">🔴 Never</p>
            </div>
          </div>
        </div>
      </Link>

      {/* Status lijsten */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground mb-4">
          Automations by Status
        </h2>
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">
              Active <span className="ml-1.5 text-xs text-muted-foreground">({actief})</span>
            </TabsTrigger>
            <TabsTrigger value="outdated">
              Outdated <span className="ml-1.5 text-xs text-muted-foreground">({verouderd})</span>
            </TabsTrigger>
            <TabsTrigger value="disabled">
              Disabled <span className="ml-1.5 text-xs text-muted-foreground">({uitgeschakeld})</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active">
            <StatusList items={all.filter((a) => a.status === "Actief")} />
          </TabsContent>
          <TabsContent value="outdated">
            <StatusList items={all.filter((a) => a.status === "Verouderd")} />
          </TabsContent>
          <TabsContent value="disabled">
            <StatusList items={all.filter((a) => a.status === "Uitgeschakeld")} />
          </TabsContent>
        </Tabs>
      </div>

      <Link
        to="/nieuw"
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
      >
        + New Automation
      </Link>
    </div>
  );
}

function StatusList({ items }: { items: Automatisering[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm py-4">No automations in this category.</p>;
  }
  return (
    <div className="space-y-2 mt-2">
      {items.map((a) => (
        <Link
          key={a.id}
          to={`/alle?open=${a.id}`}
          className="bg-card border border-border rounded-[var(--radius-inner)] p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between shadow-sm hover:bg-secondary/50 transition-colors block"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-xs text-muted-foreground shrink-0">{a.id}</span>
            <span className="font-medium text-foreground truncate">{a.naam}</span>
            <CategorieBadge categorie={a.categorie} />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-muted-foreground">{a.owner}</span>
            <StatusBadge status={a.status} />
          </div>
        </Link>
      ))}
    </div>
  );
}
