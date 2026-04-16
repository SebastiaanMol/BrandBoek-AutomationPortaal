# AI Enrichment & Review Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gesyncde automations krijgen automatisch een AI-beschrijving op basis van HubSpot workflow-data + GitLab broncode, en verschijnen in een nieuw Review dashboard waar een reviewer per veld kan aanpassen en goedkeuren.

**Architecture:** Nieuwe `enrich-automation` Supabase edge function roept Gemini aan met gecombineerde context. Hubspot-sync en gitlab-sync roepen deze functie aan na elke sync. De bestaande Imports.tsx wordt vervangen door een Review dashboard dat `ai_enrichment` toont als bewerkbare suggesties; bij goedkeuren worden de waarden weggeschreven naar de echte kolommen.

**Tech Stack:** Deno/Supabase Edge Functions, Gemini 2.5 Flash (OpenAI-compatible endpoint), React + TanStack Query v5, Supabase PostgREST, TypeScript

---

## File Structure

| Actie | Bestand | Verantwoordelijkheid |
|---|---|---|
| Create | `supabase/migrations/20260416130000_enrichment_columns.sql` | Nieuwe kolommen op automatiseringen en automation_links |
| Create | `supabase/functions/enrich-automation/index.ts` | AI enrichment edge function |
| Modify | `supabase/functions/hubspot-sync/index.ts` | sync_run_id + enrich trigger |
| Modify | `supabase/functions/gitlab-sync/index.ts` | enrich trigger na sync |
| Modify | `src/pages/Imports.tsx` | Volledige vervanging door Review dashboard |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260416130000_enrichment_columns.sql`

- [ ] **Step 1: Maak de migration file aan**

```sql
-- supabase/migrations/20260416130000_enrichment_columns.sql

ALTER TABLE automatiseringen
  ADD COLUMN IF NOT EXISTS ai_enrichment      JSONB,
  ADD COLUMN IF NOT EXISTS reviewer_overrides JSONB,
  ADD COLUMN IF NOT EXISTS rejected_at        TIMESTAMPTZ;

ALTER TABLE automation_links
  ADD COLUMN IF NOT EXISTS sync_run_id TEXT;

-- Cron job: ruim rejected automations op na 30 dagen (vereist pg_cron extensie)
-- Als pg_cron niet beschikbaar is op dit plan, sla dit blok over
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-rejected-automations',
      '0 2 * * *',
      $$DELETE FROM automatiseringen
        WHERE import_status = 'rejected'
        AND rejected_at < now() - interval '30 days'$$
    );
  END IF;
END
$$;
```

- [ ] **Step 2: Voer de migration uit via Supabase dashboard**

Ga naar Supabase dashboard → SQL Editor en plak de bovenstaande SQL. Klik Run.

- [ ] **Step 3: Verifieer de kolommen**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'automatiseringen'
  AND column_name IN ('ai_enrichment', 'reviewer_overrides', 'rejected_at');
-- Verwacht: 3 rijen

SELECT column_name FROM information_schema.columns
WHERE table_name = 'automation_links' AND column_name = 'sync_run_id';
-- Verwacht: 1 rij
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260416130000_enrichment_columns.sql
git commit -m "feat(db): add ai_enrichment, reviewer_overrides, rejected_at, sync_run_id columns"
```

---

### Task 2: `enrich-automation` edge function

**Files:**
- Create: `supabase/functions/enrich-automation/index.ts`

- [ ] **Step 1: Maak de functie aan**

