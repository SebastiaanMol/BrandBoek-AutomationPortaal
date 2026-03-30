import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, GitBranch, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AutomationBranch } from "@/lib/types";

interface Step { id: string; label: string; }

interface BranchEditorDialogProps {
  open: boolean;
  automationId: string;
  automationName: string;
  initialBranches: AutomationBranch[];
  steps: Step[];
  onClose: () => void;
  onSaved: (branches: AutomationBranch[]) => void;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyBranch(): AutomationBranch {
  return { id: uid(), label: "", toStepId: "" };
}

export function BranchEditorDialog({
  open, automationId, automationName, initialBranches, steps, onClose, onSaved,
}: BranchEditorDialogProps) {
  const [branches, setBranches] = useState<AutomationBranch[]>(
    initialBranches.length > 0 ? initialBranches : [emptyBranch()],
  );
  const [saving, setSaving] = useState(false);

  function addBranch() {
    setBranches(prev => [...prev, emptyBranch()]);
  }

  function removeBranch(id: string) {
    setBranches(prev => prev.filter(b => b.id !== id));
  }

  function updateBranch(id: string, patch: Partial<AutomationBranch>) {
    setBranches(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  }

  async function handleSave() {
    const invalid = branches.filter(b => !b.label.trim() || !b.toStepId);
    if (invalid.length > 0) {
      toast.error("Vul een omschrijving en doelstap in voor elk pad");
      return;
    }

    setSaving(true);
    const { error } = await (supabase as any)
      .from("automatiseringen")
      .update({ branches })
      .eq("id", automationId);
    setSaving(false);

    if (error) { toast.error("Opslaan mislukt"); return; }
    toast.success("Paden opgeslagen");
    onSaved(branches);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4 text-primary" />
            {automationName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Welke uitkomsten zijn er, en waar gaat de flow dan naartoe?
          </p>
        </DialogHeader>

        <div className="space-y-2 py-1">
          {branches.map((branch, i) => (
            <div key={branch.id} className="flex items-center gap-2 group">
              <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">
                {i + 1}.
              </span>
              <Input
                value={branch.label}
                onChange={e => updateBranch(branch.id, { label: e.target.value })}
                placeholder="Bijv. 'Heeft bankkoppeling'"
                className="flex-1 h-9 text-sm"
              />
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select
                value={branch.toStepId}
                onValueChange={v => updateBranch(branch.id, { toStepId: v })}
              >
                <SelectTrigger className="w-44 h-9 text-sm">
                  <SelectValue placeholder="Kies stap…" />
                </SelectTrigger>
                <SelectContent>
                  {steps.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={() => removeBranch(branch.id)}
                className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          <Button
            variant="ghost" size="sm"
            onClick={addBranch}
            className="gap-1.5 text-muted-foreground w-full mt-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Pad toevoegen
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Opslaan…" : "Opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
