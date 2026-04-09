# Brandy Signaalengine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Brandy Signaalengine — a pure TypeScript signal detection module, a Supabase-persisted mind table, a Gemini-powered analysis edge function, and a mind panel in the Brandy page.

**Architecture:** The frontend runs `detectSignalen()` (pure TS, free) to produce all signals, then sends a compact payload to `brandy-analyse` edge function which calls Gemini for narrative + prioritisation and saves the result to `brandy_mind`. The Brandy page loads the stored mind immediately on open and offers an "Analyseer" button to rebuild.

**Tech Stack:** TypeScript, Vitest, Supabase (Postgres + Edge Functions + Deno), Gemini 2.5 Flash (function calling via OpenAI-compat API), React 18, Tailwind CSS, shadcn/ui.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/lib/signalen.ts` | **Create** | Pure TS signal detection — all 10 signal types |
| `src/test/signalen.test.ts` | **Create** | Vitest tests for all 10 signal types |
| `src/lib/graphProblems.ts` | **Delete** | Replaced by signalen.ts |
| `src/test/domainLogic.test.ts` | **Modify** | Remove detectProblems import + tests |
| `src/lib/brandy.ts` | **Modify** | Add BrandyMind type, fetchBrandyMind, runBrandyAnalyse |
| `src/pages/Brandy.tsx` | **Modify** | Add mind panel + Analyseer button above chat |
| `supabase/migrations/20260409120000_brandy_mind.sql` | **Create** | brandy_mind table + RLS |
| `supabase/functions/brandy-analyse/index.ts` | **Create** | Edge function: Gemini analysis → brandy_mind insert |
| `supabase/config.toml` | **Modify** | Register brandy-analyse function |

---

## Task 1: Write failing tests for signalen.ts

**Files:**
- Create: `src/test/signalen.test.ts`

- [ ] **Step 1.1: Create the test file**

```typescript
// src/test/signalen.test.ts
import { describe, it, expect } from "vitest";
import { detectSignalen } from "@/lib/signalen";
import { Automatisering } from "@/lib/types";

function makeA(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "auto-1",
    naam: "Test Auto",
    categorie: "HubSpot Workflow",
    doel: "Doel",
    trigger: "Form submitted",
    systemen: ["HubSpot"],
    stappen: ["stap 1", "stap 2"],
    afhankelijkheden: "",
    owner: "Jan",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: ["Marketing"],
    createdAt: "2026-01-01T00:00:00Z",
    laatstGeverifieerd: new Date().toISOString(),
    geverifieerdDoor: "",
    ...overrides,
  };
}