```typescript
// supabase/functions/enrich-automation/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { automation_id } = await req.json();
    if (!automation_id) {
      return new Response(JSON.stringify({ error: "automation_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Haal de automation op
    const { data: automation } = await db
      .from("automatiseringen")
      .select("id, naam, status, trigger_beschrijving, stappen, systemen, source, raw_payload")
      .eq("id", automation_id)
      .maybeSingle();

    if (!automation) {
      return new Response(JSON.stringify({ error: "Automation niet gevonden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Zoek gekoppelde GitLab automation
    const { data: link } = await (db as any)
      .from("automation_links")
      .select("target_id")
      .eq("source_id", automation_id)
      .maybeSingle();

    let productieCode = "";
    let testCode = "";
    let gitlabFile = "";
    let testFile = "";
    let endpointPath = "";

    if (link?.target_id) {
      const { data: gl } = await db
        .from("automatiseringen")
        .select("gitlab_file_path, endpoints")
        .eq("id", link.target_id)
        .maybeSingle();

      if (gl?.gitlab_file_path) {
        gitlabFile = gl.gitlab_file_path;
        endpointPath = (gl.endpoints ?? [])[0] ?? "";

        // 3. Haal GitLab credentials op
        const { data: integration } = await db
          .from("integrations")
          .select("token")
          .eq("type", "gitlab")
          .eq("status", "connected")
          .maybeSingle();

        if (integration?.token) {
          const { pat, projectId, branch = "main" } = JSON.parse(integration.token);

          // 4. Fetch productie-code
          const encodedPath = encodeURIComponent(gl.gitlab_file_path);
          const codeRes = await fetch(
            `https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodedPath}/raw?ref=${branch}`,
            { headers: { "PRIVATE-TOKEN": pat } },
          );
          if (codeRes.ok) productieCode = (await codeRes.text()).slice(0, 4000);

          // 5. Fetch testbestand (gitlabtest/<zelfde bestandsnaam>)
          const filename = gl.gitlab_file_path.split("/").pop() ?? "";
          testFile = `gitlabtest/${filename}`;
          const encodedTestPath = encodeURIComponent(testFile);
          const testRes = await fetch(
            `https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodedTestPath}/raw?ref=${branch}`,
            { headers: { "PRIVATE-TOKEN": pat } },
          );
          if (testRes.ok) testCode = (await testRes.text()).slice(0, 2000);
        }
      }
    }

    // 6. Bouw prompt
    const workflowName = automation.naam ?? "";
    const workflowStatus = automation.status ?? "";
    const triggerType = automation.trigger_beschrijving ?? "";
    const workflowActions = (automation.stappen ?? []).join("; ");
    const hasGitlab = productieCode.length > 0;

    const jsonSchema = `{
  "summary": "Één zin die de kern van de automatisering beschrijft.",
  "description": "2-3 zinnen die uitleggen wat er stap voor stap gebeurt.",
  "systems": ["lijst", "van", "betrokken", "systemen"],
  "trigger_moment": "Wanneer start deze automatisering?",
  "end_result": "Wat is het eindresultaat?",
  "data_flow": "Welke data wordt doorgegeven van HubSpot naar de backend?",
  "phases": ["lijst", "van", "klantfasen"]
}`;

    const prompt = hasGitlab
      ? `Je krijgt twee databronnen van één automatisering:
1. De trigger-configuratie vanuit HubSpot
2. De bijbehorende backend-code vanuit GitLab

Jouw taak: schrijf een samengestelde beschrijving als één geheel — van trigger tot eindresultaat.

## Context over de backend-architectuur
De backend is een interne Python API (FastAPI) die draait op Railway.
HubSpot workflows sturen via webhooks data naar de API. De API verwerkt de logica en koppelt terug naar HubSpot, Clockify, WeFact, SharePoint of andere systemen.

## HubSpot Workflow
Naam: ${workflowName}
Status: ${workflowStatus}
Trigger: ${triggerType}
Acties: ${workflowActions}

## GitLab Backend

### Productie-code
Endpoint: POST ${endpointPath}
Bestand: ${gitlabFile}
${productieCode}

### Testcode (gitlabtest/)
Bestand: ${testFile}
${testCode}

Geef je antwoord in dit JSON-formaat:
${jsonSchema}

Schrijf alsof je uitlegt aan een niet-technische collega. Gebruik geen jargon. Wees concreet en kort.
Als de testcode extra inzicht geeft, verwerk dat dan in de beschrijving.
Geldige waarden voor phases: Onboarding, Marketing, Sales, Boekhouding, Offboarding.`
      : `Je analyseert een automatisering. Schrijf een beschrijving van trigger tot eindresultaat.

## Automatisering
Naam: ${workflowName}
Status: ${workflowStatus}
Trigger: ${triggerType}
Acties: ${workflowActions}

Geef je antwoord in dit JSON-formaat:
${jsonSchema}

