import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Search, Workflow } from "lucide-react";
import {
  useAutomatiseringen,
  useFlows,
  useAllConfirmedAutomationLinks,
  useCreateFlow,
} from "@/lib/hooks";
import { nameFlow } from "@/lib/supabaseStorage";
import { detectFlows } from "@/lib/detectFlows";
import type { Automatisering, Systeem } from "@/lib/types";
import { FlowCard } from "@/components/FlowCard";
import { FlowConfirmDialog } from "@/components/FlowConfirmDialog";

interface ConfirmState {
  automationIds: string[];
  aiName: string;
  aiBeschrijving: string;
  aiError: boolean;
  loading: boolean;
}

export default function Flows(): React.ReactNode {
  const { data: automations = [], refetch: refetchAutomations } = useAutomatiseringen();
  const { data: flows = [] } = useFlows();
  const { data: confirmedLinks = [] } = useAllConfirmedAutomationLinks();
  const createFlow = useCreateFlow();

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
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

  const savedFlowSets = useMemo(
    () => flows.map((f) => new Set(f.automationIds)),
    [flows],
  );

  const newProposals = useMemo(
    () =>
      proposals.filter((p) => {
        const pSet = new Set(p.automationIds);
        return !savedFlowSets.some(
          (fSet) => fSet.size === pSet.size && [...pSet].every((id) => fSet.has(id)),
        );
      }),
    [proposals, savedFlowSets],
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

  async function handleBevestig(automationIds: string[]): Promise<void> {
    setConfirmState({ automationIds, aiName: "", aiBeschrijving: "", aiError: false, loading: true });
    const autos = automationIds.map((id) => autoMap.get(id)).filter((a): a is Automatisering => a !== undefined);
    try {
      const result = await nameFlow(autos);
      setConfirmState((prev) =>
        prev ? { ...prev, aiName: result.naam, aiBeschrijving: result.beschrijving, loading: false } : null,
      );
    } catch {
      setConfirmState((prev) => (prev ? { ...prev, aiError: true, loading: false } : null));
    }
  }

  async function handleRetryAi(): Promise<void> {
    if (!confirmState) return;
    setConfirmState((prev) => (prev ? { ...prev, aiError: false, loading: true } : null));
    const autos = confirmState.automationIds.map((id) => autoMap.get(id)).filter((a): a is Automatisering => a !== undefined);
    try {
      const result = await nameFlow(autos);
      setConfirmState((prev) =>
        prev ? { ...prev, aiName: result.naam, aiBeschrijving: result.beschrijving, loading: false } : null,
      );
    } catch {
      setConfirmState((prev) => (prev ? { ...prev, aiError: true, loading: false } : null));
    }
  }

  async function handleSave(naam: string, beschrijving: string): Promise<void> {
    if (!confirmState) return;
    const autos = confirmState.automationIds.map((id) => autoMap.get(id)).filter((a): a is Automatisering => a !== undefined);
    const systemen = [...new Set(autos.flatMap((a) => a.systemen))] as Systeem[];
    try {
      await createFlow.mutateAsync({ naam, beschrijving, systemen, automationIds: confirmState.automationIds });
      setConfirmState(null);
      toast.success("Flow opgeslagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  }

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
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">Flows</h1>
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                  Overzicht van alle gedetecteerde flows. Elke flow is een keten van automations die
                  samenwerken via koppelingen.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:border-primary/40 transition-colors focus-ring"
                onClick={() => refetchAutomations()}
              >
                Detecteer flows
              </button>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <StatBadge label="Flows" value={flows.length} />
              <StatBadge label="Automations" value={automations.length} />
              <StatBadge label="Systemen" value={totalSystems} />
            </div>
          </div>
        </header>

        {/* Proposals */}
        {newProposals.length > 0 && (
          <div className="mb-8">
            <p className="label-uppercase mb-3">Nieuwe voorstellen</p>
            <div className="space-y-2">
              {newProposals.map((proposal) => {
                const names = proposal.automationIds.map((id) => autoMap.get(id)?.naam ?? id);
                return (
                  <div
                    key={proposal.automationIds.join("|")}
                    className="card-elevated p-4 flex items-center justify-between gap-4"
                  >
                    <p className="text-sm text-muted-foreground truncate">{names.join(" → ")}</p>
                    <button
                      type="button"
                      className="text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shrink-0 focus-ring"
                      onClick={() => handleBevestig(proposal.automationIds)}
                    >
                      Bevestig
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
      </div>

      {confirmState && !confirmState.loading && (
        <FlowConfirmDialog
          automations={confirmState.automationIds.map((id) => autoMap.get(id)!).filter(Boolean)}
          initialName={confirmState.aiName}
          initialBeschrijving={confirmState.aiBeschrijving}
          aiError={confirmState.aiError}
          onRetryAi={handleRetryAi}
          onSave={handleSave}
          onCancel={() => setConfirmState(null)}
          saving={createFlow.isPending}
        />
      )}

      {confirmState?.loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20">
          <div className="bg-card border border-border rounded-xl px-6 py-4 text-sm shadow-lg">
            Naam genereren...
          </div>
        </div>
      )}
    </div>
  );
}

const StatBadge = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl bg-card/80 backdrop-blur-sm border border-border px-4 py-2.5">
    <p className="text-xl font-semibold text-foreground tabular-nums leading-tight">{value}</p>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
  </div>
);