describe("detectSignalen", () => {
  // --- Status signals ---

  it("status Verouderd produces outdated signal with ernst error", () => {
    const a = makeA({ status: "Verouderd" });
    const signals = detectSignalen([a]);
    const s = signals.find(x => x.type === "outdated");
    expect(s).toBeDefined();
    expect(s!.ernst).toBe("error");
    expect(s!.categorie).toBe("status");
    expect(s!.automationId).toBe("auto-1");
  });

  it("uitgeschakeld automation referenced by active one produces uitgeschakeld-actief signal", () => {
    const disabled = makeA({ id: "dis-1", status: "Uitgeschakeld", koppelingen: [] });
    const active = makeA({ id: "act-1", status: "Actief", koppelingen: [{ doelId: "dis-1", label: "" }] });
    const signals = detectSignalen([disabled, active]);
    const s = signals.find(x => x.type === "uitgeschakeld-actief" && x.automationId === "dis-1");
    expect(s).toBeDefined();
    expect(s!.ernst).toBe("error");
    expect(s!.categorie).toBe("status");
  });

  it("uitgeschakeld automation NOT referenced by anyone does NOT produce uitgeschakeld-actief", () => {
    const disabled = makeA({ id: "dis-1", status: "Uitgeschakeld", koppelingen: [] });
    const signals = detectSignalen([disabled]);
    expect(signals.some(x => x.type === "uitgeschakeld-actief")).toBe(false);
  });

  // --- Kwaliteit signals ---

  it("empty owner produces missing-owner signal with ernst warning", () => {
    const a = makeA({ owner: "" });
    const signals = detectSignalen([a]);
    const s = signals.find(x => x.type === "missing-owner");
    expect(s).toBeDefined();
    expect(s!.ernst).toBe("warning");
    expect(s!.categorie).toBe("kwaliteit");
  });

  it("empty trigger produces missing-trigger signal", () => {
    const a = makeA({ trigger: "" });
    const signals = detectSignalen([a]);
    expect(signals.some(x => x.type === "missing-trigger")).toBe(true);
  });

  it("empty systemen produces missing-systems signal", () => {
    const a = makeA({ systemen: [] });
    const signals = detectSignalen([a]);
    expect(signals.some(x => x.type === "missing-systems")).toBe(true);
  });

  it("empty doel produces no-goal signal with ernst info", () => {
    const a = makeA({ doel: "" });
    const signals = detectSignalen([a]);
    const s = signals.find(x => x.type === "no-goal");
    expect(s).toBeDefined();
    expect(s!.ernst).toBe("info");
    expect(s!.categorie).toBe("kwaliteit");
  });

  it("hoge complexiteit (>50) with <=1 stap produces hoge-complexiteit signal", () => {
    // berekenComplexiteit: 1 stap (10) + 3 systemen (36 capped) + afhankelijkheden (15) = 61 > 50
    const a = makeA({
      stappen: ["stap 1"],
      systemen: ["HubSpot", "Zapier", "WeFact"],
      afhankelijkheden: "heeft deps",
    });
    const signals = detectSignalen([a]);
    expect(signals.some(x => x.type === "hoge-complexiteit")).toBe(true);
  });

  it("hoge complexiteit with 2+ stappen does NOT produce hoge-complexiteit", () => {
    // Same score (73) but 2 stappen → does NOT fire
    const a = makeA({
      stappen: ["stap 1", "stap 2"],
      systemen: ["HubSpot", "Zapier", "WeFact"],
      afhankelijkheden: "heeft deps",
    });
    const signals = detectSignalen([a]);
    expect(signals.some(x => x.type === "hoge-complexiteit")).toBe(false);
  });

  it("low complexiteit with <=1 stap does NOT produce hoge-complexiteit", () => {
    // berekenComplexiteit: 1 stap (10) + 1 systeem (12) = 22 — not > 50
    const a = makeA({ stappen: ["stap 1"], systemen: ["HubSpot"], afhankelijkheden: "" });
    const signals = detectSignalen([a]);
    expect(signals.some(x => x.type === "hoge-complexiteit")).toBe(false);
  });

  // --- Structuur signals ---

  it("koppeling to non-existent id produces broken-link signal", () => {
    const a = makeA({ koppelingen: [{ doelId: "ghost-id", label: "" }] });
    const signals = detectSignalen([a]);
    expect(signals.some(x => x.type === "broken-link")).toBe(true);
  });

  it("koppeling to existing automation does NOT produce broken-link", () => {
    const a = makeA({ id: "src", koppelingen: [{ doelId: "tgt", label: "" }] });
    const b = makeA({ id: "tgt", koppelingen: [] });
    const signals = detectSignalen([a, b]);
    expect(signals.some(x => x.type === "broken-link")).toBe(false);
  });

  it("automation with no outgoing and no incoming koppelingen is orphan", () => {
    const a = makeA({ id: "lone", koppelingen: [] });
    const signals = detectSignalen([a]);
    const s = signals.find(x => x.type === "orphan" && x.automationId === "lone");
    expect(s).toBeDefined();
    expect(s!.ernst).toBe("warning");
    expect(s!.categorie).toBe("structuur");
  });

  it("automation with no outgoing but an incoming koppeling is NOT orphan", () => {
    const target = makeA({ id: "tgt", koppelingen: [] });
    const source = makeA({ id: "src", koppelingen: [{ doelId: "tgt", label: "" }] });
    const signals = detectSignalen([target, source]);
    expect(signals.some(x => x.type === "orphan" && x.automationId === "tgt")).toBe(false);
  });

  // --- Verificatie signals ---

  it("automation not verified in 90+ days produces unverified warning", () => {
    const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    const a = makeA({ laatstGeverifieerd: ninetyOneDaysAgo });
    const signals = detectSignalen([a]);
    const s = signals.find(x => x.type === "unverified" && x.automationId === "auto-1");
    expect(s).toBeDefined();
    expect(s!.ernst).toBe("warning");
    expect(s!.categorie).toBe("verificatie");
  });

  it("automation never verified (null) produces unverified info signal", () => {
    const a = makeA({ laatstGeverifieerd: null });
    const signals = detectSignalen([a]);
    const s = signals.find(x => x.type === "unverified" && x.automationId === "auto-1");
    expect(s).toBeDefined();
    expect(s!.ernst).toBe("info");
  });

  it("recently verified automation does NOT produce unverified signal", () => {
    const a = makeA({ laatstGeverifieerd: new Date().toISOString() });
    const signals = detectSignalen([a]);
    expect(signals.some(x => x.type === "unverified")).toBe(false);
  });

  // --- Signal id uniqueness ---

  it("multiple broken links produce distinct signal ids", () => {
    const a = makeA({
      koppelingen: [
        { doelId: "ghost-1", label: "" },
        { doelId: "ghost-2", label: "" },
      ],
    });
    const signals = detectSignalen([a]);
    const brokenLinks = signals.filter(x => x.type === "broken-link");
    expect(brokenLinks).toHaveLength(2);
    const ids = brokenLinks.map(s => s.id);
    expect(new Set(ids).size).toBe(2);
  });
});
```

- [ ] **Step 1.2: Run the tests and confirm they fail**

Run: `npm test -- signalen`

Expected: FAIL — `Cannot find module '@/lib/signalen'`

---

## Task 2: Implement signalen.ts

**Files:**
- Create: `src/lib/signalen.ts`

- [ ] **Step 2.1: Create the implementation file**

```typescript
// src/lib/signalen.ts
import { Automatisering, berekenComplexiteit, getVerificatieStatus } from "./types";

