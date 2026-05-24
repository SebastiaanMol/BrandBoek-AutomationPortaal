import { useState, useEffect } from "react";
import type { Automatisering } from "@/lib/types";

interface FlowConfirmDialogProps {
  automations: Automatisering[];
  initialName: string;
  initialBeschrijving: string;
  aiError: boolean;
  onRetryAi: () => void;
  onSave: (naam: string, beschrijving: string) => void;
  onCancel: () => void;
  saving?: boolean;
}

export function FlowConfirmDialog({
  automations,
  initialName,
  initialBeschrijving,
  aiError,
  onRetryAi,
  onSave,
  onCancel,
  saving,
}: FlowConfirmDialogProps): React.ReactNode {
  const [naam, setNaam] = useState(initialName);
  const [beschrijving, setBeschrijving] = useState(initialBeschrijving);

  useEffect(() => {
    setNaam(initialName);
    setBeschrijving(initialBeschrijving);
  }, [initialName, initialBeschrijving]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="flow-confirm-title"
        aria-describedby="flow-confirm-description"
        className="max-h-[min(720px,calc(100vh-2rem))] w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="border-b border-border px-6 py-5">
          <h2 id="flow-confirm-title" className="text-base font-semibold">Procesreis opslaan</h2>
          <p id="flow-confirm-description" className="mt-1 text-sm text-muted-foreground">
            Controleer de volgorde, naam en beschrijving. Na opslaan wordt dit een officiele procesreis.
          </p>
        </div>

        <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-6 py-5">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Automatiseringen in deze procesreis ({automations.length})
            </p>
            <div className="space-y-1">
              {automations.map((a, i) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 text-xs px-3 py-2 bg-secondary rounded"
                >
                  <span className="font-semibold text-muted-foreground">{i + 1}.</span>
                  <span className="font-medium">{a.naam}</span>
                </div>
              ))}
            </div>
          </div>

          {aiError && (
            <div className="mb-4 rounded bg-muted p-3 text-xs text-muted-foreground">
              AI-naamgeving is niet beschikbaar. Er staat een voorlopige naam klaar.{" "}
              <button type="button" className="underline font-medium" onClick={onRetryAi}>
                Probeer opnieuw
              </button>
            </div>
          )}

          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs font-medium mb-1 block">Naam</label>
              <input
                className="w-full border border-input rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
                placeholder="Procesreis naam"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Beschrijving</label>
              <textarea
                className="w-full border border-input rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                rows={3}
                value={beschrijving}
                onChange={(e) => setBeschrijving(e.target.value)}
                placeholder="Beschrijving van de procesreis"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
            onClick={onCancel}
          >
            Annuleren
          </button>
          <button
            className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            onClick={() => onSave(naam, beschrijving)}
            disabled={!naam.trim() || saving}
          >
            {saving ? "Opslaan..." : "Procesreis opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}
