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
import { Trash2, ChevronDown, ChevronUp, Lock } from "lucide-react";
import type { CustomLane, ProcessStep } from "@/data/processData";
import { buildLaneKeys, getLaneConfig, isPipelineStep } from "@/data/processData";

// ── BPMN type icon components (20×20 SVG, rendered at h-5 w-5) ───────────────

const StartEventIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="10" cy="10" r="2.5" fill="currentColor" />
  </svg>
);

const EndEventIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="3" />
    <circle cx="10" cy="10" r="3.5" fill="currentColor" />
  </svg>
);

const TerminateIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="10" cy="10" r="4.5" fill="currentColor" />
  </svg>
);

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
    <rect x="5.5" y="7" width="9" height="6" rx="0.5" fill="currentColor" />
    <polyline points="5.5,7 10,10.5 14.5,7" stroke="white" strokeWidth="1" />
  </svg>
);

const ReceiveIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
    <rect x="5.5" y="7" width="9" height="6" rx="0.5" stroke="currentColor" strokeWidth="1" />
    <polyline points="5.5,7 10,10.5 14.5,7" stroke="currentColor" strokeWidth="1" />
  </svg>
);

const XorIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <polygon points="10,2 18,10 10,18 2,10" stroke="currentColor" strokeWidth="1.5" />
    <line x1="7" y1="7" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" />
    <line x1="13" y1="7" x2="7" y2="13" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const AndIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <polygon points="10,2 18,10 10,18 2,10" stroke="currentColor" strokeWidth="1.5" />
    <line x1="10" y1="5" x2="10" y2="15" stroke="currentColor" strokeWidth="1.5" />
    <line x1="5" y1="10" x2="15" y2="10" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const TaskIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="2" y="5" width="16" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
    <rect x="2" y="5" width="3" height="10" rx="1.5" fill="currentColor" />
  </svg>
);

type StepType = "task" | "decision" | "start" | "end" | "terminate" | "send" | "receive" | "and";

const TYPE_GROUPS: { label: string; types: { value: StepType; label: string; Icon: () => JSX.Element }[] }[] = [
  {
    label: "Events",
    types: [
      { value: "start",     label: "Start",     Icon: StartEventIcon },
      { value: "end",       label: "End",        Icon: EndEventIcon },
      { value: "terminate", label: "Terminate",  Icon: TerminateIcon },
      { value: "send",      label: "Send",       Icon: SendIcon },
      { value: "receive",   label: "Receive",    Icon: ReceiveIcon },
    ],
  },
  {
    label: "Gateways",
    types: [
      { value: "decision",  label: "XOR",        Icon: XorIcon },
      { value: "and",       label: "AND",        Icon: AndIcon },
    ],
  },
  {
    label: "Activity",
    types: [
      { value: "task",      label: "Task",       Icon: TaskIcon },
    ],
  },
];

const VALID_STEP_TYPES = TYPE_GROUPS.flatMap(g => g.types.map(t => t.value));

interface StepDialogProps {
  open: boolean;
  step: ProcessStep | null;       // null = add new
  maxColumn: number;
  defaultValues?: { team?: string; column?: number; row?: number; type?: StepType };
  activeLanes?: string[];
  customLanes?: CustomLane[];
  onSave: (step: ProcessStep) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function StepDialog({
  open,
  step,
  maxColumn,
  defaultValues,
  activeLanes,
  customLanes,
  onSave,
  onDelete,
  onClose,
}: StepDialogProps) {
  const [label, setLabel]           = useState("");
  const [team, setTeam]             = useState("sales");
  const [column, setColumn]         = useState(0);
  const [row, setRow]               = useState(0);
  const [description, setDesc]      = useState("");
  const [stepType, setStepType]     = useState<StepType>("task");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typeExpanded, setTypeExpanded]   = useState(false);

  const isLocked = !!step && isPipelineStep(step);

  useEffect(() => {
    if (step) {
      setLabel(step.label);
      setTeam(step.team);
      setColumn(step.column);
      setRow(step.row ?? 0);
      setDesc(step.description ?? "");
      setStepType(VALID_STEP_TYPES.includes(step.type as StepType) ? (step.type as StepType) : "task");
    } else {
      setLabel("");
      setTeam(defaultValues?.team ?? "sales");
      setColumn(defaultValues?.column ?? maxColumn + 1);
      setRow(defaultValues?.row ?? 0);
      setDesc("");
      setStepType(defaultValues?.type ?? "task");
    }
    setTypeExpanded(false);
  }, [step, open, maxColumn, defaultValues]);

  function handleSave() {
    if (!label.trim()) return;
    onSave({
      id: step?.id ?? `s-${Date.now()}`,
      label: label.trim(),
      type: stepType,
      team,
      column,
      row: row > 0 ? row : undefined,
      description: description.trim() || undefined,
    });
    onClose();
  }

  const isEditing = !!step;
  const currentTypeLabel = TYPE_GROUPS.flatMap(g => g.types).find(t => t.value === stepType);

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
              {isLocked ? (
                <div className="flex items-center gap-2 rounded-md border border-input bg-muted px-3 py-2 text-sm">
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{label}</span>
                </div>
              ) : (
                <Input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="bijv. Intake gesprek"
                  onKeyDown={e => e.key === "Enter" && handleSave()}
                  autoFocus
                />
              )}
              {isLocked && (
                <p className="text-[11px] text-muted-foreground">
                  Naam bepaald door de pipeline
                </p>
              )}
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

            <div className="space-y-1.5">
              <Label>Team</Label>
              <Select value={team} onValueChange={setTeam}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(activeLanes?.length ? activeLanes : buildLaneKeys(customLanes)).map(t => {
                    const cfg = getLaneConfig(t, customLanes);
                    return (
                    <SelectItem key={t} value={t}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ background: cfg.stroke }}
                        />
                        {cfg.label}
                      </span>
                    </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setTypeExpanded(v => !v)}
                className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                <span className="flex items-center gap-2">
                  {currentTypeLabel && <currentTypeLabel.Icon />}
                  <span>Type: <span className="font-medium text-foreground">{currentTypeLabel?.label}</span></span>
                </span>
                {typeExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {typeExpanded && (
                <div className="space-y-3 pt-1">
                  {TYPE_GROUPS.map(group => (
                    <div key={group.label}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                        {group.label}
                      </p>
                      <div className="grid grid-cols-5 gap-1.5">
                        {group.types.map(t => (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => { setStepType(t.value); setTypeExpanded(false); }}
                            className={[
                              "flex flex-col items-center gap-1 rounded-lg border p-2 text-[9px] transition-colors",
                              stepType === t.value
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/30",
                            ].join(" ")}
                          >
                            <t.Icon />
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