export type SignaalType =
  | "outdated"
  | "uitgeschakeld-actief"
  | "missing-owner"
  | "missing-trigger"
  | "missing-systems"
  | "no-goal"
  | "hoge-complexiteit"
  | "broken-link"
  | "orphan"
  | "unverified";

export type Ernst = "error" | "warning" | "info";

export type SignaalCategorie = "status" | "kwaliteit" | "structuur" | "verificatie";

export interface Signaal {
  id: string;          // `${automationId}-${type}` or `${automationId}-${type}-${suffix}`
  automationId: string;
  naam: string;
  type: SignaalType;
  ernst: Ernst;
  categorie: SignaalCategorie;
  bericht: string;
  suggestie: string;
}

export function detectSignalen(automations: Automatisering[]): Signaal[] {
  const signalen: Signaal[] = [];
  const allIds = new Set(automations.map(a => a.id));

  // Build incoming reference map: automationId → set of automationIds that point to it
  const incomingRefs = new Map<string, Set<string>>();
  for (const a of automations) {
    if (!incomingRefs.has(a.id)) incomingRefs.set(a.id, new Set());
    for (const k of (a.koppelingen ?? [])) {
      if (!incomingRefs.has(k.doelId)) incomingRefs.set(k.doelId, new Set());
      incomingRefs.get(k.doelId)!.add(a.id);
    }
  }

  for (const a of automations) {
    const push = (
      type: SignaalType,
      ernst: Ernst,
      categorie: SignaalCategorie,
      bericht: string,
      suggestie: string,
      idSuffix = ""
    ) =>
      signalen.push({
        id: `${a.id}-${type}${idSuffix}`,
        automationId: a.id,
        naam: a.naam,
        type,
        ernst,
        categorie,
        bericht,
        suggestie,
      });

    // ── Status ────────────────────────────────────────────────────────────────

    if (a.status === "Verouderd") {
      push("outdated", "error", "status",
        "Status is 'Verouderd'",
        "Update of archiveer deze automatisering");
    }

    if (a.status === "Uitgeschakeld") {
      const activeRefCount = [...(incomingRefs.get(a.id) ?? [])].filter(refId => {
        const ref = automations.find(x => x.id === refId);
        return ref?.status === "Actief";
      }).length;
      if (activeRefCount > 0) {
        push("uitgeschakeld-actief", "error", "status",
          `Uitgeschakeld maar gerefereerd door ${activeRefCount} actieve automatisering(en)`,
          "Herstel of ontkoppel deze automatisering");
      }
    }

    // ── Kwaliteit ─────────────────────────────────────────────────────────────

    if (!a.owner?.trim()) {
      push("missing-owner", "warning", "kwaliteit",
        "Geen eigenaar ingesteld",
        "Wijs een verantwoordelijke toe");
    }

    if (!a.trigger?.trim()) {
      push("missing-trigger", "warning", "kwaliteit",
        "Geen trigger gedefinieerd",
        "Beschrijf wat deze automatisering activeert");
    }

    if (!a.systemen?.length) {
      push("missing-systems", "warning", "kwaliteit",
        "Geen systemen gekoppeld",
        "Geef aan welke tools/systemen dit gebruikt");
    }

    if (!a.doel?.trim()) {
      push("no-goal", "info", "kwaliteit",
        "Geen doel beschreven",
        "Voeg een korte doelomschrijving toe");
    }

    if (berekenComplexiteit(a) > 50 && (a.stappen?.length ?? 0) <= 1) {
      push("hoge-complexiteit", "warning", "kwaliteit",
        "Hoge complexiteitsscore maar slechts 0–1 stappen gedocumenteerd",
        "Voeg de ontbrekende stappen toe aan de documentatie");
    }

    // ── Structuur ─────────────────────────────────────────────────────────────

    for (const k of (a.koppelingen ?? [])) {
      if (!allIds.has(k.doelId)) {
        push("broken-link", "error", "structuur",
          `Koppeling naar '${k.doelId}' bestaat niet meer`,
          `Verwijder of herstel de koppeling naar ${k.doelId}`,
          `-${k.doelId}`);
      }
    }

    const hasOutgoing = (a.koppelingen?.length ?? 0) > 0;
    const hasIncoming = (incomingRefs.get(a.id)?.size ?? 0) > 0;
    if (!hasOutgoing && !hasIncoming) {
      push("orphan", "warning", "structuur",
        "Staat volledig los — geen koppelingen in of uit",
        "Koppel aan gerelateerde automatiseringen of verwijder indien overbodig");
    }

    // ── Verificatie ───────────────────────────────────────────────────────────

    const vs = getVerificatieStatus(a);
    if (vs === "verouderd") {
      push("unverified", "warning", "verificatie",
        "Niet geverifieerd in 90+ dagen",
        "Controleer of deze automatisering nog klopt");
    } else if (vs === "nooit") {
      push("unverified", "info", "verificatie",
        "Nog nooit geverifieerd",
        "Verifieer deze automatisering voor het eerst");
    }
  }

  return signalen;
}
```

- [ ] **Step 2.2: Run signalen tests and confirm they pass**

Run: `npm test -- signalen`

Expected: All tests PASS.

- [ ] **Step 2.3: Commit**

```bash
git add src/lib/signalen.ts src/test/signalen.test.ts
git commit -m "feat(signalen): add signal detection module with 10 signal types"
```

---

## Task 3: Replace graphProblems.ts

**Files:**
- Delete: `src/lib/graphProblems.ts`
- Modify: `src/test/domainLogic.test.ts`

- [ ] **Step 3.1: Remove the detectProblems import and tests from domainLogic.test.ts**

Replace the entire file with:

```typescript
// src/test/domainLogic.test.ts
/**
 * domainLogic.test.ts
 * Covers berekenComplexiteit and berekenImpact from types.ts.
 * Signal detection tests live in signalen.test.ts.
 */

