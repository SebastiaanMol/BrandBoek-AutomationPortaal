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
import { useState } from "react";
import { toast } from "sonner";
import {
  useBevestigFlowSuggestie,
  useDetecteerSuggesties,
  useFlowSuggesties,
  useOngedaanBevestigFlowSuggestie,
  useOngedaanVerwerpFlowSuggestie,
  useVerwerpFlowSuggestie,
} from "@/lib/queryHooks/automationLinks";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import { groupFlowSuggesties } from "@/lib/flowSuggestionGroups";
import type { FlowSuggestionGroup } from "@/lib/flowSuggestionGroups";
import { useAutomatiseringen } from "@/lib/queryHooks/automations";

export function FlowSuggestiesTab() {
  const { data: suggesties = [], isLoading } = useFlowSuggesties();
  const detecteer = useDetecteerSuggesties();
  const bevestig = useBevestigFlowSuggestie();
  const verwerp = useVerwerpFlowSuggestie();
  const ongedaanBevestig = useOngedaanBevestigFlowSuggestie();
  const ongedaanVerwerp = useOngedaanVerwerpFlowSuggestie();

  const [selected, setSelected] = useState<FlowSuggestie | null>(null);

  const groups = groupFlowSuggesties(suggesties);

  function handleDetect() {
    detecteer.mutate(undefined, {
      onSuccess: () => toast.success("Suggesties gedetecteerd"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Detectie mislukt"),
    });
  }

  const webhookSuggesties = suggesties.filter((s) => s.zekerheid === "webhook");

  function handleBulkBevestig() {
    Promise.all(
      webhookSuggesties.map((s) =>
        bevestig.mutateAsync({ fromId: s.fromId, toId: s.toId }),
      ),
    )
      .then(() => toast.success(`${webhookSuggesties.length} koppelingen bevestigd`))
      .catch(() => toast.error("Kon niet alle koppelingen bevestigen"));
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
          {suggesties.filter((s) => s.zekerheid === "ai").length > 0 && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">
              {suggesties.filter((s) => s.zekerheid === "ai").length} AI-suggestie
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {webhookSuggesties.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleBulkBevestig} disabled={bevestig.isPending}>
              Alle hoge zekerheid bevestigen
            </Button>
          )}
          <Button size="sm" onClick={handleDetect} disabled={detecteer.isPending}>
            {detecteer.isPending ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Detecteren...
              </>
            ) : (
              "Detecteer suggesties"
            )}
          </Button>
        </div>
      </div>

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
}: {
  group: FlowSuggestionGroup;
  onBevestig: ReturnType<typeof useBevestigFlowSuggestie>;
  onVerwerp: ReturnType<typeof useVerwerpFlowSuggestie>;
  onOngedaanBevestig: ReturnType<typeof useOngedaanBevestigFlowSuggestie>;
  onOngedaanVerwerp: ReturnType<typeof useOngedaanVerwerpFlowSuggestie>;
  onOpenDetail: (suggestie: FlowSuggestie) => void;
}) {
  return (
    <div className="rounded-lg border divide-y divide-border">
      {group.suggestions.map((suggestie) => (
        <SuggestieRij
          key={`${suggestie.fromId}-${suggestie.toId}`}
          suggestie={suggestie}
          onBevestig={onBevestig}
          onVerwerp={onVerwerp}
          onOngedaanBevestig={onOngedaanBevestig}
          onOngedaanVerwerp={onOngedaanVerwerp}
          onOpenDetail={() => onOpenDetail(suggestie)}
        />
      ))}
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

function SuggestieRij({
  suggestie: s,
  onBevestig,
  onVerwerp,
  onOngedaanBevestig,
  onOngedaanVerwerp,
  onOpenDetail,
}: {
  suggestie: FlowSuggestie;
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
    <div className="flex items-start gap-3 p-3">
      <button
        type="button"
        className="min-w-0 flex-1 space-y-1 text-left hover:opacity-70 transition-opacity"
        onClick={onOpenDetail}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CategorieBadge categorie={s.fromCategorie} />
          <span className="truncate font-medium text-foreground">{s.fromNaam}</span>
          <span className="text-xs text-muted-foreground">naar</span>
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
        <div className="flex shrink-0 items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
            disabled={anyPending}
            onClick={() =>
              onOngedaanBevestig.mutate(
                { fromId: s.fromId, toId: s.toId },
                { onError: (e) => toast.error(e instanceof Error ? e.message : "Ongedaan maken mislukt") },
              )
            }
          >
            Ongedaan maken
          </button>
        </div>
      ) : s.rejected ? (
        <div className="flex shrink-0 items-center gap-2">
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
        <div className="flex shrink-0 gap-1.5">
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
                  onSuccess: () => toast.success("Koppeling bevestigd"),
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
