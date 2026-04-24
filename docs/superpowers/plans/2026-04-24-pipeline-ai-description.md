# Pipeline AI-beschrijving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toon een AI-gegenereerde Nederlandstalige samenvatting van elke pipeline in het hero-blok van de detailpagina, opgeslagen in de database en automatisch bijgewerkt wanneer stages wijzigen tijdens een HubSpot-sync.

**Architecture:** Een nieuwe `beschrijving` kolom in de `pipelines` tabel slaat de tekst op. Een nieuwe Edge Function `describe-pipeline` roept `gemini-2.5-flash` aan en slaat het resultaat op. De `hubspot-pipelines` sync-functie detecteert stage-wijzigingen en regenereert inline. De frontend toont de opgeslagen waarde en triggert eenmalige generatie via `useEffect` als `beschrijving` null is.

**Tech Stack:** Supabase (PostgreSQL + Edge Functions), Deno, Gemini API (`gemini-2.5-flash`), React 18, TypeScript, TanStack Query v5

---

## File Map

| File | Actie | Verantwoordelijkheid |
|---|---|---|
| `supabase/migrations/YYYYMMDDHHMMSS_add_beschrijving_to_pipelines.sql` | Aanmaken | DB-kolom toevoegen |
| `supabase/functions/describe-pipeline/index.ts` | Aanmaken | Gemini aanroepen, beschrijving opslaan |
| `supabase/functions/hubspot-pipelines/index.ts` | Aanpassen | Stage-vergelijking + inline Gemini bij wijziging |
| `src/lib/types.ts` | Aanpassen | `beschrijving` toevoegen aan `Pipeline` |
| `src/lib/supabaseStorage.ts` | Aanpassen | `PipelineRow` + mapping bijwerken, `triggerDescribePipeline` toevoegen |
| `src/lib/hooks.ts` | Aanpassen | `useDescribePipeline` hook toevoegen |
| `src/pages/PipelineDetail.tsx` | Aanpassen | Beschrijving tonen in hero, `useEffect` voor generatie |

---

## Task 1: Database migratie — `beschrijving` kolom

**Files:**
- Aanmaken: `supabase/migrations/20260424000000_add_beschrijving_to_pipelines.sql`

- [ ] **Stap 1: Maak het migratiebestand aan**

Maak `supabase/migrations/20260424000000_add_beschrijving_to_pipelines.sql` met:

```sql
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS beschrijving text;
```

- [ ] **Stap 2: Voer de migratie uit**

```bash
cd "c:\Users\SebastiaanMol\Desktop\Nieuwe map\automation-navigator"
npx supabase db push
```

Als `supabase db push` niet beschikbaar is, gebruik dan de Supabase Dashboard SQL-editor en voer de query handmatig uit.

- [ ] **Stap 3: Verifieer de kolom bestaat**

```bash
npx supabase db diff
```

Of controleer in de Supabase Dashboard dat `pipelines.beschrijving` zichtbaar is als nullable text kolom.

- [ ] **Stap 4: Commit**

```bash
git add supabase/migrations/20260424000000_add_beschrijving_to_pipelines.sql
git commit -m "feat(pipelines): add beschrijving column to pipelines table"
```

---

## Task 2: Edge Function `describe-pipeline`

**Files:**
- Aanmaken: `supabase/functions/describe-pipeline/index.ts`

Volg exact hetzelfde patroon als `supabase/functions/describe-flow/index.ts`.

- [ ] **Stap 1: Maak de Edge Function aan**

