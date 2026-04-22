# Flow Stappen Beschrijving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically generate a business-readable summary + step list for every flow using Gemini, shown on FlowDetail and refreshed when constituent automations change.

**Architecture:** A new `describe-flow` Supabase Edge Function receives automation data and returns `{ samenvatting, stappen }`. The client calls it from a `describeFlow()` storage function that also writes the result back to the `flows` table. `FlowDetail` checks staleness on load (comparing `stappenBijgewerktAt` against `aiDescriptionUpdatedAt` on each automation) and triggers generation automatically when stale. Two new nullable columns on `flows` store the result.

**Tech Stack:** Deno (Edge Function), Gemini 2.5 Flash via OpenAI-compatible endpoint, Supabase Postgres, React 18 + TypeScript, TanStack Query v5.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260422000000_flows_stappen.sql` | Create | Add `stappen_beschrijving` + `stappen_bijgewerkt_at` columns |
| `supabase/functions/describe-flow/index.ts` | Create | Receive automation data, call Gemini, return `{samenvatting, stappen}` |
| `src/lib/types.ts` | Modify | Add `stappenBeschrijving` + `stappenBijgewerktAt` to `Flow` |
| `src/lib/supabaseStorage.ts` | Modify | Map new columns in `fetchFlows`, update `insertFlow` signature, add `describeFlow()` |
| `src/lib/hooks.ts` | Modify | Update `useCreateFlow` signature to omit new fields |
| `src/pages/FlowDetail.tsx` | Modify | Staleness check useEffect, loading skeleton, "Wat doet deze flow?" section |

---

### Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260422000000_flows_stappen.sql`

- [ ] **Step 1: Write the migration file**

```sql
ALTER TABLE flows
  ADD COLUMN IF NOT EXISTS stappen_beschrijving JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stappen_bijgewerkt_at TIMESTAMPTZ DEFAULT NULL;
```

- [ ] **Step 2: Apply the migration**

Run:
```bash
npx supabase db push
```