import { describe, it, expect } from "vitest";
import { berekenComplexiteit, berekenImpact, Automatisering } from "@/lib/types";

function makeAutomatisering(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "auto-1", naam: "Test", categorie: "HubSpot Workflow",
    doel: "Test doel", trigger: "Form submitted", systemen: [],
    stappen: [], afhankelijkheden: "", owner: "Jan", status: "Actief",
    verbeterideeën: "", mermaidDiagram: "", koppelingen: [],
    fasen: [], createdAt: "2026-01-01T00:00:00Z",
    laatstGeverifieerd: null, geverifieerdDoor: "",
    ...overrides,
  };
}

describe("berekenComplexiteit", () => {
  it("empty automation returns 0", () => {
    const a = makeAutomatisering();
    expect(berekenComplexiteit(a)).toBe(0);
  });

  it("4 stappen returns stappenScore of 40", () => {
    const a = makeAutomatisering({ stappen: ["a", "b", "c", "d"] });
    expect(berekenComplexiteit(a)).toBe(40);
  });

  it("cap is respected — 5 stappen still returns 40", () => {
    const a = makeAutomatisering({ stappen: ["a", "b", "c", "d", "e"] });
    expect(berekenComplexiteit(a)).toBe(40);
  });

  it("afhankelijkheden non-empty adds 15", () => {
    const a = makeAutomatisering({ afhankelijkheden: "heeft deps" });
    expect(berekenComplexiteit(a)).toBe(15);
  });

  it("combined scoring: 1 stap + 1 systeem + afhankelijkheden + 1 koppeling = 42", () => {
    const a = makeAutomatisering({
      stappen: ["a"],
      systemen: ["HubSpot"],
      afhankelijkheden: "x",
      koppelingen: [{ doelId: "b", label: "" }],
    });
    // stappenScore=10, systemenScore=12, afhankScore=15, koppScore=5 → 42
    expect(berekenComplexiteit(a)).toBe(42);
  });
});

describe("berekenImpact", () => {
  it("2 fasen and Actief status returns 34 (fasenScore 24 + statusBonus 10)", () => {
    const a = makeAutomatisering({ fasen: ["Marketing", "Sales"], status: "Actief" });
    expect(berekenImpact(a, [a])).toBe(34);
  });

  it("depScore: automation depended on by another scores 20 (+ statusBonus 10 = 30)", () => {
    const autoA = makeAutomatisering({ id: "auto-a", fasen: [], systemen: [], status: "Actief" });
    const autoB = makeAutomatisering({ id: "auto-b", koppelingen: [{ doelId: "auto-a", label: "" }] });
    const score = berekenImpact(autoA, [autoA, autoB]);
    expect(score).toBe(10 + 20); // statusBonus + depScore
  });

  it("Verouderd status adds no bonus", () => {
    const a = makeAutomatisering({ status: "Verouderd" });
    expect(berekenImpact(a, [a])).toBe(0);
  });
});
```

- [ ] **Step 3.2: Delete graphProblems.ts**

```bash
rm "src/lib/graphProblems.ts"
```

- [ ] **Step 3.3: Run all tests and confirm they pass**

Run: `npm test`

Expected: All tests PASS. No import errors.

- [ ] **Step 3.4: Commit**

```bash
git add src/test/domainLogic.test.ts
git rm src/lib/graphProblems.ts
git commit -m "refactor: replace graphProblems with signalen — unified signal detection"
```

---

## Task 4: Supabase migration — brandy_mind table

**Files:**
- Create: `supabase/migrations/20260409120000_brandy_mind.sql`

- [ ] **Step 4.1: Create the migration file**

```sql
-- supabase/migrations/20260409120000_brandy_mind.sql
create table brandy_mind (
  id               uuid primary key default gen_random_uuid(),
  signalen         jsonb not null,
  samenvatting     text not null,
  prioriteiten     jsonb not null,
  automation_count int not null,
  aangemaakt_op    timestamptz not null default now()
);

