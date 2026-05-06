import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Loader2, XCircle } from "lucide-react";
import { useState, useMemo, useRef, type ReactNode, type PointerEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useAccepteerFlowKandidaat,
  useBevestigFlowSuggestie,
  useFlowSuggesties,
  useOngedaanBevestigFlowSuggestie,
  useOngedaanVerwerpFlowSuggestie,
  useVerwerpFlowSuggestie,
} from "@/lib/queryHooks/automationLinks";
import { useCreateFlow } from "@/lib/queryHooks/flows";
import { nameFlow } from "@/lib/storage/flows";
import { invokeEdgeFunction } from "@/lib/storage/edgeFunctions";
import { FlowConfirmDialog } from "@/components/FlowConfirmDialog";
import type { Automatisering, Systeem } from "@/lib/types";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import { groupFlowSuggesties } from "@/lib/flowSuggestionGroups";
import type { FlowSuggestionGroup } from "@/lib/flowSuggestionGroups";
import { useAutomatiseringen } from "@/lib/queryHooks/automations";

interface AcceptState {
  group: FlowSuggestionGroup;
  automationIds: string[];
  aiName: string;
  aiBeschrijving: string;
  aiError: boolean;
  loading: boolean;
  saving: boolean;
}

type DetectProgress = {
  label: string;
  current: number;
  total: number;
};

type DetectMetaResult = {
  aiTotal: number;
  batches: number;
};

