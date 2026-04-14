# Brandy Diagnose-Assistent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brandy gets always-on diagnose behaviour — she asks one targeted follow-up question when needed, tracks diagnose state in her response schema, and the frontend shows an amber banner ("Brandy diagnosticeert — stap N") while she's working through a problem.

**Architecture:** Three-layer change: (1) edge function gets new schema fields + system prompt section, (2) TypeScript types get optional `diagnose_modus` / `stap_nummer` fields, (3) Brandy.tsx reads those fields to conditionally render a banner above brandy messages.

**Tech Stack:** Deno (edge function), TypeScript + React 18, Tailwind CSS, Vitest

---

### Task 1: Update `brandy_antwoord` tool schema in edge function

**Files:**
- Modify: `supabase/functions/brandy-ask/index.ts`

- [ ] **Step 1: Add `diagnose_modus` and `stap_nummer` to the tool schema properties**

In `supabase/functions/brandy-ask/index.ts`, find the `properties` object inside the `brandy_antwoord` tool definition (around line 470). Add two new fields after `zekerheid`:

```typescript
                  diagnose_modus: {
                    type: "boolean",
                    description: "true zolang Brandy nog doorvraagt of redeneert naar een oorzaak. false zodra er een conclusie is of bij een eenvoudige informatievraag.",
                  },
                  stap_nummer: {
                    type: "integer",
                    minimum: 1,
                    description: "Huidige stapnummer in de diagnose. Begint bij 1, loopt op per vervolgvraag. Zet op 1 als diagnose_modus = true voor het eerst.",
                  },
```

- [ ] **Step 2: Add both fields to the `required` array**

Change:
```typescript
                required: ["antwoord", "bronnen", "entiteiten", "zekerheid"],
```
To:
```typescript
                required: ["antwoord", "bronnen", "entiteiten", "zekerheid", "diagnose_modus", "stap_nummer"],
```

- [ ] **Step 3: Add section 19 to `BRANDY_SYSTEM_PROMPT`**

At the end of the `BRANDY_SYSTEM_PROMPT` string, just before the closing backtick, add:

```
---

## 19. DIAGNOSE-GEDRAG

Als je meer context nodig hebt om een goede diagnose te stellen: stel precies één gerichte vervolgvraag. Niet meerdere tegelijk. Wacht op het antwoord voordat je verdere conclusies trekt.

Zet diagnose_modus = true zolang je nog doorvraagt of redeneert naar een oorzaak. Zet stap_nummer op het huidige stapnummer (begin bij 1, verhoog met 1 per vervolgvraag). Zodra je een duidelijke conclusie kunt geven — oorzaak + oplossing — zet je diagnose_modus = false.

Bij eenvoudige informatievragen (geen probleem, geen fout) stel je geen vervolgvraag en zet je diagnose_modus = false en stap_nummer = 1 direct.
```

- [ ] **Step 4: Deploy the edge function**

```bash
npx supabase functions deploy brandy-ask --project-ref icvrrpxtycwgaxcajwdf
```

Expected output:
```
Deployed Functions on project icvrrpxtycwgaxcajwdf: brandy-ask
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/brandy-ask/index.ts
git commit -m "feat(brandy): add diagnose_modus + stap_nummer to response schema and system prompt"
```

---

### Task 2: Update TypeScript types in `brandy.ts`

**Files:**
- Modify: `src/lib/brandy.ts`

- [ ] **Step 1: Add `diagnose_modus` and `stap_nummer` to `BrandyResponse`**

In `src/lib/brandy.ts`, find the `BrandyResponse` interface (line 14). Add two optional fields:

```typescript
export interface BrandyResponse {
  antwoord: string;
  bronnen: string[];
  entiteiten: string[];
  zekerheid: "hoog" | "gemiddeld" | "laag";
  diagnose_modus?: boolean;
  stap_nummer?: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/brandy.ts
git commit -m "feat(brandy): add diagnose_modus and stap_nummer to BrandyResponse type"
```

---

### Task 3: Render diagnose-banner in `Brandy.tsx`

**Files:**
- Modify: `src/pages/Brandy.tsx`

- [ ] **Step 1: Add the `Search` icon import**

In `Brandy.tsx` line 5, add `Search` to the lucide-react import:

```typescript
import { Send, Loader2, ThumbsUp, ThumbsDown, AlertCircle, Sparkles, RefreshCw, Search } from "lucide-react";
```

- [ ] **Step 2: Add diagnose-banner rendering inside the brandy message bubble**

Find this block in `Brandy.tsx` (around line 266):

```tsx
                <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 space-y-3">
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
```

Replace with:

```tsx
                <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 space-y-3">
                    {msg.response?.diagnose_modus && (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 -mx-1">
                        <Search className="h-3 w-3 shrink-0" />
                        Brandy diagnosticeert{msg.response.stap_nummer ? ` — stap ${msg.response.stap_nummer}` : ""}
                      </div>
                    )}
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
```

- [ ] **Step 3: Add "Conclusie" badge for the message that ends a diagnose sequence**

To detect whether the previous Brandy message had `diagnose_modus = true`, we need access to the message index. Find the messages map (around line 252):

```tsx
          {messages.map((msg) => (
```

Replace with:

```tsx
          {messages.map((msg, idx) => (
```

Then find the brandy message header div (the one containing `max-w-[85%] space-y-3`) and add a conclusie badge. Find the outer brandy message div:

```tsx
                <div className="max-w-[85%] space-y-3">
                  <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 space-y-3">
```

Replace with:

```tsx
                <div className="max-w-[85%] space-y-3">
                  {(() => {
                    const prevBrandy = messages.slice(0, idx).reverse().find(m => m.type === "brandy");
                    const isConclusie = prevBrandy?.response?.diagnose_modus === true && msg.response?.diagnose_modus === false;
                    return isConclusie ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium px-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                        Conclusie
                      </div>
                    ) : null;
                  })()}
                  <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 space-y-3">
```

- [ ] **Step 4: Verify the app compiles without TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Brandy.tsx
git commit -m "feat(brandy): show diagnose banner and conclusie badge in chat"
```

---

### Task 4: Manual smoke test

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open Brandy and ask a diagnostic question**

Navigate to `/brandy`. Type: `Waarom zijn er geen productdeals aangemaakt voor een klant?`

Expected: Brandy responds with `diagnose_modus = true`, amber banner shows "Brandy diagnosticeert — stap 1", and she asks one follow-up question.

- [ ] **Step 3: Answer the follow-up question**

Reply with a simple answer, e.g. `De driehoek is compleet en de line items komen uit de Product Library.`

Expected: Brandy either continues diagnosing (banner shows stap 2) or gives a conclusion (green "Conclusie" badge above her final message).

- [ ] **Step 4: Ask a simple informational question**

Type: `Wat is de driehoekstructuur?`

Expected: Brandy responds normally, no amber banner (since `diagnose_modus = false`).

- [ ] **Step 5: Commit if no issues found**

```bash
git add -p  # stage any last tweaks
git commit -m "fix(brandy): smoke test fixes if any"
```

If there are no issues, skip this commit.