alter table brandy_mind enable row level security;

create policy "Authenticated users can read brandy_mind"
  on brandy_mind
  for select
  to authenticated
  using (true);
```

Note: The edge function uses the service role key which bypasses RLS — no INSERT policy needed.

- [ ] **Step 4.2: Apply the migration**

Apply via Supabase Studio SQL editor, or run:

```bash
npx supabase db push
```

- [ ] **Step 4.3: Commit**

```bash
git add supabase/migrations/20260409120000_brandy_mind.sql
git commit -m "feat(db): add brandy_mind table for persisted Brandy analysis"
```

---

## Task 5: brandy-analyse edge function

**Files:**
- Create: `supabase/functions/brandy-analyse/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 5.1: Register the function in config.toml**

Add to the end of `supabase/config.toml`:

```toml
[functions.brandy-analyse]
verify_jwt = false
```

- [ ] **Step 5.2: Create the edge function**

```typescript
// supabase/functions/brandy-analyse/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BRANDY_CONTEXT = `
Je bent Brandy, het procesbrein van Brand Boekhouders — een Nederlands boekhoudkantoor.

== BEDRIJFSCONTEXT ==

Brand Boekhouders begeleidt klanten door vijf fasen:
Marketing → Sales → Onboarding → Boekhouding → Offboarding

Kritische bedrijfsregel — Driehoekstructuur:
Elke HubSpot Deal moet gekoppeld zijn aan zowel een Contact als een Company.
Zonder deze driehoek werken automatiseringen niet. Veelgemaakte fout: deal stroomt niet door
naar Klantenbestand omdat Contact of Company ontbreekt.

Hoofdsystemen: HubSpot (CRM + workflows), Zapier (integraties), WeFact (facturatie),
Typeform (klantformulieren), SharePoint (documentopslag), Docufy (documentgeneratie),
Backend (interne API).

Kritieke pipelines: Sales Pipeline → Klantenbestand → BTW → Jaarrekening → IB → VPB.
Elk product heeft een eigen pipeline. Productdeals worden automatisch aangemaakt zodra
een deal actief wordt — alleen als line items uit de Product Library komen.

Veelvoorkomende problemen:
- Deal stroomt niet door → check driehoek + verplichte properties (Intensiteit, Voertaal, SoftwarePortaalCSV)
- Geen productdeals → check line items (Product Library) + driehoek + SoftwarePortaalCSV
- BTW-deal staat in 'Open' → bankkoppeling niet actief
- IB kan niet gemaakt worden → machtiging VIG ontbreekt of JR-deal niet afgerond