Maak `supabase/functions/describe-pipeline/index.ts` met:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pipeline_id } = await req.json() as { pipeline_id: string };

    if (!pipeline_id) {
      return new Response(
        JSON.stringify({ error: "pipeline_id is verplicht" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pipeline, error: dbError } = await db
      .from("pipelines")
      .select("pipeline_id, naam, stages")
      .eq("pipeline_id", pipeline_id)
      .maybeSingle();

    if (dbError || !pipeline) {
      return new Response(
        JSON.stringify({ error: "Pipeline niet gevonden" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stages = (pipeline.stages ?? []) as Array<{ label: string; display_order: number }>;
    const sortedStages = [...stages].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const stageList = sortedStages.map((s, i) => `${i + 1}. ${s.label}`).join("\n");

    const prompt = `Je krijgt een HubSpot deal-pipeline genaamd "${pipeline.naam}" met de volgende stages:\n${stageList}\n\nSchrijf een zakelijke beschrijving van 2-3 zinnen die uitlegt wat het doel van deze pipeline is en wat het proces globaal inhoudt. Schrijf voor medewerkers van een boekhoudkantoor, geen technisch jargon. Antwoord uitsluitend in het Nederlands.\n\nAntwoord in JSON: { "beschrijving": "..." }`;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is niet geconfigureerd");

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "Je bent een technische assistent voor een Nederlands boekhoudkantoor. Antwoord alleen in het gevraagde JSON-formaat. Geen extra tekst.",
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

    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    let result: { beschrijving: string };
    try {
      result = JSON.parse(cleaned);
    } catch {
      throw new Error(`Gemini: ongeldige JSON: ${cleaned.slice(0, 100)}`);
    }

    const { error: updateError } = await db
      .from("pipelines")
      .update({ beschrijving: result.beschrijving })
      .eq("pipeline_id", pipeline_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ beschrijving: result.beschrijving }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("describe-pipeline error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

- [ ] **Stap 2: Deploy de Edge Function**

```bash
cd "c:\Users\SebastiaanMol\Desktop\Nieuwe map\automation-navigator"
npx supabase functions deploy describe-pipeline
```

- [ ] **Stap 3: Commit**

```bash
git add supabase/functions/describe-pipeline/index.ts
git commit -m "feat(pipelines): add describe-pipeline edge function"
```

---

## Task 3: `hubspot-pipelines` aanpassen voor stage-detectie

**Files:**
- Aanpassen: `supabase/functions/hubspot-pipelines/index.ts`

Vóór elke upsert: bestaande stages + beschrijving ophalen. Als stage-IDs veranderd zijn of beschrijving ontbreekt → Gemini aanroepen en nieuwe beschrijving meenemen in upsert.

- [ ] **Stap 1: Vervang het bestand volledig**

Vervang `supabase/functions/hubspot-pipelines/index.ts` met:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateDescription(
  naam: string,
  stages: Array<{ label: string; display_order: number }>,
  geminiKey: string,
): Promise<string | null> {
  const sortedStages = [...stages].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const stageList = sortedStages.map((s, i) => `${i + 1}. ${s.label}`).join("\n");
  const prompt = `Je krijgt een HubSpot deal-pipeline genaamd "${naam}" met de volgende stages:\n${stageList}\n\nSchrijf een zakelijke beschrijving van 2-3 zinnen die uitlegt wat het doel van deze pipeline is en wat het proces globaal inhoudt. Schrijf voor medewerkers van een boekhoudkantoor, geen technisch jargon. Antwoord uitsluitend in het Nederlands.\n\nAntwoord in JSON: { "beschrijving": "..." }`;

  try {
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
              content: "Je bent een technische assistent voor een Nederlands boekhoudkantoor. Antwoord alleen in het gevraagde JSON-formaat. Geen extra tekst.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      },
    );
    if (!res.ok) return null;
    const geminiResult = await res.json();
    const content = geminiResult.choices?.[0]?.message?.content;
    if (!content) return null;
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const result = JSON.parse(cleaned) as { beschrijving: string };
    return result.beschrijving ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: integration, error: intError } = await db
      .from("integrations")
      .select("*")
      .eq("type", "hubspot")
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ error: "Geen HubSpot-integratie gevonden. Sla eerst een token op via Instellingen." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = integration.token as string;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

    const res = await fetch(
      "https://api.hubapi.com/crm/v3/pipelines/deals?includeInactive=false",
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      const errBody = await res.text();
      const msg = res.status === 401
        ? "Ongeldige HubSpot token — sla de verbinding opnieuw op via Instellingen."
        : `HubSpot Pipelines API fout (${res.status}): ${errBody.slice(0, 200)}`;
      await db.from("integrations")
        .update({ status: "error", error_message: msg })
        .eq("id", integration.id);
      return new Response(
        JSON.stringify({ error: msg }),
        { status: res.status === 401 ? 401 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pipelinesBody = await res.json();
    const pipelines: any[] = pipelinesBody.results ?? [];
    const now = new Date().toISOString();
    let upserted = 0;

    for (const pipeline of pipelines) {
      const stages = [...(pipeline.stages ?? [])]
        .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((s: any) => ({
          stage_id:      s.id,
          label:         s.label,
          display_order: s.displayOrder ?? 0,
          metadata:      s.metadata ?? {},
        }));

      // Fetch existing row to compare stages and preserve beschrijving
      const { data: existing } = await db
        .from("pipelines")
        .select("stages, beschrijving")
        .eq("pipeline_id", pipeline.id)
        .maybeSingle();

      const existingIds = ((existing?.stages ?? []) as Array<{ stage_id: string }>)
        .map((s) => s.stage_id).sort().join(",");
      const newIds = stages.map((s) => s.stage_id).sort().join(",");
      const stagesChanged = existingIds !== newIds;
      const needsDescription = !existing?.beschrijving;

      let beschrijving: string | null = existing?.beschrijving ?? null;
      if ((stagesChanged || needsDescription) && GEMINI_API_KEY) {
        beschrijving = await generateDescription(pipeline.label, stages, GEMINI_API_KEY);
      }

      const { error } = await db.from("pipelines").upsert(
        {
          pipeline_id:  pipeline.id,
          naam:         pipeline.label,
          stages,
          synced_at:    now,
          ...(beschrijving !== null ? { beschrijving } : {}),
        },
        { onConflict: "pipeline_id" },
      );

      if (error) throw error;
      upserted++;
    }

    return new Response(
      JSON.stringify({ success: true, upserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("hubspot-pipelines error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

- [ ] **Stap 2: Deploy de functie**

```bash
npx supabase functions deploy hubspot-pipelines
```

- [ ] **Stap 3: Commit**

```bash
git add supabase/functions/hubspot-pipelines/index.ts
git commit -m "feat(pipelines): regenerate AI description on stage change during sync"
```

---

## Task 4: Types, storage en hook bijwerken

**Files:**
- Aanpassen: `src/lib/types.ts` (regel ~Pipeline interface)
- Aanpassen: `src/lib/supabaseStorage.ts` (regels 396–414)
- Aanpassen: `src/lib/hooks.ts`

- [ ] **Stap 1: Voeg `beschrijving` toe aan `Pipeline` interface in `src/lib/types.ts`**

Zoek de `Pipeline` interface (ziet er zo uit):
```typescript
export interface Pipeline {
  pipelineId: string;
  naam:       string;
  stages:     PipelineStage[];
  syncedAt:   string;
}
```

Vervang met:
```typescript
export interface Pipeline {
  pipelineId:   string;
  naam:         string;
  stages:       PipelineStage[];
  syncedAt:     string;
  beschrijving: string | null;
}
```

- [ ] **Stap 2: Werk `PipelineRow` en `fetchPipelines` bij in `src/lib/supabaseStorage.ts`**

Zoek `interface PipelineRow` (rond regel 396) en vervang:
```typescript
interface PipelineRow {
  pipeline_id: string;
  naam:        string;
  stages:      PipelineStage[] | null;
  synced_at:   string;
}
```
Met:
```typescript
interface PipelineRow {
  pipeline_id:  string;
  naam:         string;
  stages:       PipelineStage[] | null;
  synced_at:    string;
  beschrijving: string | null;
}
```

Zoek vervolgens de `fetchPipelines` mapping (rond regel 409) en vervang:
```typescript
  return (data as PipelineRow[] ?? []).map((r) => ({
    pipelineId: r.pipeline_id,
    naam:       r.naam,
    stages:     r.stages ?? [],
    syncedAt:   r.synced_at,
  }));
```
Met:
```typescript
  return (data as PipelineRow[] ?? []).map((r) => ({
    pipelineId:   r.pipeline_id,
    naam:         r.naam,
    stages:       r.stages ?? [],
    syncedAt:     r.synced_at,
    beschrijving: r.beschrijving ?? null,
  }));
```

Voeg ook een nieuwe export-functie toe direct na `triggerHubSpotPipelinesSync` (rond regel 419):

```typescript
export async function triggerDescribePipeline(pipelineId: string): Promise<{ beschrijving: string }> {
  return invokeEdgeFunction<{ beschrijving: string }>("describe-pipeline", { pipeline_id: pipelineId });
}
```

- [ ] **Stap 3: Voeg `useDescribePipeline` toe aan `src/lib/hooks.ts`**

Voeg de import toe aan de bestaande import-regel bovenaan:
```typescript
import { ..., triggerDescribePipeline } from "./supabaseStorage";
```

Voeg de hook toe direct na `useHubSpotPipelinesSync`:

```typescript
export function useDescribePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pipelineId: string) => triggerDescribePipeline(pipelineId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}
```

- [ ] **Stap 4: Verifieer geen TypeScript-fouten**

```bash
cd "c:\Users\SebastiaanMol\Desktop\Nieuwe map\automation-navigator"
npx tsc --noEmit 2>&1 | head -30
```

Expected: geen fouten gerelateerd aan de gewijzigde bestanden.

- [ ] **Stap 5: Run tests**

```bash
npm test 2>&1 | tail -8
```

Expected: 116 tests passing.

- [ ] **Stap 6: Commit**

```bash
git add src/lib/types.ts src/lib/supabaseStorage.ts src/lib/hooks.ts
git commit -m "feat(pipelines): add beschrijving to Pipeline type, storage mapping, and useDescribePipeline hook"
```

---

## Task 5: `PipelineDetail.tsx` — beschrijving tonen in hero

**Files:**
- Aanpassen: `src/pages/PipelineDetail.tsx`

- [ ] **Stap 1: Voeg `Sparkles` toe aan de lucide-react import**

Zoek de import-regel:
```typescript
import { ArrowLeft, Check, ChevronRight, Layers2 } from "lucide-react";
```

Vervang met:
```typescript
import { ArrowLeft, Check, ChevronRight, Layers2, Sparkles } from "lucide-react";
```

- [ ] **Stap 2: Voeg `useDescribePipeline` toe aan de imports**

Zoek:
```typescript
import { usePipelines } from "@/lib/hooks";
```

Vervang met:
```typescript
import { usePipelines, useDescribePipeline } from "@/lib/hooks";
```

- [ ] **Stap 3: Voeg de hook en `useEffect` toe in de component**

Voeg `useEffect` toe aan de React-import bovenaan:
```typescript
import type { ReactNode } from "react";
```
Vervang met:
```typescript
import { useEffect, type ReactNode } from "react";
```

Voeg in de component-body, direct na de regels met `usePipelines` en `useNavigate`, toe:

```typescript
const describeMutation = useDescribePipeline();
```

Voeg vervolgens, direct na de `const sortedStages = ...` regel (na de guards), een `useEffect` toe:

```typescript
useEffect(() => {
  if (pipeline && !pipeline.beschrijving && !describeMutation.isPending) {
    describeMutation.mutate(pipeline.pipelineId);
  }
}, [pipeline?.pipelineId]);
```

- [ ] **Stap 4: Voeg de beschrijving toe in het hero-blok**

In het hero-blok, zoek het sluitende `</div>` van de `flex items-start justify-between` container. Voeg direct erna (maar nog binnen de buitenste hero `<div>`) de beschrijving-sectie toe:

```tsx
        {/* AI beschrijving */}
        <div
          className="mt-4 rounded-lg px-3 py-2.5"
          style={{ background: "rgba(255,255,255,0.15)" }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles
              className="w-2.5 h-2.5 flex-shrink-0"
              style={{ color: "rgba(255,255,255,0.8)" }}
            />
            <span
              className="text-[9px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              AI Samenvatting
            </span>
          </div>
          {pipeline.beschrijving ? (
            <p
              className="text-[11px] leading-relaxed"
              style={{ color: "rgba(255,255,255,0.9)" }}
            >
              {pipeline.beschrijving}
            </p>
          ) : (
            <div className="space-y-1.5 animate-pulse">
              <div
                className="h-2 rounded-full w-full"
                style={{ background: "rgba(255,255,255,0.25)" }}
              />
              <div
                className="h-2 rounded-full w-4/5"
                style={{ background: "rgba(255,255,255,0.25)" }}
              />
              <p
                className="text-[8px] mt-1"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                Beschrijving wordt gegenereerd…
              </p>
            </div>
          )}
        </div>
```

- [ ] **Stap 5: Verifieer geen TypeScript-fouten**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: geen fouten.

- [ ] **Stap 6: Run tests**

```bash
npm test 2>&1 | tail -8
```

Expected: 116 tests passing.

- [ ] **Stap 7: Commit**

```bash
git add src/pages/PipelineDetail.tsx
git commit -m "feat(pipelines): show AI description in hero with loading skeleton"
```

---

## Handmatige verificatie

Na alle taken:

1. Start dev server: `npm run dev`
2. Open `/pipelines` en klik op een pipeline
3. Als geen beschrijving aanwezig: laadskelet zichtbaar in hero, na enkele seconden verschijnt de tekst
4. Herlaad de pagina: beschrijving direct zichtbaar (geen laadskelet meer)
5. Voer een HubSpot sync uit via de Sync-knop op `/pipelines`; controleer in de Supabase Dashboard dat `beschrijving` is opgeslagen
6. Simuleer stage-wijziging: verander een stage-label in HubSpot en sync opnieuw — beschrijving moet geüpdatet worden
