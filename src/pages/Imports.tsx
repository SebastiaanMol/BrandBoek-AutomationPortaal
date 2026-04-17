import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, RefreshCw, Sparkles, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { triggerHubSpotSync } from "@/lib/supabaseStorage";
import { KLANT_FASEN, SYSTEMEN } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AiEnrichment {
  summary?: string;
  description?: string;
  systems?: string[];
  trigger_moment?: string;
  end_result?: string;
  data_flow?: string;
  phases?: string[];
  generated_at?: string;
}

interface ReviewAutomation {
  id: string;
  naam: string;
  status: string;
  doel: string;
  trigger_beschrijving: string;
  systemen: string[];
  stappen: string[];
  categorie: string;
  import_source: string;
  import_status: string;
  import_proposal: Record<string, unknown>;
  created_at: string;
  fasen: string[];
  source: string;
  ai_enrichment: AiEnrichment | null;
  reviewer_overrides: Partial<AiEnrichment> | null;
}

// ── Data functions ─────────────────────────────────────────────────────────────

async function fetchPendingReview(): Promise<ReviewAutomation[]> {
  const { data, error } = await (supabase as any)
    .from("automatiseringen")
    .select("id,naam,status,doel,trigger_beschrijving,systemen,stappen,categorie,import_source,import_status,import_proposal,created_at,fasen,source,ai_enrichment,reviewer_overrides")
    .eq("import_status", "pending_approval")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function saveOverrides(id: string, overrides: Partial<AiEnrichment>): Promise<void> {
  const { error } = await (supabase as any)
    .from("automatiseringen")
    .update({ reviewer_overrides: overrides })
    .eq("id", id);
  if (error) throw error;
}

async function approveReview(item: ReviewAutomation, overrides: Partial<AiEnrichment>, naam: string): Promise<void> {
  const merge = <T,>(field: keyof AiEnrichment): T | undefined =>
    (overrides[field] ?? item.ai_enrichment?.[field]) as T | undefined;

  const { error } = await (supabase as any)
    .from("automatiseringen")
    .update({
      naam,
      doel:             merge<string>("summary")   ?? item.doel ?? "",
      systemen:         merge<string[]>("systems") ?? item.systemen ?? [],
      fasen:            merge<string[]>("phases")  ?? item.fasen ?? [],
      afhankelijkheden: merge<string>("data_flow") ?? "",
      import_proposal: {
        ...(item.import_proposal ?? {}),
        beschrijving_in_simpele_taal: [merge<string>("description") ?? ""].filter(Boolean),
      },
      reviewer_overrides: overrides,
      import_status: "approved",
      approved_at:   new Date().toISOString(),
      approved_by:   "portaal-gebruiker",
    })
    .eq("id", item.id);
  if (error) throw error;
}

async function rejectReview(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("automatiseringen")
    .update({ import_status: "rejected", rejected_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function fetchPartnerNaam(targetId: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from("automatiseringen")
    .select("naam")
    .eq("id", targetId)
    .maybeSingle();
  return data?.naam ?? null;
}

// ── Source badge ───────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { label: string; className: string }> = {
    hubspot: { label: "HubSpot",  className: "bg-orange-50 border border-orange-100 text-orange-600" },
    zapier:  { label: "Zapier",   className: "bg-orange-50 border border-orange-100 text-orange-500" },
    gitlab:  { label: "GitLab",   className: "bg-purple-50 border border-purple-100 text-purple-600" },
  };
  const cfg = map[source] ?? { label: source, className: "bg-secondary text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", cfg.className)}>
      {cfg.label}
    </span>
  );
}

// ── ReviewCard ─────────────────────────────────────────────────────────────────

