import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useAutomatiseringen, useFlows, useAllConfirmedAutomationLinks, useCreateFlow } from "@/lib/hooks";
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
  const { data: automations = [] } = useAutomatiseringen();
  const { data: flows = [] } = useFlows();
  const { data: confirmedLinks = [] } = useAllConfirmedAutomationLinks();
  const createFlow = useCreateFlow();

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

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

  // Only show proposals that don't already match a saved flow exactly
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

  async function handleBevestig(automationIds: string[]): Promise<void> {
    setConfirmState({ automationIds, aiName: "", aiBeschrijving: "", aiError: false, loading: true });

    const autos = automationIds
      .map((id) => autoMap.get(id))
      .filter((a): a is Automatisering => a !== undefined);

    try {
      const result = await nameFlow(autos);
      setConfirmState((prev) =>
        prev ? { ...prev, aiName: result.naam, aiBeschrijving: result.beschrijving, loading: false } : null,
      );
    } catch {
      setConfirmState((prev) =>
        prev ? { ...prev, aiError: true, loading: false } : null,
      );
    }
  }

  async function handleRetryAi(): Promise<void> {
    if (!confirmState) return;
    setConfirmState((prev) => (prev ? { ...prev, aiError: false, loading: true } : null));

    const autos = confirmState.automationIds
      .map((id) => autoMap.get(id))
      .filter((a): a is Automatisering => a !== undefined);

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

    const autos = confirmState.automationIds
      .map((id) => autoMap.get(id))
      .filter((a): a is Automatisering => a !== undefined);
    const systemen = [...new Set(autos.flatMap((a) => a.systemen))] as Systeem[];

    try {
      await createFlow.mutateAsync({ naam, beschrijving, systemen, automationIds: confirmState.automationIds });
      setConfirmState(null);
      toast.success("Flow opgeslagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  }

  const isEmpty = newProposals.length === 0 && flows.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Flows</h1>
      </div>

      {newProposals.length > 0 && (
        <div className="mb-8">
          <h2 className="label-uppercase mb-3">Voorstellen</h2>
          <div className="space-y-2">
            {newProposals.map((proposal) => {
              const names = proposal.automationIds.map((id) => autoMap.get(id)?.naam ?? id);
              return (
                <div
                  key={proposal.automationIds.join("|")}
                  className="border border-border rounded-lg p-4 bg-card flex items-center justify-between gap-4"
                >
                  <p className="text-sm text-muted-foreground truncate">{names.join(" → ")}</p>
                  <button
                    className="text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shrink-0"
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

      {flowsWithUpdateFlag.length > 0 && (
        <div>
          <h2 className="label-uppercase mb-3">Flows</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {flowsWithUpdateFlag.map(({ flow, hasUpdate }) => (
              <FlowCard key={flow.id} flow={flow} hasUpdate={hasUpdate} />
            ))}
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Geen flows gevonden. Voeg koppelingen toe aan je automatiseringen om flows te detecteren.
        </div>
      )}

      {confirmState && !confirmState.loading && (
        <FlowConfirmDialog
          automations={confirmState.automationIds
            .map((id) => autoMap.get(id)!)
            .filter(Boolean)}
          initialName={confirmState.aiName}
          initialBeschrijving={confirmState.aiBeschrijving}
          aiError={confirmState.aiError}
          onRetryAi={handleRetryAi}
          onSave={handleSave}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {confirmState?.loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20">
          <div className="bg-card border border-border rounded-xl px-6 py-4 text-sm">
            Naam genereren...
          </div>
        </div>
      )}
    </div>
  );
}
