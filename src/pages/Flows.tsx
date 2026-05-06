import { useState, useMemo } from "react";
import { Search, Workflow } from "lucide-react";
import {
  useAutomatiseringen,
  useFlows,
  useAllConfirmedAutomationLinks,
} from "@/lib/hooks";
import { detectFlows } from "@/lib/detectFlows";
import type { Systeem } from "@/lib/types";
import { FlowCard } from "@/components/FlowCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlowSuggestiesTab } from "@/components/FlowSuggestiesTab";

export default function Flows(): React.ReactNode {
  const { data: automations = [] } = useAutomatiseringen();
  const { data: flows = [] } = useFlows();
  const { data: confirmedLinks = [] } = useAllConfirmedAutomationLinks();

  const [query, setQuery] = useState("");
  const [filterSysteem, setFilterSysteem] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"recent" | "naam">("recent");

  const autoMap = useMemo(
    () => new Map(automations.map((a) => [a.id, a])),
    [automations],
  );

  const proposals = useMemo(
    () => detectFlows(automations, confirmedLinks),
    [automations, confirmedLinks],
  );

  const flowsWithUpdateFlag = useMemo(
    () =>
      flows.map((flow) => ({
        flow,
        hasUpdate: proposals.some((p) => {
          const pSet = new Set(p.automationIds);
          return (
            flow.automationIds.every((id) => pSet.has(id)) &&
            pSet.size > flow.automationIds.length
          );
        }),
      })),
    [flows, proposals],
  );

  const allSystems = useMemo(
    () => [...new Set(flows.flatMap((f) => f.systemen))].sort(),
    [flows],
  );

  const filteredFlows = useMemo(() => {
    let result = flowsWithUpdateFlag;

    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        ({ flow }) =>
          flow.naam.toLowerCase().includes(q) ||
          flow.beschrijving.toLowerCase().includes(q),
      );
    }

    if (filterSysteem) {
      result = result.filter(({ flow }) => flow.systemen.includes(filterSysteem as Systeem));
    }

    if (filterStatus === "actief") {
      result = result.filter(({ hasUpdate }) => !hasUpdate);
    } else if (filterStatus === "update") {
      result = result.filter(({ hasUpdate }) => hasUpdate);
    }

    if (sortOrder === "naam") {
      result = [...result].sort((a, b) => a.flow.naam.localeCompare(b.flow.naam, "nl"));
    } else {
      result = [...result].sort(
        (a, b) => new Date(b.flow.createdAt).getTime() - new Date(a.flow.createdAt).getTime(),
      );
    }

    return result;
  }, [flowsWithUpdateFlag, query, filterSysteem, filterStatus, sortOrder]);

  const totalSystems = new Set(flows.flatMap((f) => f.systemen)).size;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10 lg:py-10 animate-fade-in">
        {/* Hero */}
        <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-hero mb-8">
          <div className="px-8 py-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                <Workflow className="w-4 h-4" />
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-primary">
                Automatiseringsportaal
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Flows</h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Overzicht van alle opgeslagen flows. Nieuwe flows maak je vanuit de Suggesties-tab door
              koppelingen te selecteren en daarna als flow op te slaan.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <StatBadge label="Flows" value={flows.length} />
              <StatBadge label="Automations" value={automations.length} />
              <StatBadge label="Systemen" value={totalSystems} />
            </div>
          </div>
        </header>

        <Tabs defaultValue="bevestigd" className="mt-4">
          <TabsList>
            <TabsTrigger value="bevestigd">Bevestigd</TabsTrigger>
            <TabsTrigger value="suggesties">Suggesties</TabsTrigger>
          </TabsList>

          <TabsContent value="bevestigd" className="mt-4">
            {/* Search + filters */}
            {flows.length > 0 && (
              <div className="card-elevated p-3 mb-6 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Zoek op naam of beschrijving…"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus-ring"
                  />
                </div>
                <select
                  value={filterSysteem}
                  onChange={(e) => setFilterSysteem(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus-ring"
                >
                  <option value="">Alle systemen</option>
                  {allSystems.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus-ring"
                >
                  <option value="">Alle statussen</option>
                  <option value="actief">Actief</option>
                  <option value="update">Update beschikbaar</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "recent" | "naam")}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus-ring"
                >
                  <option value="recent">Recent</option>
                  <option value="naam">Naam A–Z</option>
                </select>
              </div>
            )}

            {/* Grid */}
            {filteredFlows.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  {filteredFlows.length} flow{filteredFlows.length === 1 ? "" : "s"} gevonden
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filteredFlows.map(({ flow, hasUpdate }) => (
                    <FlowCard key={flow.id} flow={flow} autoMap={autoMap} hasUpdate={hasUpdate} />
                  ))}
                </div>
              </>
            ) : flows.length === 0 ? (
              <div className="card-elevated p-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Geen flows gevonden. Voeg koppelingen toe aan je automatiseringen om flows te detecteren.
                </p>
              </div>
            ) : (
              <div className="card-elevated p-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Geen flows gevonden met deze zoekopdracht.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="suggesties" className="mt-4">
            <FlowSuggestiesTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

const StatBadge = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl bg-card/80 backdrop-blur-sm border border-border px-4 py-2.5">
    <p className="text-xl font-semibold text-foreground tabular-nums leading-tight">{value}</p>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
  </div>
);
