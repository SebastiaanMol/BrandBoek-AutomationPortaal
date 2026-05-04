import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useBevestigFlowSuggestie,
  useDetecteerSuggesties,
  useFlowSuggesties,
  useVerwerpFlowSuggestie,
} from "@/lib/queryHooks/automationLinks";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";

export function FlowSuggestiesTab() {
  const { data: suggesties = [], isLoading } = useFlowSuggesties();
  const detecteer = useDetecteerSuggesties();
  const bevestig = useBevestigFlowSuggestie();
  const verwerp = useVerwerpFlowSuggestie();

  const webhookSuggesties = suggesties.filter((s) => s.zekerheid === "webhook");
  const aiSuggesties = suggesties.filter((s) => s.zekerheid === "ai");

  function handleDetect() {
    detecteer.mutate(undefined, {
      onSuccess: () => toast.success("Suggesties gedetecteerd"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Detectie mislukt"),
    });
  }

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
          {aiSuggesties.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">
              {aiSuggesties.length} AI-suggestie
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

      {webhookSuggesties.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Hoge zekerheid — webhook match
          </p>
          <div className="divide-y divide-border rounded-lg border">
            {webhookSuggesties.map((s) => (
              <SuggestieRij
                key={`${s.fromId}-${s.toId}`}
                suggestie={s}
                onBevestig={bevestig}
                onVerwerp={verwerp}
              />
            ))}
          </div>
        </section>
      )}

      {aiSuggesties.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            AI-suggestie — semantische analyse
          </p>
          <div className="divide-y divide-border rounded-lg border">
            {aiSuggesties.map((s) => (
              <SuggestieRij
                key={`${s.fromId}-${s.toId}`}
                suggestie={s}
                onBevestig={bevestig}
                onVerwerp={verwerp}
              />
            ))}
          </div>
        </section>
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

function SuggestieRij({
  suggestie: s,
  onBevestig,
  onVerwerp,
}: {
  suggestie: FlowSuggestie;
  onBevestig: ReturnType<typeof useBevestigFlowSuggestie>;
  onVerwerp: ReturnType<typeof useVerwerpFlowSuggestie>;
}) {
  const pending = onBevestig.isPending || onVerwerp.isPending;

  return (
    <div className="flex items-start gap-3 p-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CategorieBadge categorie={s.fromCategorie} />
          <span className="truncate font-medium text-foreground">{s.fromNaam}</span>
          <span className="text-xs text-muted-foreground">→</span>
          <CategorieBadge categorie={s.toCategorie} />
          <span className="truncate font-medium text-foreground">{s.toNaam}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {s.zekerheid === "webhook" ? (
            <>
              Webhook{" "}
              <code className="rounded bg-muted px-1 text-[10px]">{s.redenering}</code> —
              exact match op endpoint
            </>
          ) : (
            <>
              AI: <em>{s.redenering}</em>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => onVerwerp.mutate({ fromId: s.fromId, toId: s.toId })}
        >
          ✕
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
          disabled={pending}
          onClick={() => onBevestig.mutate({ fromId: s.fromId, toId: s.toId })}
        >
          ✓ Bevestigen
        </Button>
      </div>
    </div>
  );
}
