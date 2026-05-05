import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
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

const CATEGORIE_COLORS: Record<string, string> = {
  "HubSpot Workflow": "bg-blue-50 text-blue-600",
  "GitLab Script": "bg-green-50 text-green-700",
  "Zapier Zap": "bg-yellow-50 text-yellow-700",
};

function CategorieBadge({ categorie }: { categorie: string }) {
  const cls = CATEGORIE_COLORS[categorie] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`${cls} rounded px-1.5 py-0.5 text-[10px]`}>{categorie}</span>
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
  const nodeStepLabels = new Map(group.nodes.map((node, index) => [node.id, stepLabel(index)]));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
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
          <MiniChain group={group} />
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
            <CategorieBadge categorie={s.fromCategorie} />
            <span>{s.fromNaam}</span>
            <span className="text-muted-foreground">naar</span>
            <CategorieBadge categorie={s.toCategorie} />
            <span>{s.toNaam}</span>
          </DialogTitle>
          <DialogDescription>
            Bekijk waarom deze koppeling wordt voorgesteld en bevestig of verwerp de suggestie.
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
            categorie={s.fromCategorie}
            automation={from}
          />
          <AutomatiseringCard
            label="Naar"
            naam={s.toNaam}
            categorie={s.toCategorie}
            automation={to}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => onVerwerp(s)}
          >
            Verwerpen
          </Button>
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
                Bevestigen...
              </>
            ) : (
              "Bevestigen"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AutomatiseringCard({
  label,
  naam,
  categorie,
  automation,
}: {
  label: string;
  naam: string;
  categorie: string;
  automation: { doel: string; trigger: string; systemen: string[] } | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</span>
        <CategorieBadge categorie={categorie} />
      </div>
      <p className="font-medium text-sm text-foreground leading-snug">{naam}</p>
      {automation ? (
        <dl className="space-y-1.5 text-xs text-muted-foreground">
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
          {automation.systemen.length > 0 && (
            <div>
              <dt className="font-medium text-foreground/70">Systemen</dt>
              <dd className="mt-0.5 flex flex-wrap gap-1">
                {automation.systemen.map((sys) => (
                  <span key={sys} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{sys}</span>
                ))}
              </dd>
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
    event.stopPropagation();
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
    event.stopPropagation();
  }

  return (
    <div
      ref={scrollRef}
      className="w-full cursor-grab select-none overflow-x-auto pb-2 pr-2 active:cursor-grabbing [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
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
            <span className="max-w-[220px] truncate rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground">
              <span className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                {stepLabel(index)}
              </span>
              {node.naam}
            </span>
            {next && (
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

function stepLabel(index: number): string {
  let value = "";
  let n = index;
  do {
    value = String.fromCharCode(65 + (n % 26)) + value;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return value;
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
        className="min-w-0 space-y-1 text-left transition-opacity hover:opacity-70"
        onClick={onOpenDetail}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
            {fromStep}
          </span>
          <CategorieBadge categorie={s.fromCategorie} />
          <span className="truncate font-medium text-foreground">{s.fromNaam}</span>
          <span className="text-xs text-muted-foreground">naar</span>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
            {toStep}
          </span>
          <CategorieBadge categorie={s.toCategorie} />
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
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-white bg-green-600 text-white shadow-sm">
              <CheckCircle2 className="h-3.5 w-3.5" />
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
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Bevestigen mislukt"),
                },
              )
            }
          >
            Bevestig
          </Button>
        </div>
      )}
    </div>
  );
}