export function FlowSuggestiesTab() {
  const queryClient = useQueryClient();
  const { data: suggesties = [], isLoading } = useFlowSuggesties();
  const bevestig = useBevestigFlowSuggestie();
  const verwerp = useVerwerpFlowSuggestie();
  const ongedaanBevestig = useOngedaanBevestigFlowSuggestie();
  const ongedaanVerwerp = useOngedaanVerwerpFlowSuggestie();
  const { data: automations = [] } = useAutomatiseringen();
  const createFlow = useCreateFlow();
  const accepteerKandidaat = useAccepteerFlowKandidaat();
  const autoMap = useMemo(
    () => new Map(automations.map((a) => [a.id, a])),
    [automations],
  );

  const [selected, setSelected] = useState<FlowSuggestie | null>(null);

  const [acceptState, setAcceptState] = useState<AcceptState | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [progress, setProgress] = useState<DetectProgress | null>(null);

  const groups = useMemo(() => groupFlowSuggesties(suggesties), [suggesties]);

  async function handleDetect() {
    const batchSize = 10;
    setIsDetecting(true);
    setProgress({ label: "Voorbereiden", current: 0, total: 1 });

    try {
      const meta = await invokeEdgeFunction<DetectMetaResult>("detect-flow-links", {
        mode: "meta",
        limit: batchSize,
      });
      const totalBatches = Math.max(1, meta.batches || Math.ceil((meta.aiTotal ?? 0) / batchSize));
      const totalSteps = 1 + totalBatches;

      setProgress({ label: "Webhook matches controleren", current: 0, total: totalSteps });
      await invokeEdgeFunction("detect-flow-links", { mode: "webhook", limit: batchSize });

      for (let batch = 0; batch < totalBatches; batch += 1) {
        setProgress({
          label: `AI batch ${batch + 1} van ${totalBatches}`,
          current: 1 + batch,
          total: totalSteps,
        });
        await invokeEdgeFunction("detect-flow-links", {
          mode: "ai",
          offset: batch * batchSize,
          limit: batchSize,
        });
      }

      setProgress({ label: "Suggesties verversen", current: totalSteps, total: totalSteps });
      await queryClient.invalidateQueries({ queryKey: ["flowSuggesties"] });
      toast.success("Suggesties gedetecteerd");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Detectie mislukt");
    } finally {
      setIsDetecting(false);
      setProgress(null);
    }
  }

  const webhookSuggesties = suggesties.filter(
    (s) => s.zekerheid === "webhook" && !s.confirmed && !s.rejected,
  );

  async function handleAccepteer(group: FlowSuggestionGroup): Promise<void> {
    const confirmedSuggesties = group.suggestions.filter((s) => s.confirmed);
    const confirmedNodeIds = new Set([
      ...confirmedSuggesties.map((s) => s.fromId),
      ...confirmedSuggesties.map((s) => s.toId),
    ]);
    const orderedIds = group.nodes
      .filter((n) => confirmedNodeIds.has(n.id))
      .map((n) => n.id);
    const autos = orderedIds
      .map((id) => autoMap.get(id))
      .filter((a): a is Automatisering => a !== undefined);

    setAcceptState({
      group,
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
        .map((id) => autoMap.get(id))
        .filter((a): a is Automatisering => a !== undefined);
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
        .map((id) => autoMap.get(id))
        .filter((a): a is Automatisering => a !== undefined);
      const systemen = [...new Set(autos.flatMap((a) => a.systemen))] as Systeem[];
      const newFlow = await createFlow.mutateAsync({
        naam,
        beschrijving,
        automationIds: acceptState.automationIds,
        systemen,
      });
      await accepteerKandidaat.mutateAsync({
        nodeIds: acceptState.group.nodes.map((n) => n.id),
        flowId: newFlow.id,
      });
      toast.success(`Flow "${naam}" aangemaakt`);
      setAcceptState(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
      setAcceptState((prev) => (prev ? { ...prev, saving: false } : null));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {suggesties.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {suggesties.length} suggesties
            </span>
          )}
          {webhookSuggesties.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
              {webhookSuggesties.length} hoge zekerheid
            </span>
          )}
          {suggesties.filter((s) => s.zekerheid === "ai" && !s.confirmed && !s.rejected).length > 0 && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">
              {suggesties.filter((s) => s.zekerheid === "ai" && !s.confirmed && !s.rejected).length} AI-suggestie
            </span>
          )}
        </div>
        <Button size="sm" onClick={handleDetect} disabled={isDetecting}>
          {isDetecting ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Detecteren...
            </>
          ) : (
            "Detecteer suggesties"
          )}
        </Button>
      </div>

      {isDetecting && progress && <DetectionProgress progress={progress} />}

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && suggesties.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <p>Geen suggesties gevonden.</p>
          <p className="mt-1 text-sm">Klik "Detecteer suggesties" om te starten.</p>
        </div>
      )}

      {groups.map((group) => (
        <FlowKandidaatCard
          key={group.id}
          group={group}
          onBevestig={bevestig}
          onVerwerp={verwerp}
          onOngedaanBevestig={ongedaanBevestig}
          onOngedaanVerwerp={ongedaanVerwerp}
          onOpenDetail={setSelected}
          onAccepteer={handleAccepteer}
        />
      ))}

      {selected && (
        <SuggestieDetailDialog
          suggestie={selected}
          onClose={() => setSelected(null)}
          onBevestig={(s) => {
            bevestig.mutate({ fromId: s.fromId, toId: s.toId }, {
              onSuccess: () => setSelected(null),
            });
          }}
          onVerwerp={(s) => {
            verwerp.mutate({ fromId: s.fromId, toId: s.toId }, {
              onSuccess: () => setSelected(null),
            });
          }}
          bevestigPending={bevestig.isPending}
          verwerpPending={verwerp.isPending}
        />
      )}

      {acceptState && !acceptState.loading && (
        <FlowConfirmDialog
          automations={acceptState.automationIds
            .map((id) => autoMap.get(id))
            .filter((a): a is Automatisering => a !== undefined)}
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

function DetectionProgress({ progress }: { progress: DetectProgress }) {
  const percentage = Math.min(100, Math.max(6, Math.round((progress.current / Math.max(1, progress.total)) * 100)));

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-foreground">{progress.label}</span>
        <span className="shrink-0 text-muted-foreground">
          {Math.min(progress.current, progress.total)} / {progress.total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  hubspot: "HubSpot",
  gitlab: "GitLab",
  custom: "Custom",
  manual: "Handmatig",
  import: "Import",
};

const SOURCE_STYLES: Record<string, string> = {
  hubspot: "bg-orange-50 text-orange-700",
  gitlab: "bg-purple-50 text-purple-700",
  custom: "bg-blue-50 text-blue-700",
  manual: "bg-slate-100 text-slate-700",
  import: "bg-slate-100 text-slate-700",
};

function formatSource(source?: string | null): string {
  if (!source) return "Onbekende bron";
  const normalized = source.toLowerCase();
  return SOURCE_LABELS[normalized] ?? source;
}

function SourceBadge({ source }: { source?: string | null }) {
  const normalized = source?.toLowerCase() ?? "";
  const cls = SOURCE_STYLES[normalized] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`${cls} inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold`}>
      {formatSource(source)}
    </span>
  );
}

function FlowKandidaatCard({
  group,
  onBevestig,
  onVerwerp,
  onOngedaanBevestig,
  onOngedaanVerwerp,
  onOpenDetail,
  onAccepteer,
}: {
  group: FlowSuggestionGroup;
  onBevestig: ReturnType<typeof useBevestigFlowSuggestie>;
  onVerwerp: ReturnType<typeof useVerwerpFlowSuggestie>;
  onOngedaanBevestig: ReturnType<typeof useOngedaanBevestigFlowSuggestie>;
  onOngedaanVerwerp: ReturnType<typeof useOngedaanVerwerpFlowSuggestie>;
  onOpenDetail: (suggestie: FlowSuggestie) => void;
  onAccepteer: (group: FlowSuggestionGroup) => void;
}) {
  const [open, setOpen] = useState(false);
  const first = group.nodes[0];
  const last = group.nodes[group.nodes.length - 1];
  const nodeStepLabels = new Map(group.nodes.map((node, index) => [node.id, String(index + 1)]));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        aria-label={`${open ? "Sluit details" : "Open details"} voor ${first?.naam ?? "flow kandidaat"}`}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-6 px-5 py-4 text-left transition-colors hover:bg-muted/30"
        onClick={() => setOpen((value) => !value)}
      >
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {first?.naam ?? "Onbekende start"} naar {last?.naam ?? "onbekend einde"}
            </span>
            <CountBadge>{group.nodes.length} automations</CountBadge>
            <CountBadge>{group.suggestions.length} koppelingen</CountBadge>
            <StructureBadge type={group.structureType} />
            {group.webhookCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                {group.webhookCount} webhook
              </span>
            )}
            {group.aiCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-700">
                {group.aiCount} AI
              </span>
            )}
          </div>
          <FlowStructurePreview group={group} />
        </div>
        <div className="mt-0.5 grid shrink-0 grid-cols-[8rem_4.25rem] items-center gap-2">
          <span className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-muted px-2 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {group.confirmedCount}/{group.totalCount} geselecteerd
          </span>
          <span className="inline-flex h-7 items-center justify-center rounded-md border border-border px-2 text-[10px] font-semibold text-muted-foreground">
            {open ? "Sluiten" : "Details"}
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="border-b border-border bg-muted/20 px-4 py-3">
            <p className="text-xs font-semibold text-foreground">
              Structuur: <span className="font-normal text-muted-foreground">{group.structureSummary}</span>
            </p>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[980px] divide-y divide-border">
              {group.suggestions.map((suggestie) => (
                <SuggestieRij
                  key={`${suggestie.fromId}-${suggestie.toId}`}
                  suggestie={suggestie}
                  fromStep={nodeStepLabels.get(suggestie.fromId) ?? "?"}
                  toStep={nodeStepLabels.get(suggestie.toId) ?? "?"}
                  onBevestig={onBevestig}
                  onVerwerp={onVerwerp}
                  onOngedaanBevestig={onOngedaanBevestig}
                  onOngedaanVerwerp={onOngedaanVerwerp}
                  onOpenDetail={() => onOpenDetail(suggestie)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="grid min-h-[3.5rem] grid-cols-[minmax(0,1fr)_9.75rem] items-center gap-3 border-t border-border bg-muted/20 px-4 py-3">
          <p className="truncate text-xs text-muted-foreground">
            Selecteer koppelingen en sla daarna op als flow.
          </p>
          <button
            type="button"
            className="inline-flex h-8 w-full items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={group.confirmedCount === 0}
            title={group.confirmedCount === 0 ? "Selecteer eerst minimaal een koppeling" : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onAccepteer(group);
            }}
          >
            Accepteer als Flow
          </button>
        </div>
      )}
    </div>
  );
}