Je taak: analyseer het volledige automatiseringslandschap vanuit deze bedrijfscontext.
Wees direct, concreet en eerlijk. Benoem zowel wat goed gaat als wat zorgwekkend is.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { signalen, automations } = await req.json() as {
      signalen: Array<{
        id: string;
        automationId: string;
        naam: string;
        type: string;
        ernst: string;
        categorie: string;
        bericht: string;
        suggestie: string;
      }>;
      automations: Array<{
        id: string;
        naam: string;
        status: string;
        fasen: string[];
        systemen: string[];
        owner: string;
        stappenCount: number;
        complexiteit: number;
      }>;
    };

    if (!signalen || !automations) {
      return new Response(JSON.stringify({ error: "signalen en automations zijn verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    // Compact signal summary grouped by categorie
    const signaalSummary = signalen.map(s =>
      `[${s.ernst.toUpperCase()}] ${s.naam} — ${s.type}: ${s.bericht}`
    ).join("\n");

    // Slim automation list
    const autoSummary = automations.map(a =>
      `${a.naam} | status: ${a.status} | fasen: ${a.fasen.join(", ")} | systemen: ${a.systemen.join(", ")} | owner: ${a.owner || "—"} | stappen: ${a.stappenCount} | complexiteit: ${a.complexiteit}`
    ).join("\n");

    const userMessage = `
== SIGNALEN (${signalen.length} totaal) ==
${signaalSummary}

== AUTOMATISERINGEN (${automations.length} stuks) ==
${autoSummary}

Analyseer dit landschap. Schrijf een Nederlandse samenvatting van de huidige staat.
Kies dan de 5 meest urgente signal-IDs op basis van bedrijfsimpact.
    `.trim();

    const response = await fetch(
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
            { role: "system", content: BRANDY_CONTEXT },
            { role: "user", content: userMessage },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "brandy_analyse_resultaat",
                description: "Geef het resultaat van de analyse",
                parameters: {
                  type: "object",
                  properties: {
                    samenvatting: {
                      type: "string",
                      description:
                        "Nederlandse proza-samenvatting van de staat van het automatiseringslandschap. Wees direct en concreet. Noem patronen, risico's en wat goed gaat.",
                    },
                    prioriteiten: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "De 5 meest urgente signal IDs (exact zoals aangeleverd), gesorteerd van hoogste naar laagste prioriteit op basis van bedrijfsimpact.",
                    },
                  },
                  required: ["samenvatting", "prioriteiten"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "brandy_analyse_resultaat" } },
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Gemini error:", response.status, text);
      return new Response(
        JSON.stringify({ error: `Gemini fout ${response.status}: ${text}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "Geen analyse van Brandy ontvangen" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments) as {
      samenvatting: string;
      prioriteiten: string[];
    };

    // Save to brandy_mind using service role (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: mindRow, error: insertError } = await supabaseAdmin
      .from("brandy_mind")
      .insert({
        signalen,
        samenvatting: parsed.samenvatting,
        prioriteiten: parsed.prioriteiten,
        automation_count: automations.length,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: `Opslaan mislukt: ${insertError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(mindRow), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brandy-analyse error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 5.3: Commit**

```bash
git add supabase/functions/brandy-analyse/index.ts supabase/config.toml
git commit -m "feat(edge): add brandy-analyse function — Gemini analysis + brandy_mind insert"
```

---

## Task 6: Frontend — BrandyMind type + lib functions

**Files:**
- Modify: `src/lib/brandy.ts`

- [ ] **Step 6.1: Add BrandyMind type and two new functions to brandy.ts**

Replace the entire file:

```typescript
// src/lib/brandy.ts
import { supabase } from "@/integrations/supabase/client";
import type { Automatisering } from "@/lib/types";
import { berekenComplexiteit } from "@/lib/types";
import type { Signaal } from "@/lib/signalen";

// ── Brandy chat types ────────────────────────────────────────────────────────

export interface BrandyContext {
  automationId?: string;
  automationNaam?: string;
}

export interface BrandyResponse {
  antwoord: string;
  bronnen: string[];
  entiteiten: string[];
  zekerheid: "hoog" | "gemiddeld" | "laag";
}

export type BrandyFeedbackLabel = "correct" | "incorrect" | "onvolledig";

export interface BrandyMessage {
  id: string;
  type: "user" | "brandy";
  content: string;
  response?: BrandyResponse;
  context?: BrandyContext;
  timestamp: Date;
}

// ── Brandy mind types ────────────────────────────────────────────────────────

export interface BrandyMind {
  id: string;
  signalen: Signaal[];
  samenvatting: string;
  prioriteiten: string[];      // signal IDs ranked by urgency
  automation_count: number;
  aangemaakt_op: string;
}

// ── Chat functions ────────────────────────────────────────────────────────────

export async function askBrandy(
  vraag: string,
  automations: Automatisering[],
  context?: BrandyContext
): Promise<BrandyResponse> {
  const { data, error } = await supabase.functions.invoke("brandy-ask", {
    body: { vraag, context, automations },
  });

  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        if (body?.error) throw new Error(body.error);
      } catch (e: unknown) {
        if (e instanceof Error && e.message !== error.message) throw e;
      }
    }
    throw new Error(error.message);
  }

  return data as BrandyResponse;
}

export async function sendBrandyFeedback(
  vraag: string,
  antwoord: string,
  label: BrandyFeedbackLabel
): Promise<void> {
  await supabase.functions.invoke("brandy-feedback", {
    body: { vraag, antwoord, label },
  });
}

// ── Mind functions ─────────────────────────────────────────────────────────────

export async function fetchBrandyMind(): Promise<BrandyMind | null> {
  const { data } = await supabase
    .from("brandy_mind")
    .select("*")
    .order("aangemaakt_op", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as BrandyMind | null);
}

export async function runBrandyAnalyse(
  signalen: Signaal[],
  automations: Automatisering[]
): Promise<BrandyMind> {
  const slimAutomations = automations.map(a => ({
    id: a.id,
    naam: a.naam,
    status: a.status,
    fasen: a.fasen ?? [],
    systemen: a.systemen ?? [],
    owner: a.owner ?? "",
    stappenCount: a.stappen?.length ?? 0,
    complexiteit: berekenComplexiteit(a),
  }));

  const { data, error } = await supabase.functions.invoke("brandy-analyse", {
    body: { signalen, automations: slimAutomations },
  });

  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        if (body?.error) throw new Error(body.error);
      } catch (e: unknown) {
        if (e instanceof Error && e.message !== error.message) throw e;
      }
    }
    throw new Error(error.message);
  }

  return data as BrandyMind;
}
```

- [ ] **Step 6.2: Run all tests to confirm no regressions**

Run: `npm test`

Expected: All tests PASS.

- [ ] **Step 6.3: Commit**

```bash
git add src/lib/brandy.ts
git commit -m "feat(brandy): add BrandyMind type + fetchBrandyMind + runBrandyAnalyse"
```

---

## Task 7: Frontend — Brandy.tsx mind panel

**Files:**
- Modify: `src/pages/Brandy.tsx`

- [ ] **Step 7.1: Replace Brandy.tsx with the updated version including the mind panel**

```tsx
// src/pages/Brandy.tsx
import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, ThumbsUp, ThumbsDown, AlertCircle, Sparkles, RefreshCw } from "lucide-react";
import {
  askBrandy,
  sendBrandyFeedback,
  fetchBrandyMind,
  runBrandyAnalyse,
  BrandyMessage,
  BrandyFeedbackLabel,
  BrandyMind,
} from "@/lib/brandy";
import { detectSignalen } from "@/lib/signalen";
import { useAutomatiseringen } from "@/lib/hooks";
import { toast } from "sonner";

const SUGGESTED_QUESTIONS = [
  "Waarom is een deal niet doorgestroomd naar het Klantenbestand?",
  "Welke rol speelt SoftwarePortaalCSV?",
  "Wat gebeurt er na 'Offerte geaccepteerd start'?",
  "Waarom zijn er geen productdeals aangemaakt?",
  "Wat is de driehoekstructuur en waarom is die belangrijk?",
  "Hoe werkt de BTW-pipeline?",
];

const ERNST_CLASSES: Record<string, string> = {
  error: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-blue-100 text-blue-700",
};

export default function Brandy() {
  const [searchParams] = useSearchParams();
  const { data: automations = [] } = useAutomatiseringen();

  // Mind state
  const [mind, setMind] = useState<BrandyMind | null>(null);
  const [mindFetching, setMindFetching] = useState(true);
  const [mindLoading, setMindLoading] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<BrandyMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const contextId = searchParams.get("context") ?? undefined;
  const contextNaam = searchParams.get("naam") ?? undefined;

  useEffect(() => {
    fetchBrandyMind().then(setMind).finally(() => setMindFetching(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleAnalyse() {
    setMindLoading(true);
    try {
      const signalen = detectSignalen(automations);
      const result = await runBrandyAnalyse(signalen, automations);
      setMind(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analyse mislukt");
    } finally {
      setMindLoading(false);
    }
  }

  async function handleSubmit(vraag?: string) {
    const q = (vraag ?? input).trim();
    if (!q || loading) return;

    const userMsg: BrandyMessage = {
      id: crypto.randomUUID(),
      type: "user",
      content: q,
      timestamp: new Date(),
    };

    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await askBrandy(q, automations, {
        automationId: contextId,
        automationNaam: contextNaam,
      });

      const brandyMsg: BrandyMessage = {
        id: crypto.randomUUID(),
        type: "brandy",
        content: response.antwoord,
        response,
        context: contextId ? { automationId: contextId, automationNaam: contextNaam } : undefined,
        timestamp: new Date(),
      };

      setMessages((m) => [...m, brandyMsg]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Brandy kon geen antwoord geven");
      setMessages((m) => m.filter((msg) => msg.id !== userMsg.id));
    } finally {
      setLoading(false);
    }
  }

  async function handleFeedback(msg: BrandyMessage, label: BrandyFeedbackLabel) {
    if (feedbackSent.has(msg.id)) return;
    setFeedbackSent((s) => new Set(s).add(msg.id));
    const userQuestion = [...messages].reverse().find(
      (m) => m.type === "user" && messages.indexOf(m) < messages.indexOf(msg)
    )?.content ?? "";
    await sendBrandyFeedback(userQuestion, msg.content, label);
    toast.success("Feedback ontvangen, dank je!");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const showWelcome = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">Brandy</h1>
            <p className="text-xs text-muted-foreground">Procesbrein van Brand Boekhouders</p>
          </div>
        </div>
        {(contextId || contextNaam) && (
          <div className="mt-2 text-xs text-muted-foreground bg-secondary/60 rounded px-3 py-1.5 inline-block">
            Context: {contextNaam || contextId}
          </div>
        )}
      </div>

      {/* Mind panel */}
      <div className="px-6 py-4 border-b border-border bg-secondary/20 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Analyse</span>
            {mind && (
              <span className="text-[11px] text-muted-foreground">
                {new Date(mind.aangemaakt_op).toLocaleDateString("nl-NL", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                {" · "}
                {mind.automation_count} automatiseringen
              </span>
            )}
          </div>
          <button
            onClick={handleAnalyse}
            disabled={mindLoading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {mindLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Analyseer
          </button>
        </div>

        {mindFetching ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : !mind ? (
          <p className="text-sm text-muted-foreground italic">
            Brandy heeft nog geen analyse uitgevoerd — klik op Analyseer om te beginnen.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-foreground/80 leading-relaxed">{mind.samenvatting}</p>
            {mind.prioriteiten.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  Prioritaire signalen
                </p>
                <div className="grid gap-1.5">
                  {mind.prioriteiten.map((sigId) => {
                    const sig = mind.signalen.find((s) => s.id === sigId);
                    if (!sig) return null;
                    return (
                      <div
                        key={sigId}
                        className="flex items-start gap-2 px-3 py-2 rounded-md border border-border bg-card text-sm"
                      >
                        <span
                          className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${ERNST_CLASSES[sig.ernst] ?? ""}`}
                        >
                          {sig.ernst}
                        </span>
                        <span>
                          <span className="font-medium">{sig.naam}</span>
                          <span className="text-muted-foreground"> — {sig.bericht}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {showWelcome && (
          <div className="max-w-2xl mx-auto">
            <p className="text-sm text-muted-foreground mb-4">
              Stel een vraag over processen, HubSpot-structuur, automatiseringen of het systeem van Brand Boekhouders.
            </p>
            <div className="grid gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSubmit(q)}
                  className="text-left text-sm px-4 py-2.5 rounded-md border border-border bg-card hover:bg-secondary/60 transition-colors text-foreground/80"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.type === "user" ? (
                <div className="max-w-[75%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm">
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-[85%] space-y-3">
                  <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 space-y-3">
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    {msg.response && msg.response.entiteiten.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
                        {msg.response.entiteiten.map((e) => (
                          <span key={e} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-foreground/70 border border-border">
                            {e}
                          </span>
                        ))}
                      </div>
                    )}
                    {msg.response && msg.response.bronnen.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[10px] text-muted-foreground">Bronnen:</span>
                        {msg.response.bronnen.map((b) => (
                          <span key={b} className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-foreground/70">
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                    {msg.response?.zekerheid === "laag" && (
                      <div className="flex items-center gap-1.5 text-[10px] text-amber-600">
                        <AlertCircle className="h-3 w-3" />
                        Brandy is niet volledig zeker van dit antwoord — controleer indien kritisch
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] text-muted-foreground">Klopt dit?</span>
                    {feedbackSent.has(msg.id) ? (
                      <span className="text-[10px] text-muted-foreground italic">Feedback ontvangen</span>
                    ) : (
                      <>
                        <button
                          onClick={() => handleFeedback(msg, "correct")}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-emerald-600 transition-colors"
                        >
                          <ThumbsUp className="h-3 w-3" /> Klopt
                        </button>
                        <button
                          onClick={() => handleFeedback(msg, "incorrect")}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <ThumbsDown className="h-3 w-3" /> Klopt niet
                        </button>
                        <button
                          onClick={() => handleFeedback(msg, "onvolledig")}
                          className="text-[10px] text-muted-foreground hover:text-amber-600 transition-colors"
                        >
                          ⚠ Onvolledig
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border bg-card px-6 py-4">
        <div className="flex gap-3 items-end max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Stel een vraag aan Brandy..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow max-h-32 overflow-y-auto"
            style={{ minHeight: "42px" }}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || loading}
            className="h-[42px] w-[42px] shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="text-center text-[10px] text-muted-foreground mt-2">
          Brandy werkt op basis van portaldata en proceskennis — controleer kritische beslissingen altijd zelf.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 7.2: Run all tests to confirm no regressions**

Run: `npm test`

Expected: All tests PASS.

- [ ] **Step 7.3: Commit**

```bash
git add src/pages/Brandy.tsx
git commit -m "feat(brandy): add mind panel with Analyseer button to Brandy page"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task | Status |
|---|---|---|
| BSIG-01: outdated signal | Task 1, 2 | ✓ |
| BSIG-02: missing-owner signal | Task 1, 2 | ✓ |
| BSIG-03: hoge-complexiteit signal | Task 1, 2 | ✓ |
| BSIG-04: uitgeschakeld-actief signal | Task 1, 2 | ✓ |
| All 8 graphProblems signals ported | Task 1, 2 | ✓ |
| graphProblems.ts deleted | Task 3 | ✓ |
| brandy_mind table | Task 4 | ✓ |
| brandy-analyse edge function | Task 5 | ✓ |
| Slim automation payload to Gemini | Task 6 | ✓ |
| Static business context in edge fn | Task 5 | ✓ |
| fetchBrandyMind | Task 6 | ✓ |
| runBrandyAnalyse | Task 6 | ✓ |
| Mind panel in Brandy.tsx | Task 7 | ✓ |
| Manual Analyseer button | Task 7 | ✓ |
| Instant load of existing mind | Task 7 | ✓ |
| config.toml registered | Task 5 | ✓ |