Geldige waarden voor phases: Onboarding, Marketing, Sales, Boekhouding, Offboarding.`;

    // 7. Roep Gemini aan
    const geminiKey = Deno.env.get("GEMINI_API_KEY")!;
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${geminiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "Je bent een technische assistent die automatiseringen beschrijft voor een Nederlands boekhoudkantoor. Antwoord altijd in het Nederlands en in het gevraagde JSON-formaat.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      },
    );

    if (!res.ok) throw new Error(`Gemini API fout (${res.status})`);

    const geminiResult = await res.json();
    const content = geminiResult.choices?.[0]?.message?.content;
    if (!content) throw new Error("Gemini: leeg antwoord");

    const enrichment = JSON.parse(content);

    // 8. Sla op in ai_enrichment
    await db
      .from("automatiseringen")
      .update({
        ai_enrichment: { ...enrichment, generated_at: new Date().toISOString() },
      })
      .eq("id", automation_id);

    return new Response(
      JSON.stringify({ success: true, automation_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("enrich-automation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

- [ ] **Step 2: Deploy de functie**

```bash
npx supabase functions deploy enrich-automation --project-ref <jouw-project-ref>
```

Verwacht: `Deployed enrich-automation`

- [ ] **Step 3: Test de functie handmatig**

Ga naar Supabase Dashboard → Edge Functions → enrich-automation → Invoke. Body:
```json
{ "automation_id": "AUTO-031" }
```

Verwacht: `{ "success": true, "automation_id": "AUTO-031" }`

Controleer daarna in SQL:
```sql
SELECT id, ai_enrichment->>'summary' as summary
FROM automatiseringen WHERE id = 'AUTO-031';
-- Verwacht: een Nederlandse zin
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/enrich-automation/index.ts
git commit -m "feat(edge): add enrich-automation function with Gemini AI enrichment"
```

---

### Task 3: Update hubspot-sync — sync_run_id + enrich triggers

**Files:**
- Modify: `supabase/functions/hubspot-sync/index.ts`

Context: de matching pass staat op regels 632–678. De response wordt teruggegeven op regel 687. De insert-loop staat op regels 590–620.

- [ ] **Step 1: Track insertedIds en voeg sync_run_id toe**

Zoek deze regel (rond regel 562):
```typescript
const syncedIds = new Set<string>();
let inserted = 0, updated = 0;
```

Vervang door:
```typescript
const syncedIds = new Set<string>();
let inserted = 0, updated = 0;
const insertedIds: string[] = [];
```

Zoek in het insert-blok (rond regel 593):
```typescript
        await db.from("automatiseringen").insert({
          id:              newId || `AUTO-HS-${externalId}`,
```

Voeg boven die insert-aanroep toe:
```typescript
        const actualId = newId || `AUTO-HS-${externalId}`;
        insertedIds.push(actualId);
```

En verander de insert zelf:
```typescript
        await db.from("automatiseringen").insert({
          id:              actualId,
```

- [ ] **Step 2: Voeg sync_run_id toe aan de matching pass**

Zoek het commentaar `// ── Endpoint matching pass ──` (regel 632). Voeg vóór die sectie toe:

```typescript
    const syncRunId = crypto.randomUUID();
```

Zoek in de matching pass (rond regel 643–652):
```typescript
    for (const hs of (hsAutos ?? [])) {
      const hsPaths: string[] = hs.webhook_paths ?? [];
      if (hsPaths.length === 0) continue;
      for (const gl of (glAutos ?? [])) {
        const glEndpoints: string[] = gl.endpoints ?? [];
        if (hsPaths.some((p: string) => glEndpoints.includes(p))) {
          newMatches.push({ source_id: hs.id, target_id: gl.id, match_type: "exact", confirmed: false });
        }
      }
    }
```

Vervang de `newMatches.push(...)` regel door:
```typescript
          newMatches.push({ source_id: hs.id, target_id: gl.id, match_type: "exact", confirmed: false, sync_run_id: syncRunId });
```

- [ ] **Step 3: Voeg enrich-aanroepen toe na de cleanup**

Zoek het afsluitende commentaar van de matching pass (regel ~676):
```typescript
    // ─────────────────────────────────────────────────────────────────────────
```

Voeg direct na die regel toe (vóór `await db.from("integrations").update`):

```typescript
    // ── Enrich nieuw gematchte automations ───────────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { data: newLinks } = await db
      .from("automation_links")
      .select("source_id")
      .eq("sync_run_id", syncRunId);

    const matchedSourceIds = new Set((newLinks ?? []).map((l: any) => l.source_id));

    for (const link of (newLinks ?? [])) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/enrich-automation`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ automation_id: link.source_id }),
        });
      } catch { /* negeer fouten */ }
      await new Promise(r => setTimeout(r, 500));
    }

    // Enrich nieuw gesyncde automations zonder match
    for (const id of insertedIds) {
      if (matchedSourceIds.has(id)) continue;
      try {
        await fetch(`${supabaseUrl}/functions/v1/enrich-automation`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ automation_id: id }),
        });
      } catch { /* negeer fouten */ }
      await new Promise(r => setTimeout(r, 500));
    }
    // ─────────────────────────────────────────────────────────────────────────
