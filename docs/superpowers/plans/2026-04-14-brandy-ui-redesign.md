# Brandy UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Brandy page with a tabbed chatbot UI — a "Chat" tab (existing conversation) and an "Inzichten" tab (analysis dashboard with category grid, narrative, summary stats, and suggestions).

**Architecture:** Single-file refactor of `src/pages/Brandy.tsx`. The existing mind/analyse panel is removed from the chat view and replaced by the full Inzichten dashboard. A `BrandySuggestie` type is added to `src/lib/brandy.ts`, a DB migration adds a `suggesties` column to `brandy_mind`, and the `brandy-analyse` edge function is updated to ask Gemini for suggestions and store/return them.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vite, Vitest, Supabase Edge Functions (Deno), Gemini 2.5 Flash (tool_choice)

---

## File Map

| File | Change |
|---|---|
| `src/lib/brandy.ts` | Add `BrandySuggestie` interface + `suggesties?` to `BrandyMind` |
| `supabase/migrations/20260414120000_brandy_mind_suggesties.sql` | Add `suggesties jsonb` column to `brandy_mind` |
| `supabase/functions/brandy-analyse/index.ts` | Add `suggesties` to Gemini schema, parse + store + return |
| `src/pages/Brandy.tsx` | Full layout refactor: tab state, pill tab bar, chat/inzichten split, Inzichten dashboard |

---

### Task 1: Add `BrandySuggestie` type to brandy.ts

**Files:**
- Modify: `src/lib/brandy.ts:36-43`

The current `BrandyMind` interface has no `suggesties` field. Add a `BrandySuggestie` interface and an optional `suggesties` field. Optional = backward compat with existing DB rows that don't have this column yet.

- [ ] **Step 1: Add `BrandySuggestie` and update `BrandyMind` in `src/lib/brandy.ts`**

Replace the existing `BrandyMind` interface (currently lines 36–43):

```typescript
// ── Brandy mind types ────────────────────────────────────────────────────────

export interface BrandySuggestie {
  titel: string;
  body: string;
  tags: string[];
}

export interface BrandyMind {
  id: string;
  signalen: Signaal[];
  samenvatting: string;
  prioriteiten: string[];      // signal IDs ranked by urgency
  automation_count: number;
  aangemaakt_op: string;
  suggesties?: BrandySuggestie[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from project root:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/brandy.ts
git commit -m "feat(brandy): add BrandySuggestie type and suggesties field to BrandyMind"
```

---

### Task 2: DB migration + edge function update for suggesties

**Files:**
- Create: `supabase/migrations/20260414120000_brandy_mind_suggesties.sql`
- Modify: `supabase/functions/brandy-analyse/index.ts`

