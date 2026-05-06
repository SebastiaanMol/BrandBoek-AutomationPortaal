import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Workflow } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FlowConfirmDialog } from "@/components/FlowConfirmDialog";
import {
  FlowSuggestionVisualReview,
} from "@/components/FlowSuggestionVisualReview";
import { useAutomatiseringen } from "@/lib/queryHooks/automations";
import {
  useAccepteerFlowKandidaat,
  useFlowSuggesties,
} from "@/lib/queryHooks/automationLinks";
import { useCreateFlow } from "@/lib/queryHooks/flows";
import { groupFlowSuggesties } from "@/lib/flowSuggestionGroups";
import { nameFlow } from "@/lib/storage/flows";
import type { Automatisering, Systeem } from "@/lib/types";
import type { FlowSuggestionGroup } from "@/lib/flowSuggestionGroups";

interface AcceptState {
  group: FlowSuggestionGroup;
  automationIds: string[];
  aiName: string;
  aiBeschrijving: string;
  aiError: boolean;
  loading: boolean;
  saving: boolean;
}

function resolveGroupId(param: string | undefined): string {
  if (!param) return "";
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

function getSuggestionGroupTitle(group: FlowSuggestionGroup): string {
  return `${group.nodes[0]?.naam ?? "Flow kandidaat"} naar ${group.nodes[group.nodes.length - 1]?.naam ?? "onbekend einde"}`;
}

export default function FlowSuggestionDetail(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: suggesties = [], isLoading } = useFlowSuggesties();
  const { data: automations = [] } = useAutomatiseringen();
  const createFlow = useCreateFlow();
  const accepteerKandidaat = useAccepteerFlowKandidaat();
  const [acceptState, setAcceptState] = useState<AcceptState | null>(null);

  const groups = useMemo(() => groupFlowSuggesties(suggesties), [suggesties]);
  const groupId = resolveGroupId(id);
  const group = groups.find((candidate) => candidate.id === groupId);
  const autoMap = useMemo(
    () => new Map(automations.map((automation) => [automation.id, automation])),
    [automations],
  );

  async function handleAccepteer(groupToAccept: FlowSuggestionGroup): Promise<void> {
    const confirmedSuggesties = groupToAccept.suggestions.filter((s) => s.confirmed);
    const confirmedNodeIds = new Set([
      ...confirmedSuggesties.map((s) => s.fromId),
      ...confirmedSuggesties.map((s) => s.toId),
    ]);
    const orderedIds = groupToAccept.nodes
      .filter((node) => confirmedNodeIds.has(node.id))
      .map((node) => node.id);
    const autos = orderedIds
      .map((automationId) => autoMap.get(automationId))
      .filter((automation): automation is Automatisering => automation !== undefined);

    setAcceptState({
      group: groupToAccept,
      automationIds: orderedIds,
      aiName: "",
      aiBeschrijving: "",
      aiError: false,
      loading: true,
      saving: false,
    });

    try {
      const result = await nameFlow(autos);
      setAcceptState((prev) =>
        prev ? { ...prev, aiName: result.naam, aiBeschrijving: result.beschrijving, loading: false } : null,
      );
    } catch {
      setAcceptState((prev) => (prev ? { ...prev, aiError: true, loading: false } : null));
    }
  }

  async function handleRetryAi(): Promise<void> {
    if (!acceptState) return;
    setAcceptState((prev) => (prev ? { ...prev, aiError: false, loading: true } : null));
    try {
      const autos = acceptState.automationIds
        .map((automationId) => autoMap.get(automationId))
        .filter((automation): automation is Automatisering => automation !== undefined);
      const result = await nameFlow(autos);
      setAcceptState((prev) =>
        prev ? { ...prev, aiName: result.naam, aiBeschrijving: result.beschrijving, loading: false } : null,
      );
    } catch {
      setAcceptState((prev) => (prev ? { ...prev, aiError: true, loading: false } : null));
    }
  }

  async function handleSaveFlow(naam: string, beschrijving: string): Promise<void> {
    if (!acceptState) return;
    setAcceptState((prev) => (prev ? { ...prev, saving: true } : null));
    try {
      const autos = acceptState.automationIds
        .map((automationId) => autoMap.get(automationId))
        .filter((automation): automation is Automatisering => automation !== undefined);
      const systemen = [...new Set(autos.flatMap((automation) => automation.systemen))] as Systeem[];
      const newFlow = await createFlow.mutateAsync({
        naam,
        beschrijving,
        automationIds: acceptState.automationIds,
        systemen,
      });
      await accepteerKandidaat.mutateAsync({
        nodeIds: acceptState.group.nodes.map((node) => node.id),
        flowId: newFlow.id,
      });
      toast.success(`Flow "${naam}" aangemaakt`);
      setAcceptState(null);
      navigate(`/flows/${newFlow.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
      setAcceptState((prev) => (prev ? { ...prev, saving: false } : null));
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!group) {
    return <Navigate to="/flows" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-4 lg:px-10">
          <div className="min-w-0">
            <Link
              to="/flows"
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Terug naar flows
            </Link>
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Workflow className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                  Flow suggestie
                </p>
                <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
                  {getSuggestionGroupTitle(group)}
                </h1>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge>{group.nodes.length} automations</StatusBadge>
            <StatusBadge>{group.suggestions.length} koppelingen</StatusBadge>
            <StatusBadge>{group.confirmedCount}/{group.totalCount} geselecteerd</StatusBadge>
            <Button
              disabled={group.confirmedCount === 0}
              onClick={() => handleAccepteer(group)}
            >
              Accepteer als Flow
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col px-6 py-6 lg:px-10">
        <FlowSuggestionVisualReview
          group={group}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Selecteer de lijnen die echt bij deze flow horen. Pas daarna maak je er een officiële flow van.
              </p>
              <Button
                disabled={group.confirmedCount === 0}
                onClick={() => handleAccepteer(group)}
              >
                Accepteer als Flow
              </Button>
            </div>
          }
        />
      </main>

      {acceptState && !acceptState.loading && (
        <FlowConfirmDialog
          automations={acceptState.automationIds
            .map((automationId) => autoMap.get(automationId))
            .filter((automation): automation is Automatisering => automation !== undefined)}
          initialName={acceptState.aiName}
          initialBeschrijving={acceptState.aiBeschrijving}
          aiError={acceptState.aiError}
          onRetryAi={handleRetryAi}
          onSave={handleSaveFlow}
          onCancel={() => setAcceptState(null)}
          saving={acceptState.saving}
        />
      )}
    </div>
  );
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-8 items-center rounded-full bg-muted px-3 text-xs font-semibold text-muted-foreground">
      {children}
    </span>
  );
}