function SuggestieDetailDialog({
  suggestie: s,
  onClose,
  onBevestig,
  onVerwerp,
  bevestigPending,
  verwerpPending,
}: {
  suggestie: FlowSuggestie;
  onClose: () => void;
  onBevestig: (s: FlowSuggestie) => void;
  onVerwerp: (s: FlowSuggestie) => void;
  bevestigPending: boolean;
  verwerpPending: boolean;
}) {
  const { data: automations = [] } = useAutomatiseringen();
  const from = automations.find((a) => a.id === s.fromId);
  const to = automations.find((a) => a.id === s.toId);
  const pending = bevestigPending || verwerpPending;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap text-base">
            <SourceBadge source={s.fromSource} />
            <span>{s.fromNaam}</span>
            <span className="text-muted-foreground">naar</span>
            <SourceBadge source={s.toSource} />
            <span>{s.toNaam}</span>
          </DialogTitle>
          <DialogDescription>
            Bekijk waarom deze koppeling wordt voorgesteld en selecteer of verwerp de suggestie.
          </DialogDescription>
        </DialogHeader>

        <div className={[
          "rounded-lg px-4 py-3 text-sm",
          s.zekerheid === "webhook"
            ? "bg-green-50 border border-green-200"
            : "bg-yellow-50 border border-yellow-200",
        ].join(" ")}>
          <p className={[
            "text-[10px] font-semibold uppercase tracking-wide mb-1",
            s.zekerheid === "webhook" ? "text-green-700" : "text-yellow-700",
          ].join(" ")}>
            {s.zekerheid === "webhook" ? "Hoge zekerheid, webhook match" : "AI-suggestie"}
          </p>
          {s.zekerheid === "webhook" ? (
            <p className="text-foreground">
              Webhook van <strong>{s.fromNaam}</strong> eindigt op endpoint{" "}
              <code className="rounded bg-white/70 px-1.5 py-0.5 text-[11px] border border-green-200">
                {s.redenering}
              </code>{" "}
              van <strong>{s.toNaam}</strong>.
            </p>
          ) : (
            <p className="text-foreground italic">{s.redenering}</p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <AutomatiseringCard
            label="Van"
            naam={s.fromNaam}
            source={s.fromSource}
            automation={from}
          />
          <AutomatiseringCard
            label="Naar"
            naam={s.toNaam}
            source={s.toSource}
            automation={to}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
            disabled={pending}
            onClick={() => onBevestig(s)}
          >
            {bevestigPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Selecteren...
              </>
            ) : (
              "Selecteren"
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => onVerwerp(s)}
          >
            Verwerpen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AutomatiseringCard({
  label,
  naam,
  source,
  automation,
}: {
  label: string;
  naam: string;
  source: string | null;
  automation: { doel: string; trigger: string; source?: string | null } | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</span>
        <SourceBadge source={source} />
      </div>
      <p className="font-medium text-sm text-foreground leading-snug">{naam}</p>
      {automation ? (
        <dl className="space-y-1.5 text-xs text-muted-foreground">
          <div>
            <dt className="font-medium text-foreground/70">Bron</dt>
            <dd className="mt-0.5">
              <SourceBadge source={automation.source ?? source} />
            </dd>
          </div>
          {automation.doel && (
            <div>
              <dt className="font-medium text-foreground/70">Doel</dt>
              <dd className="mt-0.5 leading-relaxed">{automation.doel}</dd>
            </div>
          )}
          {automation.trigger && (
            <div>
              <dt className="font-medium text-foreground/70">Trigger</dt>
              <dd className="mt-0.5 leading-relaxed">{automation.trigger}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground italic">Details niet beschikbaar</p>
      )}
    </div>
  );
}

function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
      {children}
    </span>
  );
}

function StructureBadge({ type }: { type: FlowSuggestionGroup["structureType"] }) {
  const styles: Record<FlowSuggestionGroup["structureType"], string> = {
    lineair: "bg-blue-50 text-blue-700",
    vertakt: "bg-purple-50 text-purple-700",
    cluster: "bg-muted text-muted-foreground",
  };

  return (
    <span className={`${styles[type]} inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold`}>
      {type === "lineair" ? "Lineair" : type === "vertakt" ? "Vertakt" : "Cluster"}
    </span>
  );
}

type FlowNode = FlowSuggestionGroup["nodes"][number];

function getStepLabels(group: FlowSuggestionGroup): Map<string, string> {
  return new Map(group.nodes.map((node, index) => [node.id, String(index + 1)]));
}

function FlowStructurePreview({ group }: { group: FlowSuggestionGroup }) {
  if (group.structureType === "lineair") {
    return (
      <div className="space-y-2">
        <MiniChain group={group} />
        <p className="text-[10px] font-medium text-muted-foreground">
          Stap-voor-stap volgorde op basis van directe koppelingen.
        </p>
      </div>
    );
  }

  if (group.structureType === "vertakt") {
    return <BranchPreview group={group} />;
  }

  return <RelationPreview group={group} />;
}

function BranchPreview({ group }: { group: FlowSuggestionGroup }) {
  const stepLabels = getStepLabels(group);
  const nodeById = new Map(group.nodes.map((node) => [node.id, node]));
  const incoming = new Map(group.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(group.nodes.map((node) => [node.id, 0]));

  for (const suggestion of group.suggestions) {
    outgoing.set(suggestion.fromId, (outgoing.get(suggestion.fromId) ?? 0) + 1);
    incoming.set(suggestion.toId, (incoming.get(suggestion.toId) ?? 0) + 1);
  }

  const incomingFocus = [...incoming.entries()].sort((a, b) => b[1] - a[1])[0];
  const outgoingFocus = [...outgoing.entries()].sort((a, b) => b[1] - a[1])[0];
  const isManyToOne = (incomingFocus?.[1] ?? 0) >= (outgoingFocus?.[1] ?? 0);
  const focusId = isManyToOne ? incomingFocus?.[0] : outgoingFocus?.[0];
  const focusNode = focusId ? nodeById.get(focusId) : undefined;

  if (!focusNode) return <RelationPreview group={group} />;

  const relatedIds = isManyToOne
    ? group.suggestions.filter((s) => s.toId === focusNode.id).map((s) => s.fromId)
    : group.suggestions.filter((s) => s.fromId === focusNode.id).map((s) => s.toId);
  const relatedNodes = relatedIds
    .map((id) => nodeById.get(id))
    .filter((node): node is FlowNode => node !== undefined);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-semibold text-foreground">
          {isManyToOne ? "Meerdere bronnen komen samen in" : "Een bron stuurt naar meerdere doelen"}
        </span>
        <span className="text-muted-foreground">{group.structureSummary}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-start">
        <BranchNodeList
          label={isManyToOne ? "Bronnen" : "Bron"}
          nodes={isManyToOne ? relatedNodes : [focusNode]}
          stepLabels={stepLabels}
        />
        <span className="hidden h-8 items-center justify-center rounded-full bg-background px-3 text-xs font-semibold text-muted-foreground md:inline-flex">
          →
        </span>
        <BranchNodeList
          label={isManyToOne ? "Doel" : "Doelen"}
          nodes={isManyToOne ? [focusNode] : relatedNodes}
          stepLabels={stepLabels}
        />
      </div>
    </div>
  );
}

function BranchNodeList({
  label,
  nodes,
  stepLabels,
}: {
  label: string;
  nodes: FlowNode[];
  stepLabels: Map<string, string>;
}) {
  const visibleNodes = nodes.slice(0, 5);
  const hiddenCount = nodes.length - visibleNodes.length;

  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {visibleNodes.map((node) => (
          <span
            key={node.id}
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground"
          >
            <StepBadge>{stepLabels.get(node.id) ?? "?"}</StepBadge>
            <SourceBadge source={node.source} />
            <span className="min-w-0 truncate">{node.naam}</span>
          </span>
        ))}
        {hiddenCount > 0 && (
          <span className="inline-flex items-center rounded-lg bg-background px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
            +{hiddenCount} meer
          </span>
        )}
      </div>
    </div>
  );
}

function StepBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
      {children}
    </span>
  );
}