Expected output: `Applying migration 20260422000000_flows_stappen.sql... Finished supabase db push.`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260422000000_flows_stappen.sql
git commit -m "feat(flows): add stappen_beschrijving columns to flows table"
```

---

### Task 2: Edge Function `describe-flow`

**Files:**
- Create: `supabase/functions/describe-flow/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AutomationInput {
  naam: string;
  stappenInSimpeleTaal: string[];
  doel: string;
  trigger: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { automations } = await req.json() as { automations: AutomationInput[] };

    if (!automations?.length) {
      return new Response(JSON.stringify({ error: "automations required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const automationList = automations
      .map((a, i) => {
        const stappen = a.stappenInSimpeleTaal?.length
          ? a.stappenInSimpeleTaal.map((s, j) => `  ${j + 1}. ${s}`).join("\n")
          : `  Doel: ${a.doel}\n  Trigger: ${a.trigger}`;
        return `Automatisering ${i + 1}: ${a.naam}\n${stappen}`;
      })
      .join("\n\n");

    const prompt = `Je krijgt een reeks automatiseringen die samen één flow vormen, in volgorde van uitvoering.

${automationList}

Schrijf een zakelijke beschrijving van deze flow voor een niet-technisch publiek (medewerkers van een boekhoudkantoor).

Antwoord uitsluitend in dit JSON-formaat:
{
  "samenvatting": "2-4 zinnen die beschrijven wat de flow doet van begin tot eind, in begrijpelijke taal zonder jargon.",
  "stappen": ["Beschrijving van stap 1 in gewone taal.", "Beschrijving van stap 2.", "..."]
}

De stappen zijn een lijst van ALLE stappen die plaatsvinden in de hele flow, van eerste automatisering tot laatste. Schrijf elke stap als een volledige zin in het Nederlands. Geen technisch jargon.`;

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
              content:
                "Je bent een technische assistent voor een Nederlands boekhoudkantoor. Antwoord alleen in het gevraagde JSON-formaat. Geen extra tekst.",
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
    let result: { samenvatting: string; stappen: string[] };
    try {
      result = JSON.parse(cleaned);
    } catch {
      throw new Error(`Gemini: ongeldige JSON: ${cleaned.slice(0, 100)}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("describe-flow error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

- [ ] **Step 2: Deploy the edge function**

```bash
npx supabase functions deploy describe-flow
```

Expected: `Deployed Functions describe-flow`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/describe-flow/index.ts
git commit -m "feat(flows): add describe-flow edge function"
```

---

### Task 3: Types + Storage + Hook

**Files:**
- Modify: `src/lib/types.ts` (lines 54-62)
- Modify: `src/lib/supabaseStorage.ts`
- Modify: `src/lib/hooks.ts`

- [ ] **Step 1: Update the `Flow` interface in `src/lib/types.ts`**

Replace the existing `Flow` interface (lines 54-62):

```typescript
export interface Flow {
  id: string;
  naam: string;
  beschrijving: string;
  systemen: Systeem[];
  automationIds: string[];
  createdAt: string;
  updatedAt: string;
  stappenBeschrijving: {
    samenvatting: string;
    stappen: string[];
  } | null;
  stappenBijgewerktAt: string | null;
}
```

- [ ] **Step 2: Run type check to verify no downstream breakage**

```bash
npx tsc --noEmit
```

Expected: errors only in `supabaseStorage.ts` and `hooks.ts` (not yet updated). Fix those next.

- [ ] **Step 3: Update `fetchFlows` mapping in `src/lib/supabaseStorage.ts`**

Find the `fetchFlows` function and add two lines to the `.map()` callback. The full updated mapper:

```typescript
return (data ?? []).map((r) => ({
  id: r.id,
  naam: r.naam,
  beschrijving: r.beschrijving ?? "",
  systemen: (r.systemen ?? []) as Systeem[],
  automationIds: r.automation_ids ?? [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  stappenBeschrijving: r.stappen_beschrijving ?? null,
  stappenBijgewerktAt: r.stappen_bijgewerkt_at ?? null,
}));
```

- [ ] **Step 4: Update `insertFlow` signature in `src/lib/supabaseStorage.ts`**

The new `Flow` interface has `stappenBeschrijving` and `stappenBijgewerktAt`. These are DB-managed fields (set only by `describeFlow`), so exclude them from the insert signature. Replace the function signature:

```typescript
export async function insertFlow(
  flow: Omit<Flow, "id" | "createdAt" | "updatedAt" | "stappenBeschrijving" | "stappenBijgewerktAt">,
): Promise<Flow> {
```

Also update the return value inside `insertFlow` to include the two new fields (they will be null on fresh insert):

```typescript
  return {
    id: data.id,
    naam: data.naam,
    beschrijving: data.beschrijving ?? "",
    systemen: (data.systemen ?? []) as Systeem[],
    automationIds: data.automation_ids ?? [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    stappenBeschrijving: data.stappen_beschrijving ?? null,
    stappenBijgewerktAt: data.stappen_bijgewerkt_at ?? null,
  };
```

- [ ] **Step 5: Add `describeFlow()` to `src/lib/supabaseStorage.ts`**

Add this after the `nameFlow` function at the end of the file:

```typescript
export interface FlowStappenResult {
  samenvatting: string;
  stappen: string[];
}

export async function describeFlow(
  flowId: string,
  automations: Pick<Automatisering, "naam" | "doel" | "trigger" | "beschrijvingInSimpeleTaal">[],
): Promise<void> {
  const result = await invokeEdgeFunction<FlowStappenResult>("describe-flow", {
    automations: automations.map((a) => ({
      naam: a.naam,
      stappenInSimpeleTaal: a.beschrijvingInSimpeleTaal ?? [],
      doel: a.doel,
      trigger: a.trigger,
    })),
  });

  const { error } = await db
    .from("flows")
    .update({
      stappen_beschrijving: result,
      stappen_bijgewerkt_at: new Date().toISOString(),
    })
    .eq("id", flowId);
  if (error) throw error;
}
```

- [ ] **Step 6: Update `useCreateFlow` signature in `src/lib/hooks.ts`**

The mutation function type must match the updated `insertFlow` signature. Find `useCreateFlow` and update:

```typescript
export function useCreateFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      flow: Omit<Flow, "id" | "createdAt" | "updatedAt" | "stappenBeschrijving" | "stappenBijgewerktAt">,
    ) => insertFlow(flow),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flows"] });
    },
  });
}
```

- [ ] **Step 7: Run type check — should pass cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Run tests**

```bash
npx vitest run
```

Expected: 108 passed, 0 failed.

- [ ] **Step 9: Commit**

```bash
git add src/lib/types.ts src/lib/supabaseStorage.ts src/lib/hooks.ts
git commit -m "feat(flows): add stappenBeschrijving fields and describeFlow storage function"
```

---

### Task 4: FlowDetail — Staleness Check + UI

**Files:**
- Modify: `src/pages/FlowDetail.tsx`

**Context:** The current file is at `src/pages/FlowDetail.tsx`. It already imports `useFlows`, `useAutomatiseringen`, `useUpdateFlow`, `useDeleteFlow` from hooks. It uses `flow.automationIds` to render the step list.

- [ ] **Step 1: Add required imports at the top of `FlowDetail.tsx`**

The current import line is:
```typescript
import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { useFlows, useAutomatiseringen, useUpdateFlow, useDeleteFlow } from "@/lib/hooks";
import type { Automatisering, Systeem } from "@/lib/types";
```

Replace with:
```typescript
import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFlows, useAutomatiseringen, useUpdateFlow, useDeleteFlow } from "@/lib/hooks";
import { describeFlow } from "@/lib/supabaseStorage";
import type { Automatisering, Systeem } from "@/lib/types";
```

- [ ] **Step 2: Add `useQueryClient` and generation state after the existing hook calls**

Currently after line `const deleteFlow = useDeleteFlow();` the file has:

```typescript
  const flow = useMemo(() => flows.find((f) => f.id === id), [flows, id]);
```

Insert the following between `useDeleteFlow` and `useMemo`:

```typescript
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const generateTriggeredRef = useRef<string | null>(null);
```

- [ ] **Step 3: Compute `flowAutomations` as a memoized value**

After the existing `autoMap` useMemo, add:

```typescript
  const flowAutomations = useMemo(
    () =>
      (flow?.automationIds ?? [])
        .map((aid) => autoMap.get(aid))
        .filter((a): a is Automatisering => a !== undefined),
    [flow?.automationIds, autoMap],
  );
```

- [ ] **Step 4: Add the staleness-check useEffect**

Add this effect after the existing `useEffect` that syncs `naam`/`beschrijving`:

```typescript
  // Auto-generate "Wat doet deze flow?" when stale
  useEffect(() => {
    if (!flow || flowAutomations.length === 0) return;
    if (generateTriggeredRef.current === flow.id) return;

    const isStale =
      flow.stappenBijgewerktAt === null ||
      flowAutomations.some(
        (a) =>
          a.aiDescriptionUpdatedAt != null &&
          a.aiDescriptionUpdatedAt > (flow.stappenBijgewerktAt ?? ""),
      );

    if (!isStale) return;

    generateTriggeredRef.current = flow.id;
    setIsGenerating(true);
    setGenerateError(null);
    describeFlow(flow.id, flowAutomations)
      .then(() => queryClient.invalidateQueries({ queryKey: ["flows"] }))
      .catch((e) =>
        setGenerateError(e instanceof Error ? e.message : "Beschrijving genereren mislukt"),
      )
      .finally(() => setIsGenerating(false));
  }, [flow?.id, flowAutomations.length]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 5: Add the "Wat doet deze flow?" section to the JSX**

In the `return (...)` block, find the `{/* Footer */}` comment (the delete section). Insert the new section directly above it:

```tsx
      {/* Wat doet deze flow? */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold mb-3">Wat doet deze flow?</h2>
        {isGenerating ? (
          <div className="space-y-2">
            <div className="h-3 bg-secondary rounded animate-pulse w-full" />
            <div className="h-3 bg-secondary rounded animate-pulse w-5/6" />
            <div className="h-3 bg-secondary rounded animate-pulse w-4/6" />
          </div>
        ) : generateError ? (
          <p className="text-sm text-destructive">
            {generateError}{" "}
            <button
              className="underline"
              onClick={() => {
                generateTriggeredRef.current = null;
                setGenerateError(null);
                if (!flow || flowAutomations.length === 0) return;
                setIsGenerating(true);
                describeFlow(flow.id, flowAutomations)
                  .then(() => queryClient.invalidateQueries({ queryKey: ["flows"] }))
                  .catch((e) =>
                    setGenerateError(
                      e instanceof Error ? e.message : "Beschrijving genereren mislukt",
                    ),
                  )
                  .finally(() => setIsGenerating(false));
              }}
            >
              Probeer opnieuw
            </button>
          </p>
        ) : flow.stappenBeschrijving ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {flow.stappenBeschrijving.samenvatting}
            </p>
            <ol className="space-y-1.5 list-none">
              {flow.stappenBeschrijving.stappen.map((stap, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-secondary text-secondary-foreground text-[10px] font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{stap}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nog geen beschrijving beschikbaar.</p>
        )}
      </div>
```

- [ ] **Step 6: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run tests**

```bash
npx vitest run
```

Expected: 108 passed, 0 failed.

- [ ] **Step 8: Commit**

```bash
git add src/pages/FlowDetail.tsx
git commit -m "feat(flows): auto-generate business description on FlowDetail"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Two new DB columns (`stappen_beschrijving`, `stappen_bijgewerkt_at`) — Task 1
- ✅ Edge function `describe-flow` with Dutch prompt, fallback to `doel`/`trigger` — Task 2
- ✅ `Flow` type extended — Task 3
- ✅ `fetchFlows` maps new columns — Task 3
- ✅ `describeFlow()` calls edge function + writes to DB — Task 3
- ✅ Staleness check on load using `aiDescriptionUpdatedAt` — Task 4
- ✅ Loading skeleton while generating — Task 4
- ✅ Error state with "Probeer opnieuw" — Task 4
- ✅ Samenvatting paragraph + numbered stappen list — Task 4
- ✅ Read-only section (no inline editing) — Task 4

**Type consistency:**
- `describeFlow(flowId, automations)` defined in Task 3, called in Task 4 — ✓
- `flow.stappenBeschrijving` shape `{ samenvatting: string; stappen: string[] }` defined in Task 3, accessed in Task 4 — ✓
- `flow.stappenBijgewerktAt` defined in Task 3, used in staleness check in Task 4 — ✓
- `generateTriggeredRef` defined in Task 4 Step 2, used in Steps 4 and 5 — ✓
