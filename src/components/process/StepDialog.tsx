import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { ProcessStep, TeamKey } from "@/data/processData";
import { TEAM_CONFIG, TEAM_ORDER } from "@/data/processData";
import { Trash2 } from "lucide-react";

interface StepDialogProps {
  open: boolean;
  step: ProcessStep | null;       // null = add new
  maxColumn: number;
  defaultValues?: { team?: TeamKey; column?: number; row?: number };
  onSave: (step: ProcessStep) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function StepDialog({ open, step, maxColumn, defaultValues, onSave, onDelete, onClose }: StepDialogProps) {
  const [label, setLabel]       = useState("");
  const [team, setTeam]         = useState<TeamKey>("sales");
  const [column, setColumn]     = useState(0);
  const [row, setRow]           = useState(0);
  const [description, setDesc]  = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (step) {
      setLabel(step.label);
      setTeam(step.team);
      setColumn(step.column);
      setRow(step.row ?? 0);
      setDesc(step.description ?? "");
    } else {
      setLabel("");
      setTeam(defaultValues?.team ?? "sales");
      setColumn(defaultValues?.column ?? maxColumn + 1);
      setRow(defaultValues?.row ?? 0);
      setDesc("");
    }
  }, [step, open, maxColumn, defaultValues]);

  function handleSave() {
    if (!label.trim()) return;
    onSave({
      id: step?.id ?? `s-${Date.now()}`,
      label: label.trim(),
      team,
      column,
      row: row > 0 ? row : undefined,
      description: description.trim() || undefined,
    });
    onClose();
  }

  const isEditing = !!step;

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Stap bewerken" : "Nieuwe stap toevoegen"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Naam</Label>
              <Input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="bijv. Intake gesprek"
                onKeyDown={e => e.key === "Enter" && handleSave()}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Team</Label>
              <Select value={team} onValueChange={v => setTeam(v as TeamKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_ORDER.map(t => (
                    <SelectItem key={t} value={t}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ background: TEAM_CONFIG[t].stroke }}
                        />
                        {TEAM_CONFIG[t].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Beschrijving <span className="text-muted-foreground font-normal">(optioneel)</span></Label>
              <Textarea
                value={description}
                onChange={e => setDesc(e.target.value)}
                placeholder="Korte toelichting op deze stap..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between">
            {isEditing && onDelete ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 mr-auto"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Verwijderen
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Annuleren</Button>
              <Button onClick={handleSave} disabled={!label.trim()}>
                {isEditing ? "Opslaan" : "Toevoegen"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stap verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Hiermee verwijder je ook alle verbindingen van en naar <strong>{step?.label}</strong>.
              Gekoppelde automations worden losgekoppeld.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { onDelete?.(step!.id); setConfirmDelete(false); onClose(); }}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
