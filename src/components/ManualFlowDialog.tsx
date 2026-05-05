import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Automatisering, Systeem } from "@/lib/types";

interface ManualFlowDialogProps {
  automations: Automatisering[];
  open: boolean;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: {
    naam: string;
    beschrijving: string;
    automationIds: string[];
    systemen: Systeem[];
  }) => void;
}

export function ManualFlowDialog({
  automations,
  open,
  saving = false,
  onOpenChange,
  onSave,
}: ManualFlowDialogProps) {
  const [naam, setNaam] = useState("");
  const [beschrijving, setBeschrijving] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setNaam("");
    setBeschrijving("");
    setQuery("");
    setSelectedIds([]);
  }, [open]);

  const autoMap = useMemo(
    () => new Map(automations.map((automation) => [automation.id, automation])),
    [automations],
  );

  const filteredAutomations = useMemo(() => {
    const q = query.trim().toLowerCase();
    return automations
      .filter((automation) => !selectedIds.includes(automation.id))
      .filter((automation) => {
        if (!q) return true;
        return (
          automation.naam.toLowerCase().includes(q) ||
          automation.doel.toLowerCase().includes(q) ||
          automation.systemen.some((system) => system.toLowerCase().includes(q))
        );
      })
      .slice(0, 8);
  }, [automations, query, selectedIds]);

  const selectedAutomations = selectedIds
    .map((id) => autoMap.get(id))
    .filter((automation): automation is Automatisering => automation !== undefined);
  const canSave = naam.trim().length > 0 && selectedIds.length > 0 && !saving;

  function addAutomation(id: string) {
    setSelectedIds((current) => current.includes(id) ? current : [...current, id]);
  }

  function removeAutomation(id: string) {
    setSelectedIds((current) => current.filter((item) => item !== id));
  }

  function moveAutomation(id: string, direction: -1 | 1) {
    setSelectedIds((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function handleSave() {
    if (!canSave) return;
    const systemen = [...new Set(selectedAutomations.flatMap((automation) => automation.systemen))] as Systeem[];
    onSave({
      naam,
      beschrijving,
      automationIds: selectedIds,
      systemen,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Flow maken</DialogTitle>
          <DialogDescription>
            Stel handmatig een flow samen door automations te selecteren en in volgorde te zetten.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-5 py-2 md:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-flow-name">Naam</Label>
              <Input
                id="manual-flow-name"
                value={naam}
                onChange={(event) => setNaam(event.target.value)}
                placeholder="Bijv. Lead naar onboarding"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-flow-description">Beschrijving</Label>
              <Textarea
                id="manual-flow-description"
                value={beschrijving}
                onChange={(event) => setBeschrijving(event.target.value)}
                placeholder="Waarvoor is deze flow bedoeld?"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-flow-search">Automation toevoegen</Label>
              <Input
                id="manual-flow-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Zoek op naam, doel of systeem"
              />
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                {filteredAutomations.length > 0 ? (
                  filteredAutomations.map((automation) => (
                    <button
                      key={automation.id}
                      type="button"
                      className="flex w-full items-start justify-between gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/50"
                      onClick={() => addAutomation(automation.id)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{automation.naam}</p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{automation.doel}</p>
                      </div>
                      <Plus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Geen automations gevonden.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <Label>Geselecteerde automations</Label>
            <div className="max-h-[320px] min-h-64 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2 md:max-h-[430px] md:min-h-80">
              {selectedAutomations.length > 0 ? (
                <div className="space-y-2">
                  {selectedAutomations.map((automation, index) => (
                    <div
                      key={automation.id}
                      className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{automation.naam}</p>
                        <p className="truncate text-xs text-muted-foreground">{automation.systemen.join(", ")}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          disabled={index === 0}
                          onClick={() => moveAutomation(automation.id, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          disabled={index === selectedAutomations.length - 1}
                          onClick={() => moveAutomation(automation.id, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeAutomation(automation.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-72 items-center justify-center text-center text-sm text-muted-foreground">
                  Kies links een of meer automations voor deze flow.
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave}>
            {saving ? "Opslaan..." : "Flow opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