```

- [ ] **Step 4: Deploy hubspot-sync**

```bash
npx supabase functions deploy hubspot-sync --project-ref <jouw-project-ref>
```

- [ ] **Step 5: Test door een HubSpot sync te draaien**

Ga naar Instellingen → Integraties → HubSpot → Nu synchroniseren. Controleer daarna:

```sql
SELECT id, naam, ai_enrichment->>'summary' as summary
FROM automatiseringen
WHERE source = 'hubspot' AND ai_enrichment IS NOT NULL;
```

Verwacht: minimaal 1 rij met een Nederlandse samenvatting.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/hubspot-sync/index.ts
git commit -m "feat(hubspot-sync): add sync_run_id, track insertedIds, trigger enrich-automation"
```

---

### Task 4: Update gitlab-sync — enrich trigger na sync

**Files:**
- Modify: `supabase/functions/gitlab-sync/index.ts`

Context: na de deactivation-loop (regel ~379) en vóór de integration-timestamp update (regel ~382) moet de enrich-trigger komen.

- [ ] **Step 1: Voeg enrich-trigger toe**

Zoek het commentaar `// Step 5: Update integration timestamp` (regel ~381). Voeg vóór die sectie in:

```typescript
    // Step 4.5: Trigger enrichment voor alle gematchte HubSpot automations
    {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const { data: links } = await (db as any)
        .from("automation_links")
        .select("source_id");

      for (const link of (links ?? [])) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/enrich-automation`, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ automation_id: link.source_id }),
          });
        } catch { /* negeer fouten */ }
        await new Promise(r => setTimeout(r, 500));
      }
    }
```

- [ ] **Step 2: Deploy gitlab-sync**

```bash
npx supabase functions deploy gitlab-sync --project-ref <jouw-project-ref>
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/gitlab-sync/index.ts
git commit -m "feat(gitlab-sync): trigger enrich-automation for all matched automations after sync"
```

---

### Task 5: Vervang Imports.tsx door Review dashboard

**Files:**
- Modify: `src/pages/Imports.tsx` (volledige vervanging)

- [ ] **Step 1: Vervang de volledige inhoud van Imports.tsx**

```tsx
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
  const merge = <T>(field: keyof AiEnrichment): T | undefined =>
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
```

- [ ] **Step 2: Controleer of de imports kloppen**

Open het bestand en verifieer dat `SYSTEMEN` geëxporteerd wordt vanuit `@/lib/types`. Zoek:

```bash
grep -n "^export.*SYSTEMEN" src/lib/types.ts
```

Als `SYSTEMEN` niet geëxporteerd wordt, voeg de export toe in `src/lib/types.ts`:
```typescript
export const SYSTEMEN = [ /* bestaande array */ ] as const;
```

- [ ] **Step 3: Start de dev server en controleer de pagina**

```bash
npm run dev
```

Navigeer naar `/imports`. Verwacht: het nieuwe Review dashboard toont automations met source-badge en AI indicator.

- [ ] **Step 4: Test goedkeuren**

Klik een kaart open, pas een veld aan, klik "Goedkeuren". Verifieer in SQL:
```sql
SELECT id, naam, doel, import_status, approved_at
FROM automatiseringen
WHERE import_status = 'approved'
ORDER BY approved_at DESC LIMIT 3;
```

- [ ] **Step 5: Test afwijzen**

Klik "Afwijzen" op een kaart. Verifieer:
```sql
SELECT id, naam, import_status, rejected_at
FROM automatiseringen
WHERE import_status = 'rejected'
ORDER BY rejected_at DESC LIMIT 3;
-- Verwacht: rejected_at gevuld, import_status = 'rejected'
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/Imports.tsx
git commit -m "feat(ui): replace Imports page with AI-enriched Review dashboard"
```

---

## Verifikatie na alle taken

```sql
-- 1. Heeft AUTO-031 een ai_enrichment na sync?
SELECT id, ai_enrichment->>'summary' as summary, ai_enrichment->>'generated_at' as gegenereerd
FROM automatiseringen WHERE id = 'AUTO-031';

-- 2. Worden afgewezen automations niet meer getoond?
SELECT COUNT(*) FROM automatiseringen WHERE import_status = 'rejected';

-- 3. Worden goedgekeurde automations correct weggeschreven?
SELECT id, naam, doel, systemen, fasen FROM automatiseringen
WHERE import_status = 'approved' ORDER BY approved_at DESC LIMIT 5;

-- 4. Bevat automation_links sync_run_id voor nieuwe links?
SELECT source_id, target_id, sync_run_id FROM automation_links LIMIT 5;
```