function MiniChain({ group }: { group: FlowSuggestionGroup }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    scrollLeft: 0,
  });

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const container = scrollRef.current;
    if (!container) return;
    dragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      scrollLeft: container.scrollLeft,
    };
    container.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const container = scrollRef.current;
    const drag = dragRef.current;
    if (!container || !drag.active) return;
    const delta = event.clientX - drag.startX;
    if (Math.abs(delta) > 3) drag.moved = true;
    container.scrollLeft = drag.scrollLeft - delta;
    event.preventDefault();
    event.stopPropagation();
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const container = scrollRef.current;
    dragRef.current.active = false;
    container?.releasePointerCapture(event.pointerId);
  }

  return (
    <div
      ref={scrollRef}
      className="w-full cursor-grab select-none overflow-x-auto pb-2 pr-2 active:cursor-grabbing [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      onClick={(event) => {
        if (dragRef.current.moved) {
          event.preventDefault();
          event.stopPropagation();
          dragRef.current.moved = false;
        }
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="flex min-w-max items-center gap-2">
      {group.nodes.map((node, index) => {
        const next = group.nodes[index + 1];
        const edge = next
          ? group.suggestions.find((s) => s.fromId === node.id && s.toId === next.id)
          : undefined;
        return (
          <div key={node.id} className="flex items-center gap-2 shrink-0">
            <span className="inline-flex max-w-[280px] items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground">
              <StepBadge>{index + 1}</StepBadge>
              <SourceBadge source={node.source} />
              <span className="min-w-0 truncate">{node.naam}</span>
            </span>
            {next && group.structureType === "lineair" && (
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  edge?.zekerheid === "webhook"
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700",
                ].join(" ")}
              >
                {edge?.zekerheid === "webhook" ? "webhook" : "AI"}
              </span>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

function RelationPreview({ group }: { group: FlowSuggestionGroup }) {
  const nodeStepLabels = getStepLabels(group);
  const visibleRelations = group.suggestions.slice(0, 6);
  const hiddenCount = group.suggestions.length - visibleRelations.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className="font-semibold text-foreground/70">Koppelingen:</span>
      {visibleRelations.map((suggestion) => (
        <span
          key={`${suggestion.fromId}-${suggestion.toId}`}
          className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 font-semibold text-foreground/70"
        >
          {nodeStepLabels.get(suggestion.fromId) ?? "?"} → {nodeStepLabels.get(suggestion.toId) ?? "?"}
        </span>
      ))}
      {hiddenCount > 0 && <span>+{hiddenCount} meer</span>}
    </div>
  );
}

function SuggestieRij({
  suggestie: s,
  fromStep,
  toStep,
  onBevestig,
  onVerwerp,
  onOngedaanBevestig,
  onOngedaanVerwerp,
  onOpenDetail,
}: {
  suggestie: FlowSuggestie;
  fromStep: string;
  toStep: string;
  onBevestig: ReturnType<typeof useBevestigFlowSuggestie>;
  onVerwerp: ReturnType<typeof useVerwerpFlowSuggestie>;
  onOngedaanBevestig: ReturnType<typeof useOngedaanBevestigFlowSuggestie>;
  onOngedaanVerwerp: ReturnType<typeof useOngedaanVerwerpFlowSuggestie>;
  onOpenDetail: () => void;
}) {
  const anyPending =
    onBevestig.isPending ||
    onVerwerp.isPending ||
    onOngedaanBevestig.isPending ||
    onOngedaanVerwerp.isPending;

  return (
    <div
      className={[
        "grid grid-cols-[minmax(0,1fr)_12rem] items-start gap-4 p-3.5 transition-colors",
        s.confirmed ? "bg-green-50/70" : "",
        s.rejected ? "bg-red-50/50" : "",
      ].join(" ")}
    >
      <button
        type="button"
        className="min-w-0 space-y-2 text-left transition-opacity hover:opacity-70"
        onClick={onOpenDetail}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex h-7 items-center rounded-full bg-primary/10 px-2.5 text-xs font-bold text-primary">
            {fromStep} → {toStep}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Van</span>
          <SourceBadge source={s.fromSource} />
          <span className="truncate font-medium text-foreground">{s.fromNaam}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-[4.4rem] text-sm">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Naar</span>
          <SourceBadge source={s.toSource} />
          <span className="truncate font-medium text-foreground">{s.toNaam}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {s.zekerheid === "webhook" ? (
            <>
              Webhook{" "}
              <code className="rounded bg-muted px-1 text-[10px]">{s.redenering}</code>
              {" "}exact match op endpoint
            </>
          ) : (
            <>AI: <em>{s.redenering}</em></>
          )}
        </p>
      </button>

      {s.confirmed ? (
        <div className="flex w-full items-center justify-end gap-2">
          <span className="inline-flex h-8 min-w-[7.25rem] items-center justify-center gap-1.5 rounded-full bg-green-100 px-2.5 text-xs font-semibold text-green-700">
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-white shadow-sm ring-2 ring-white">
              <Check className="h-3.5 w-3.5 stroke-[3]" />
            </span>
            Geselecteerd
          </span>
          <button
            type="button"
            className="inline-flex h-8 min-w-[6.75rem] items-center justify-center rounded-lg border border-green-200 bg-white px-3 text-xs font-semibold text-green-700 shadow-sm transition-colors hover:bg-green-50 disabled:opacity-50"
            disabled={anyPending}
            onClick={() =>
              onOngedaanBevestig.mutate(
                { fromId: s.fromId, toId: s.toId },
                { onError: (e) => toast.error(e instanceof Error ? e.message : "Ongedaan maken mislukt") },
              )
            }
          >
            Ongedaan
          </button>
        </div>
      ) : s.rejected ? (
        <div className="flex w-full items-center justify-end gap-2">
          <XCircle className="h-4 w-4 text-red-500" />
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
            disabled={anyPending}
            onClick={() =>
              onOngedaanVerwerp.mutate(
                { fromId: s.fromId, toId: s.toId },
                { onError: (e) => toast.error(e instanceof Error ? e.message : "Ongedaan maken mislukt") },
              )
            }
          >
            Ongedaan maken
          </button>
        </div>
      ) : (
        <div className="flex w-full justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
            disabled={anyPending}
            onClick={() =>
              onBevestig.mutate(
                { fromId: s.fromId, toId: s.toId },
                {
                  onSuccess: () => toast.success("Koppeling geselecteerd"),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Selecteren mislukt"),
                },
              )
            }
          >
            Selecteer
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={anyPending}
            onClick={() =>
              onVerwerp.mutate(
                { fromId: s.fromId, toId: s.toId },
                { onError: (e) => toast.error(e instanceof Error ? e.message : "Verwerpen mislukt") },
              )
            }
          >
            Verwerp
          </Button>
        </div>
      )}
    </div>
  );
}