Add a nullable `suggesties jsonb` column to `brandy_mind` (defaulting to `'[]'` so existing rows don't break). Update the edge function to ask Gemini for suggestions, parse them, store them in the DB, and return them.

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/20260414120000_brandy_mind_suggesties.sql` with:

```sql
-- supabase/migrations/20260414120000_brandy_mind_suggesties.sql
alter table brandy_mind
  add column if not exists suggesties jsonb not null default '[]'::jsonb;
```

- [ ] **Step 2: Apply migration locally**

```bash
npx supabase db push
```
Expected: migration applied, no errors.

- [ ] **Step 3: Update brandy-analyse edge function**

Replace the entire content of `supabase/functions/brandy-analyse/index.ts` with:

```typescript
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

    if (!Array.isArray(signalen) || !Array.isArray(automations) || automations.length === 0) {
      return new Response(JSON.stringify({ error: "signalen en automations zijn verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const signaalSummary = signalen.map(s =>
      `[${s.ernst.toUpperCase()}] ${s.naam} — ${s.type}: ${s.bericht}`
    ).join("\n");

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
Geef ook 2-3 concrete suggesties voor nieuwe automations die ontbreken op basis van de bedrijfscontext.
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
                    suggesties: {
                      type: "array",
                      description: "2-3 concrete suggesties voor nieuwe automations die ontbreken",
                      items: {
                        type: "object",
                        properties: {
                          titel: { type: "string", description: "Korte titel van de suggestie" },
                          body: { type: "string", description: "Uitleg waarom deze automation nuttig is en wat hij doet" },
                          tags: {
                            type: "array",
                            items: { type: "string" },
                            description: "2-3 trefwoorden (pipeline, systeem, proces)",
                          },
                        },
                        required: ["titel", "body", "tags"],
                      },
                    },
                  },
                  required: ["samenvatting", "prioriteiten", "suggesties"],
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

    let parsed: { samenvatting: string; prioriteiten: string[]; suggesties: Array<{ titel: string; body: string; tags: string[] }> };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(JSON.stringify({ error: "Brandy stuurde een onleesbaar antwoord" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        suggesties: parsed.suggesties ?? [],
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

- [ ] **Step 4: Deploy edge function**

```bash
npx supabase functions deploy brandy-analyse
```
Expected: `Deployed Function brandy-analyse`

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260414120000_brandy_mind_suggesties.sql supabase/functions/brandy-analyse/index.ts
git commit -m "feat(brandy-analyse): add suggesties to Gemini schema, DB column, and response"
```

---

### Task 3: Tab bar + Chat tab refactor in Brandy.tsx

**Files:**
- Modify: `src/pages/Brandy.tsx`

Remove the existing mind panel section. Add `activeTab` state. Add a pill-style tab bar (full-width background, centered inner content). Wrap the existing chat messages + input in `activeTab === "chat"`. Add a placeholder for the Inzichten tab (filled in Task 4). Apply centering to the chat messages area.

The current Brandy.tsx is ~385 lines. The key structural changes are:

1. Add `activeTab` state (line ~39 area)
2. Remove the entire mind panel section (lines ~157–228)
3. Add tab bar between header and content
4. Wrap messages + input in conditional render
5. Add `max-w-3xl mx-auto` wrapper inside the messages area

- [ ] **Step 1: Add `activeTab` state**

In `src/pages/Brandy.tsx`, find the existing state declarations (around line 39–49) and add `activeTab`:

```typescript
// Chat state
const [messages, setMessages] = useState<BrandyMessage[]>([]);
const [input, setInput] = useState("");
const [loading, setLoading] = useState(false);
const [feedbackSent, setFeedbackSent] = useState<Set<string>>(new Set());
const [activeTab, setActiveTab] = useState<"chat" | "inzichten">("chat");
```

- [ ] **Step 2: Add a `handleSignaalClick` function**

Add this function after `handleKeyDown` (around line 133), before the `showWelcome` variable. This is used in Task 4 but needs to be in scope for the whole component:

```typescript
function handleSignaalClick(sig: { naam: string; bericht: string }) {
  setActiveTab("chat");
  handleSubmit(`Wat moet ik doen met het signaal "${sig.naam}"? (${sig.bericht})`);
}
```

- [ ] **Step 3: Replace the outer JSX structure**

The current return starts with:
```tsx
return (
  <div className="flex flex-col h-[calc(100vh-48px)]">
    {/* Header */}
    <div className="px-6 py-4 border-b border-border bg-card shrink-0">
```

Replace the entire return statement with the new structure below. The Chat tab content is the existing messages + input (from the old render). The Inzichten tab gets a placeholder `<div>` for now.

Full new return:

```tsx
// Derived counts for tab badge
const badgeCount = mind
  ? mind.signalen.filter((s) => s.ernst === "error" || s.ernst === "warning").length
  : 0;

return (
  <div className="flex flex-col h-[calc(100vh-48px)]">
    {/* Header */}
    <div className="px-6 py-3 border-b border-border bg-card shrink-0">
      <div className="max-w-5xl mx-auto flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-base font-semibold leading-tight">Brandy</h1>
          <p className="text-xs text-muted-foreground">Procesbrein van Brand Boekhouders</p>
        </div>
      </div>
    </div>

    {/* Tab bar */}
    <div className="px-6 py-2 border-b border-border bg-card shrink-0">
      <div className="max-w-5xl mx-auto flex items-center gap-3">
        {/* Pill group */}
        <div className="flex bg-[#f0f0f2] rounded-[10px] p-[3px] gap-0.5">
          <button
            onClick={() => setActiveTab("chat")}
            className={
              activeTab === "chat"
                ? "px-4 py-1.5 rounded-[8px] bg-white shadow-sm ring-1 ring-black/5 text-sm font-semibold text-foreground flex items-center gap-1.5"
                : "px-4 py-1.5 rounded-[8px] text-sm font-medium text-muted-foreground hover:text-foreground/70 flex items-center gap-1.5 transition-colors"
            }
          >
            💬 Chat
          </button>
          <button
            onClick={() => setActiveTab("inzichten")}
            className={
              activeTab === "inzichten"
                ? "px-4 py-1.5 rounded-[8px] bg-white shadow-sm ring-1 ring-black/5 text-sm font-semibold text-foreground flex items-center gap-1.5"
                : "px-4 py-1.5 rounded-[8px] text-sm font-medium text-muted-foreground hover:text-foreground/70 flex items-center gap-1.5 transition-colors"
            }
          >
            ✦ Inzichten
            {badgeCount > 0 && (
              <span className="text-[9px] font-bold bg-red-100 text-red-600 rounded-full px-1.5 py-0.5 leading-none">
                {badgeCount}
              </span>
            )}
          </button>
        </div>

        {/* Analyseer button */}
        <button
          onClick={handleAnalyse}
          disabled={mindLoading || mindFetching}
          className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {mindLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {mind ? "Analyseer opnieuw" : "Analyseer"}
        </button>
      </div>
    </div>

    {/* Chat tab */}
    {activeTab === "chat" && (
      <>
        {/* Context banner */}
        {(contextId || contextNaam) && (
          <div className="px-6 py-2 bg-card border-b border-border shrink-0">
            <div className="max-w-3xl mx-auto">
              <div className="text-xs text-muted-foreground bg-secondary/60 rounded px-3 py-1.5 inline-block">
                Context: {contextNaam || contextId}
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {showWelcome && (
              <div className="max-w-2xl">
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
              {messages.map((msg, idx) => (
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
                        {msg.response?.diagnose_modus && (
                          <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 -mx-1">
                            <Search className="h-3 w-3 shrink-0" />
                            Brandy diagnosticeert{msg.response.stap_nummer ? ` — stap ${msg.response.stap_nummer}` : ""}
                          </div>
                        )}
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
      </>
    )}

    {/* Inzichten tab — placeholder, filled in Task 4 */}
    {activeTab === "inzichten" && (
      <div className="flex-1 overflow-y-auto py-6">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-sm text-muted-foreground">Inzichten worden hier geladen...</p>
        </div>
      </div>
    )}
  </div>
);
```

Note: `showWelcome` already exists in the original file at line 135 (`const showWelcome = messages.length === 0;`). Add `badgeCount` on the line immediately after it, before the `return`:
```typescript
const showWelcome = messages.length === 0;

const badgeCount = mind
  ? mind.signalen.filter((s) => s.ernst === "error" || s.ernst === "warning").length
  : 0;

return (
```

- [ ] **Step 4: Verify TypeScript compiles and dev server starts**

```bash
npx tsc --noEmit
npm run dev
```
Expected: no TypeScript errors. Dev server starts. Brandy page shows header + pill tabs + chat working. Inzichten tab shows placeholder text.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Brandy.tsx
git commit -m "feat(brandy): add pill-style tab bar and restructure Chat tab layout"
```

---

### Task 4: Inzichten dashboard UI

**Files:**
- Modify: `src/pages/Brandy.tsx`

Replace the placeholder Inzichten section (added in Task 3) with the full dashboard: summary row, Brandy narrative, 4-category signal grid, and suggestions section.

The `Signaal` type from `src/lib/signalen.ts` already has a `categorie` field (`"status" | "kwaliteit" | "structuur" | "verificatie"`).

Import `type { Signaal }` from `@/lib/signalen` at the top of `Brandy.tsx` — it is already imported transitively through `brandy.ts`, but we need it directly for `handleSignaalClick`'s parameter type.

- [ ] **Step 1: Add `Signaal` type to the existing signalen import in Brandy.tsx**

At the top of `src/pages/Brandy.tsx`, find the existing line:
```typescript
import { detectSignalen } from "@/lib/signalen";
```

Update it to also import the `Signaal` type:
```typescript
import { detectSignalen, type Signaal } from "@/lib/signalen";
```

- [ ] **Step 2: Update `handleSignaalClick` signature**

The `handleSignaalClick` function added in Task 3 uses an inline object type. Replace it with the `Signaal` type:

```typescript
function handleSignaalClick(sig: Signaal) {
  setActiveTab("chat");
  handleSubmit(`Wat moet ik doen met het signaal "${sig.naam}"? (${sig.bericht})`);
}
```

- [ ] **Step 3: Replace the Inzichten placeholder with the full dashboard**

Find the placeholder section added in Task 3:
```tsx
{/* Inzichten tab — placeholder, filled in Task 4 */}
{activeTab === "inzichten" && (
  <div className="flex-1 overflow-y-auto py-6">
    <div className="max-w-5xl mx-auto px-6">
      <p className="text-sm text-muted-foreground">Inzichten worden hier geladen...</p>
    </div>
  </div>
)}
```

Replace it with:

```tsx
{/* Inzichten tab */}
{activeTab === "inzichten" && (
  <div className="flex-1 overflow-y-auto py-5">
    <div className="max-w-5xl mx-auto px-6 flex flex-col gap-5">

      {/* Loading state */}
      {mindFetching && (
        <p className="text-sm text-muted-foreground">Laden...</p>
      )}

      {/* Empty state */}
      {!mindFetching && !mind && (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">Brandy heeft nog geen analyse uitgevoerd.</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">Klik op Analyseer om te beginnen.</p>
        </div>
      )}

      {mind && (() => {
        // Derived counts
        const errorCount = mind.signalen.filter((s) => s.ernst === "error").length;
        const warningCount = mind.signalen.filter((s) => s.ernst === "warning").length;
        const suggestieCount = mind.suggesties?.length ?? 0;
        const okCount = Math.max(0, mind.automation_count - errorCount - warningCount);
        const analyseDate = new Date(mind.aangemaakt_op).toLocaleDateString("nl-NL", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });

        const CATEGORIES: Array<{
          key: "status" | "kwaliteit" | "structuur" | "verificatie";
          label: string;
          icon: string;
          iconBg: string;
          countBg: string;
          countText: string;
        }> = [
          { key: "status", label: "Status", icon: "🔄", iconBg: "bg-amber-100", countBg: "bg-amber-100", countText: "text-amber-700" },
          { key: "kwaliteit", label: "Kwaliteit", icon: "📋", iconBg: "bg-blue-100", countBg: "bg-blue-100", countText: "text-blue-700" },
          { key: "structuur", label: "Structuur", icon: "🔗", iconBg: "bg-green-100", countBg: "bg-green-100", countText: "text-green-700" },
          { key: "verificatie", label: "Verificatie", icon: "✓", iconBg: "bg-purple-100", countBg: "bg-purple-100", countText: "text-purple-700" },
        ];

        const ernstDot = (ernst: string) => {
          if (ernst === "error") return "bg-red-500";
          if (ernst === "warning") return "bg-amber-400";
          return "bg-indigo-400";
        };

        return (
          <>
            {/* Summary row */}
            <div className="grid grid-cols-5 gap-3">
              <div className="bg-card border border-border rounded-xl p-3.5">
                <div className="text-2xl font-bold leading-none mb-1 text-red-600">{errorCount}</div>
                <div className="text-[11px] text-muted-foreground">Errors</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-3.5">
                <div className="text-2xl font-bold leading-none mb-1 text-amber-600">{warningCount}</div>
                <div className="text-[11px] text-muted-foreground">Warnings</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-3.5">
                <div className="text-2xl font-bold leading-none mb-1 text-purple-600">{suggestieCount}</div>
                <div className="text-[11px] text-muted-foreground">Suggesties</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-3.5">
                <div className="text-2xl font-bold leading-none mb-1 text-green-600">{okCount}</div>
                <div className="text-[11px] text-muted-foreground">Automations OK</div>
                <div className="text-[10px] text-muted-foreground/60 mt-1">van de {mind.automation_count} totaal</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-3.5">
                <div className="text-lg font-bold leading-none mb-1 text-muted-foreground">
                  {new Date(mind.aangemaakt_op).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                </div>
                <div className="text-[11px] text-muted-foreground">Laatste analyse</div>
                <div className="text-[10px] text-muted-foreground/60 mt-1">{mind.automation_count} automations bekeken</div>
              </div>
            </div>

            {/* Brandy narrative */}
            <div className="bg-gradient-to-br from-[#f5f3ff] to-[#ede9fe] border border-[#ddd6fe] rounded-xl p-4 flex gap-3">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white text-xs shrink-0 mt-0.5">
                ✦
              </div>
              <div>
                <p className="text-sm text-[#4c1d95] leading-relaxed">{mind.samenvatting}</p>
                <p className="text-[10px] text-[#9333ea] mt-2">Brandy's samenvatting · {analyseDate}</p>
              </div>
            </div>

            {/* Category grid */}
            <div className="grid grid-cols-2 gap-3.5">
              {CATEGORIES.map(({ key, label, icon, iconBg, countBg, countText }) => {
                const catSignalen = mind.signalen.filter((s) => s.categorie === key);
                return (
                  <div key={key} className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border/60">
                      <div className={`w-7 h-7 rounded-md ${iconBg} flex items-center justify-center text-sm shrink-0`}>
                        {icon}
                      </div>
                      <span className="text-sm font-semibold flex-1">{label}</span>
                      <span className={`text-[10px] font-semibold ${countBg} ${countText} rounded-full px-2 py-0.5`}>
                        {catSignalen.length} {catSignalen.length === 1 ? "signaal" : "signalen"}
                      </span>
                    </div>
                    {catSignalen.length === 0 ? (
                      <p className="px-3.5 py-3 text-[11px] text-muted-foreground italic">Geen signalen</p>
                    ) : (
                      catSignalen.map((sig) => (
                        <button
                          key={sig.id}
                          onClick={() => handleSignaalClick(sig)}
                          className="group w-full flex items-start gap-2.5 px-3.5 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-secondary/40 transition-colors text-left"
                        >
                          <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${ernstDot(sig.ernst)}`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-foreground truncate">{sig.naam}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{sig.bericht}</div>
                          </div>
                          <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 shrink-0 transition-opacity">
                            → Brandy
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                );
              })}
            </div>

            {/* Suggesties section */}
            {(mind.suggesties?.length ?? 0) > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border/60">
                  <div className="w-7 h-7 rounded-md bg-green-50 flex items-center justify-center text-sm shrink-0">
                    💡
                  </div>
                  <span className="text-sm font-semibold flex-1">Suggesties voor nieuwe automations</span>
                  <span className="text-[10px] font-semibold bg-green-50 text-green-700 rounded-full px-2 py-0.5">
                    {mind.suggesties!.length} {mind.suggesties!.length === 1 ? "idee" : "ideeën"}
                  </span>
                </div>
                <div className="grid grid-cols-2">
                  {mind.suggesties!.map((sug, i) => (
                    <div
                      key={i}
                      className={`p-4 hover:bg-secondary/30 transition-colors ${
                        i % 2 === 0 ? "border-r border-border/60" : ""
                      } ${
                        i < mind.suggesties!.length - 2 ? "border-b border-border/60" : ""
                      }`}
                    >
                      <div className="text-xs font-semibold text-foreground mb-1.5">{sug.titel}</div>
                      <div className="text-[11px] text-muted-foreground leading-relaxed mb-2.5">{sug.body}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {sug.tags.map((tag) => (
                          <span key={tag} className="text-[10px] bg-secondary rounded-full px-2 py-0.5 text-muted-foreground border border-border">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

    </div>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
```

Navigate to the Brandy page. Verify:
1. Header shows "Brandy / Procesbrein van Brand Boekhouders"
2. Pill tab bar shows "💬 Chat" and "✦ Inzichten" — active tab has white background + shadow
3. Analyseer button is right-aligned in the tab bar
4. Chat tab: existing chat UI works, messages appear, input works
5. If mind exists: Inzichten tab shows summary row + narrative + 4 category cards + suggesties section
6. If no mind yet: Inzichten tab shows "Brandy heeft nog geen analyse uitgevoerd"
7. Clicking "→ Brandy" on a signal row switches to Chat tab and submits the question

- [ ] **Step 6: Commit**

```bash
git add src/pages/Brandy.tsx
git commit -m "feat(brandy): add Inzichten dashboard with category grid, narrative, and suggestions"
```