function ReviewCard({ item, onDone }: { item: ReviewAutomation; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [partnerNaam, setPartnerNaam] = useState<string | null>(null);

  // Form state — initieel: reviewer_overrides ?? ai_enrichment ?? bestaande waarden
  const ro = item.reviewer_overrides ?? {};
  const ai = item.ai_enrichment ?? {};

  const [naam, setNaam]             = useState(item.naam);
  const [doel, setDoel]             = useState<string>(ro.summary    ?? ai.summary    ?? item.doel              ?? "");
  const [beschrijving, setBeschrijving] = useState<string>(ro.description ?? ai.description ?? "");
  const [dataFlow, setDataFlow]     = useState<string>(ro.data_flow  ?? ai.data_flow  ?? "");
  const [endResult, setEndResult]   = useState<string>(ro.end_result ?? ai.end_result ?? "");
  const [systemen, setSystemen]     = useState<string[]>(ro.systems  ?? ai.systems    ?? item.systemen ?? []);
  const [fasen, setFasen]           = useState<string[]>(ro.phases   ?? ai.phases     ?? item.fasen    ?? []);

  // Fetch partner badge
  const loadPartner = async () => {
    if (partnerNaam !== null) return;
    const { data: link } = await (supabase as any)
      .from("automation_links")
      .select("target_id")
      .eq("source_id", item.id)
      .maybeSingle();
    if (link?.target_id) {
      const naam = await fetchPartnerNaam(link.target_id);
      setPartnerNaam(naam);
    }
  };

  const currentOverrides = (): Partial<AiEnrichment> => ({
    summary:     doel,
    description: beschrijving,
    data_flow:   dataFlow,
    end_result:  endResult,
    systems:     systemen,
    phases:      fasen,
  });

  const handleBlur = async () => {
    try { await saveOverrides(item.id, currentOverrides()); } catch { /* negeer */ }
  };

  const approveMutation = useMutation({
    mutationFn: () => approveReview(item, currentOverrides(), naam),
    onSuccess: () => {
      toast.success(`${item.id} goedgekeurd`);
      queryClient.invalidateQueries({ queryKey: ["pending-review"] });
      onDone();
    },
    onError: (e: any) => toast.error(e.message || "Goedkeuren mislukt"),
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectReview(item.id),
    onSuccess: () => {
      toast.success(`${item.id} afgewezen`);
      queryClient.invalidateQueries({ queryKey: ["pending-review"] });
      onDone();
    },
    onError: (e: any) => toast.error(e.message || "Afwijzen mislukt"),
  });

  const hasAi = !!item.ai_enrichment;
  const isPending = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
        onClick={() => { setOpen(v => !v); if (!open) loadPartner(); }}
      >
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <SourceBadge source={item.source ?? item.import_source} />
            {hasAi
              ? <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1"><Sparkles className="h-3 w-3" />AI beschikbaar</span>
              : <span className="text-[10px] text-muted-foreground">Geen AI beschrijving</span>
            }
            {partnerNaam && (
              <span className="text-[10px] text-blue-600 font-medium flex items-center gap-1"><Link2 className="h-3 w-3" />{partnerNaam}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground truncate">{item.naam}</p>
          {hasAi && item.ai_enrichment?.summary && (
            <p className="text-xs text-muted-foreground line-clamp-1">{item.ai_enrichment.summary}</p>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      </button>

      {/* Review form */}
      {open && (
        <div className="px-4 pb-4 pt-2 space-y-4 border-t border-border">
          {/* Naam */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Naam</label>
            <Input value={naam} onChange={e => setNaam(e.target.value)} onBlur={handleBlur} className="text-sm" />
          </div>

          {/* Doel (summary) */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Doel</label>
            <Input value={doel} onChange={e => setDoel(e.target.value)} onBlur={handleBlur} className="text-sm" placeholder="AI-suggestie nog niet beschikbaar" />
          </div>

          {/* Beschrijving */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Beschrijving</label>
            <Textarea value={beschrijving} onChange={e => setBeschrijving(e.target.value)} onBlur={handleBlur} rows={3} className="text-sm" placeholder="AI-suggestie nog niet beschikbaar" />
          </div>

          {/* Data flow */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Data flow</label>
            <Input value={dataFlow} onChange={e => setDataFlow(e.target.value)} onBlur={handleBlur} className="text-sm" placeholder="Welke data stroomt van HubSpot naar de backend?" />
          </div>

          {/* Eindresultaat */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Eindresultaat</label>
            <Input value={endResult} onChange={e => setEndResult(e.target.value)} onBlur={handleBlur} className="text-sm" placeholder="Wat is het eindresultaat?" />
          </div>

          {/* Trigger (readonly) */}
          {item.trigger_beschrijving && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Trigger <span className="normal-case font-normal">(alleen lezen)</span></label>
              <p className="text-xs text-muted-foreground bg-secondary rounded px-3 py-2">{item.trigger_beschrijving}</p>
            </div>
          )}

          {/* Systemen */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Systemen</label>
            <div className="flex flex-wrap gap-3">
              {SYSTEMEN.map(s => (
                <label key={s} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={systemen.includes(s)}
                    onCheckedChange={() => {
                      const next = systemen.includes(s) ? systemen.filter(x => x !== s) : [...systemen, s];
                      setSystemen(next);
                    }}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>

          {/* Fasen */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Fasen</label>
            <div className="flex flex-wrap gap-3">
              {KLANT_FASEN.map(f => (
                <label key={f} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={fasen.includes(f)}
                    onCheckedChange={() => {
                      const next = fasen.includes(f) ? fasen.filter(x => x !== f) : [...fasen, f];
                      setFasen(next);
                    }}
                  />
                  {f}
                </label>
              ))}
            </div>
          </div>

          {/* Acties */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => approveMutation.mutate()}
              disabled={isPending}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {approveMutation.isPending ? "Goedkeuren..." : "Goedkeuren"}
            </button>
            <button
              onClick={() => rejectMutation.mutate()}
              disabled={isPending}
              className="flex items-center gap-2 rounded-md border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              {rejectMutation.isPending ? "Afwijzen..." : "Afwijzen"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Imports() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("alle");

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["pending-review"],
    queryFn: fetchPendingReview,
  });

  const syncMutation = useMutation({
    mutationFn: triggerHubSpotSync,
    onSuccess: () => {
      toast.success("HubSpot sync gestart");
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["pending-review"] }), 3000);
    },
    onError: (e: any) => toast.error(e.message || "Sync mislukt"),
  });

  const filtered = filter === "alle"
    ? pending
    : pending.filter(a => (a.source ?? a.import_source) === filter);

  const sources = Array.from(new Set(pending.map(a => a.source ?? a.import_source))).filter(Boolean);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Review</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pending.length} automatisering{pending.length !== 1 ? "en" : ""} wacht{pending.length === 1 ? "" : "en"} op goedkeuring
          </p>
        </div>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", syncMutation.isPending && "animate-spin")} />
          HubSpot sync
        </button>
      </div>

      {/* Filter */}
      {sources.length > 1 && (
        <div className="flex gap-2">
          {["alle", ...sources].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium border transition-colors",
                filter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "alle" ? "Alle" : s}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <p className="text-sm text-muted-foreground">Laden...</p>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Geen automations wachten op goedkeuring.</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(item => (
          <ReviewCard
            key={item.id}
            item={item}
            onDone={() => queryClient.invalidateQueries({ queryKey: ["pending-review"] })}
          />
        ))}
      </div>
    </div>
  );
}
