import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle2, XCircle, ChevronDown, ChevronUp,
  RefreshCw, Zap, ArrowRight, BookOpen, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { triggerHubSpotSync } from "@/lib/supabaseStorage";
import { KLANT_FASEN } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Confidence {
  naam: string; status: string; trigger: string;
  systemen: string; stappen: string; branches: string;
  categorie: string; doel: string;
  beschrijving_in_simpele_taal?: string;
  fasen?: string;    // from edge function inferFasen confidence
}

interface ImportProposal {
  confidence: Confidence;
  trigger?: string;
  beschrijving?: string;
  beschrijving_in_simpele_taal?: string[];
  enrollment?: {
    isSegmentBased?: boolean;
    allowContactToTriggerMultipleTimes?: boolean;
    workflowType?: string;
  };
}

interface PendingAutomation {
  id: string;
  naam: string;
  status: string;
  doel: string;
  trigger_beschrijving: string;
  systemen: string[];
  stappen: string[];
  branches: { id: string; label: string; toStepId: string }[];
  categorie: string;
  import_source: string;
  import_status: string;
  import_proposal: ImportProposal;
  created_at: string;
  fasen: string[];    // lifecycle phases
  owner: string;      // responsible person
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchPending(): Promise<PendingAutomation[]> {
  const { data, error } = await (supabase as any)
    .from("automatiseringen")
    .select("id,naam,status,doel,trigger_beschrijving,systemen,stappen,branches,categorie,import_source,import_status,import_proposal,created_at,fasen,owner")
    .eq("import_status", "pending_approval")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function approveAutomation(id: string) {
  const { error } = await (supabase as any)
    .from("automatiseringen")
    .update({
      import_status: "approved",
      approved_by:   "portaal-gebruiker",
      approved_at:   new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

async function rejectAutomation(id: string, reason: string) {
  const { error } = await (supabase as any)
    .from("automatiseringen")
    .update({ import_status: "rejected", rejection_reason: reason })
    .eq("id", id);
  if (error) throw error;
}

async function updateField(id: string, patch: Record<string, unknown>) {
  const { error } = await (supabase as any)
    .from("automatiseringen")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfBadge({ level }: { level?: string }) {
  if (level === "high")   return <span className="text-[10px] text-emerald-600 font-medium">✓ zeker</span>;
  if (level === "medium") return <span className="text-[10px] text-amber-500 font-medium">~ nakijken</span>;
  return <span className="text-[10px] text-red-500 font-medium">⚠ invullen</span>;
}

function FieldLabel({ label, conf }: { label: string; conf?: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      {conf && <ConfBadge level={conf} />}
    </div>
  );
}

function Field({ label, conf, children, className = "" }: {
  label: string; conf?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel label={label} conf={conf} />
      {children}
    </div>
  );
}

// ── Plain-language story block ─────────────────────────────────────────────────

function SimpeleTaalBlock({ sentences }: { sentences: string[] }) {
  const [open, setOpen] = useState(true);

  if (!sentences || sentences.length === 0) return null;

  // First sentence is the intro (no step number), rest are numbered steps
  const [intro, ...steps] = sentences;

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-blue-50 transition-colors"
      >
        <BookOpen className="h-4 w-4 text-blue-500 shrink-0" />
        <span className="text-sm font-semibold text-blue-800 flex-1">
          Wat doet deze automatisering?
        </span>
        <span className="text-[10px] text-blue-400 font-medium mr-1">
          {sentences.length} stap{sentences.length !== 1 ? "pen" : ""}
        </span>
        {open
          ? <ChevronUp className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-blue-400 shrink-0" />
        }
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2.5">
          {/* Intro sentence */}
          <p className="text-sm text-blue-700 italic border-b border-blue-100 pb-2.5">
            {intro}
          </p>

          {/* Numbered steps */}
          <div className="space-y-2">
            {steps.map((sentence, i) => {
              // Detect "Let op:" lines → show as warning
              const isWarning = sentence.startsWith("Let op:");
              const isNote    = !sentence.match(/^Stap \d+:/i) && !isWarning;

              if (isWarning) {
                return (
                  <div key={i} className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    <span className="text-base shrink-0 mt-0.5">⚠️</span>
                    <p className="text-xs text-amber-800 leading-relaxed">{sentence}</p>
                  </div>
                );
              }

              if (isNote) {
                return (
                  <div key={i} className="flex items-start gap-2.5 bg-white/70 rounded-md px-3 py-2 border border-blue-100">
                    <ChevronRight className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700 leading-relaxed">{sentence}</p>
                  </div>
                );
              }

              // Regular "Stap X:" lines
              const stepMatch = sentence.match(/^(Stap \d+): (.+)$/s);
              const stepLabel = stepMatch?.[1] ?? `Stap ${i + 1}`;
              const stepText  = stepMatch?.[2] ?? sentence;

              return (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="shrink-0 mt-0.5 min-w-[52px] text-[10px] font-bold text-blue-500 uppercase tracking-wide pt-0.5">
                    {stepLabel}
                  </span>
                  <p className="text-xs text-blue-900 leading-relaxed">{stepText}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Proposal card ─────────────────────────────────────────────────────────────

function ProposalCard({ item }: { item: PendingAutomation }) {
  const conf    = item.import_proposal?.confidence ?? {};
  const trigger = item.import_proposal?.trigger ?? item.trigger_beschrijving ?? "";
  const simpeleTaal: string[] = item.import_proposal?.beschrijving_in_simpele_taal ?? [];

  const [expanded,     setExpanded]     = useState(false);
  const [editing,      setEditing]      = useState(false);
  const [draft,        setDraft]        = useState({
    naam: item.naam,
    doel: item.doel,
    trigger,
    categorie: item.categorie,
    fasen: item.fasen ?? [],
    owner: item.owner ?? "",
  });
  const [rejectOpen,   setRejectOpen]   = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [saving,       setSaving]       = useState(false);
  const [stappenWarnOpen, setStappenWarnOpen] = useState(false);

  const qc      = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pending"] });
    qc.invalidateQueries({ queryKey: ["automatiseringen"] });
  };

  const approve = useMutation({
    mutationFn: () => approveAutomation(item.id),
    onSuccess:  () => { toast.success(`"${item.naam}" goedgekeurd`); refresh(); },
    onError:    () => toast.error("Goedkeuren mislukt"),
  });

  const reject = useMutation({
    mutationFn: () => rejectAutomation(item.id, rejectReason),
    onSuccess:  () => { toast.success("Voorstel afgewezen"); setRejectOpen(false); refresh(); },
    onError:    () => toast.error("Afwijzen mislukt"),
  });

  async function handleSave() {
    setSaving(true);
    try {
      await updateField(item.id, {
        naam:                 draft.naam,
        doel:                 draft.doel,
        trigger_beschrijving: draft.trigger,
        categorie:            draft.categorie,
        fasen:                draft.fasen,
        owner:                draft.owner,
      });
      toast.success("Wijzigingen opgeslagen");
      refresh();
      setEditing(false);
    } catch {
      toast.error("Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  function handleApproveClick() {
    if (!item.stappen || item.stappen.length === 0) {
      setStappenWarnOpen(true);
      return;
    }
    approve.mutate();
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="w-9 h-9 rounded-full bg-amber-50 border-2 border-amber-400 flex items-center justify-center shrink-0">
          <Zap className="h-4 w-4 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{item.naam}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{item.import_source}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(item.created_at).toLocaleDateString("nl-NL")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setExpanded(v => !v)}>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? "Inklappen" : "Bekijken"}
          </Button>
          <Button size="sm" variant="outline"
            className="h-8 text-xs gap-1 text-destructive border-destructive/30 hover:text-destructive"
            onClick={() => setRejectOpen(true)}>
            <XCircle className="h-3.5 w-3.5" /> Afwijzen
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
            onClick={handleApproveClick}
            disabled={approve.isPending || !item.fasen || item.fasen.length === 0}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {approve.isPending ? "Bezig…" : "Goedkeuren"}
          </Button>
        </div>
      </div>
      {(!item.fasen || item.fasen.length === 0) && (
        <p className="text-[10px] text-red-500 text-right px-5 -mt-2 pb-2">
          Wijs eerst een fase toe voordat je kunt goedkeuren
        </p>
      )}

      {/* Body */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-5">

          {/* ── Plain-language story (always shown first) ── */}
          {simpeleTaal.length > 0 && (
            <SimpeleTaalBlock sentences={simpeleTaal} />
          )}

          {/* ── Technical proposal ── */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Technisch voorstel</p>
            {editing ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(false)}>Annuleren</Button>
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
                  {saving ? "Opslaan…" : "Opslaan"}
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(true)}>Bewerken</Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Naam" conf={conf.naam}>
              {editing
                ? <Input value={draft.naam} onChange={e => setDraft(d => ({ ...d, naam: e.target.value }))} className="h-8 text-sm" />
                : <p className="text-sm font-medium">{item.naam}</p>}
            </Field>
            <Field label="Status" conf={conf.status}>
              <p className="text-sm">{item.status}</p>
            </Field>
            <Field label="Trigger" conf={conf.trigger}>
              {editing
                ? <Input value={draft.trigger} onChange={e => setDraft(d => ({ ...d, trigger: e.target.value }))} className="h-8 text-sm" />
                : <p className="text-sm">{trigger || "—"}</p>}
            </Field>
            <Field label="Categorie" conf={conf.categorie}>
              {editing
                ? <Input value={draft.categorie} onChange={e => setDraft(d => ({ ...d, categorie: e.target.value }))} className="h-8 text-sm" />
                : <p className="text-sm">{item.categorie || "—"}</p>}
            </Field>
            <Field label="Doel" conf={item.doel ? undefined : "low"} className="col-span-2">
              {editing
                ? <Textarea value={draft.doel} onChange={e => setDraft(d => ({ ...d, doel: e.target.value }))} className="text-sm resize-none" rows={2} />
                : <p className="text-sm text-muted-foreground">
                    {item.doel || <span className="italic">Nog niet ingevuld — verplicht nakijken</span>}
                  </p>}
            </Field>
          </div>

          {/* Fasen multi-select (per D-02, D-03) */}
          <Field label="Fasen" conf={(editing ? draft.fasen.length > 0 : item.fasen && item.fasen.length > 0) ? undefined : "low"}>
            {editing ? (
              <div className="flex flex-wrap gap-1.5">
                {KLANT_FASEN.map(fase => (
                  <button
                    key={fase}
                    type="button"
                    onClick={() => setDraft(d => ({
                      ...d,
                      fasen: d.fasen.includes(fase)
                        ? d.fasen.filter(f => f !== fase)
                        : [...d.fasen, fase],
                    }))}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full border transition-colors",
                      draft.fasen.includes(fase)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border hover:border-primary/50",
                    )}
                  >
                    {fase}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {item.fasen && item.fasen.length > 0
                  ? item.fasen.map(f => <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>)
                  : <span className="text-xs text-muted-foreground italic">Geen fase toegewezen</span>}
              </div>
            )}
          </Field>

          {/* Owner input (per D-04, D-05) */}
          <Field label="Verantwoordelijke" conf={item.owner ? undefined : "low"}>
            {editing ? (
              <Input
                value={draft.owner}
                onChange={e => setDraft(d => ({ ...d, owner: e.target.value }))}
                placeholder="Naam verantwoordelijke"
                className="h-8 text-sm"
              />
            ) : (
              <p className="text-sm">
                {item.owner || <span className="italic text-muted-foreground">Nog niet ingevuld</span>}
              </p>
            )}
          </Field>

          {item.systemen?.length > 0 && (
            <div>
              <FieldLabel label="Gekoppelde systemen" conf={conf.systemen} />
              <div className="flex flex-wrap gap-1.5">
                {item.systemen.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
              </div>
            </div>
          )}

          {item.stappen?.length > 0 && (
            <div>
              <FieldLabel label="Technische stappen" conf={conf.stappen} />
              <ol className="space-y-1">
                {item.stappen.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-secondary text-[10px] font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span className="text-muted-foreground">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {item.branches?.length > 0 && (
            <div>
              <FieldLabel label="Uitgaande paden" conf={conf.branches} />
              <div className="space-y-1.5 mt-1">
                {item.branches.map((b, i) => (
                  <div key={b.id} className="flex items-center gap-2 text-xs bg-secondary rounded-md px-2.5 py-1.5">
                    <span className="text-muted-foreground w-4 shrink-0">{i + 1}.</span>
                    <span className="font-medium text-amber-700 flex-1">{b.label}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground italic">{b.toStepId || "koppel in proceskaart"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Voorstel afwijzen</DialogTitle></DialogHeader>
          <Textarea placeholder="Optionele toelichting…" value={rejectReason}
            onChange={e => setRejectReason(e.target.value)} className="resize-none" rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Annuleren</Button>
            <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending}>Afwijzen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stappen warning dialog (per D-06) */}
      <Dialog open={stappenWarnOpen} onOpenChange={setStappenWarnOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Geen stappen gevonden</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Deze automatisering heeft nog geen stappen. Wil je toch goedkeuren?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStappenWarnOpen(false)}>Annuleren</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => { setStappenWarnOpen(false); approve.mutate(); }}
              disabled={approve.isPending}
            >
              Toch goedkeuren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Imports() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["pending"],
    queryFn:  fetchPending,
  });

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await triggerHubSpotSync();
      toast.success(`Sync klaar — ${result.inserted} nieuw, ${result.updated} bijgewerkt`);
      qc.invalidateQueries({ queryKey: ["pending"] });
    } catch {
      toast.error("Synchronisatie mislukt. Controleer je HubSpot token via Instellingen.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Imports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Nieuwe HubSpot workflows wachten hier op goedkeuring voordat ze actief worden.
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing} className="gap-2 shrink-0">
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Bezig…" : "HubSpot synchroniseren"}
        </Button>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm font-semibold">Wachten op goedkeuring</p>
          {pending.length > 0 && <Badge variant="secondary" className="text-xs">{pending.length}</Badge>}
        </div>

        {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Laden…</p>}

        {!isLoading && pending.length === 0 && (
          <p className="text-sm text-muted-foreground py-10 text-center border border-dashed border-border rounded-lg">
            Geen voorstellen wachten op goedkeuring. Klik "HubSpot synchroniseren" om te vernieuwen.
          </p>
        )}

        <div className="space-y-3">
          {pending.map(item => <ProposalCard key={item.id} item={item} />)}
        </div>
      </div>
    </div>
  );
}
