import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import type { Pipeline } from "@/lib/types";
import type { CustomPipelineInput } from "@/lib/storage/pipelines";

interface CustomPipelineDialogProps {
  open: boolean;
  pipeline?: Pipeline | null;
  isSaving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CustomPipelineInput) => void;
}

export function CustomPipelineDialog({
  open,
  pipeline,
  isSaving = false,
  onOpenChange,
  onSubmit,
}: CustomPipelineDialogProps) {
  const [naam, setNaam] = useState("");
  const [beschrijving, setBeschrijving] = useState("");
  const [stages, setStages] = useState<string[]>([""]);

  useEffect(() => {
    if (!open) return;
    setNaam(pipeline?.naam ?? "");
    setBeschrijving(pipeline?.beschrijving ?? "");
    setStages(
      pipeline?.stages.length
        ? [...pipeline.stages]
          .sort((a, b) => a.display_order - b.display_order)
          .map((stage) => stage.label)
        : [""],
    );
  }, [open, pipeline]);

  const cleanStages = useMemo(
    () => stages.map((stage) => stage.trim()).filter(Boolean),
    [stages],
  );
  const canSave = naam.trim().length > 0 && cleanStages.length > 0 && !isSaving;

  function updateStage(index: number, value: string) {
    setStages((current) => current.map((stage, i) => (i === index ? value : stage)));
  }

  function removeStage(index: number) {
    setStages((current) => current.length === 1 ? [""] : current.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    if (!canSave) return;
    onSubmit({
      naam,
      beschrijving,
      stages: cleanStages,
      isActive: pipeline?.isActive ?? true,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{pipeline ? "Intern proces bewerken" : "Intern proces toevoegen"}</DialogTitle>
          <DialogDescription>
            Leg een proces buiten HubSpot vast met dezelfde stage-structuur als de gesynchroniseerde pipelines.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="pipeline-name">Naam</Label>
            <Input
              id="pipeline-name"
              value={naam}
              onChange={(event) => setNaam(event.target.value)}
              placeholder="Bijv. Wefact incasso proces"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pipeline-description">Beschrijving</Label>
            <Textarea
              id="pipeline-description"
              value={beschrijving}
              onChange={(event) => setBeschrijving(event.target.value)}
              placeholder="Waarvoor gebruik je deze pipeline?"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Stages</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setStages((current) => [...current, ""])}
              >
                <Plus className="h-3.5 w-3.5" />
                Stage
              </Button>
            </div>
            <div className="space-y-2">
              {stages.map((stage, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <Input
                    value={stage}
                    onChange={(event) => updateStage(index, event.target.value)}
                    placeholder="Stage naam"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() => removeStage(index)}
                    aria-label="Stage verwijderen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSave}>
            {isSaving ? "Opslaan..." : pipeline ? "Wijzigingen opslaan" : "Intern proces toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
