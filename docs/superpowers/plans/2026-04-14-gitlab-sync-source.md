# GitLab Sync as Automation Source — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual per-file GitLab sync with a Supabase Edge Function that auto-discovers all Python scripts under `app/`, extracts automation metadata via Gemini, and upserts records — making GitLab a full sync source like HubSpot.

**Architecture:** A new `gitlab-sync` edge function follows the exact hubspot-sync pattern: read the `integrations` table, scan GitLab Tree API, call Gemini per file for structured metadata extraction, upsert on `(source='gitlab', external_id=file_path)`, and deactivate removed files. The frontend hook is collapsed to a single `invokeEdgeFunction` call, dead client-side files are deleted, and the manual `gitlabFilePath` form field is removed.

**Tech Stack:** Deno (edge function), Supabase JS v2, GitLab REST API v4, Gemini API (gemini-2.5-flash via OpenAI-compatible endpoint), React 18 + TypeScript, Tanstack Query v5

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/functions/gitlab-sync/index.ts` | Full sync edge function |
| Modify | `src/lib/supabaseStorage.ts` | Add `triggerGitlabSync`, remove `updateGitlabData`, remove `gitlab_file_path` from `updateAutomatisering` |
| Modify | `src/lib/hooks.ts` | Simplify `useGitlabSync` to one line, remove dead imports |
| Modify | `src/pages/Instellingen.tsx` | Update sync toast in `GitLabCard` |
| Modify | `src/components/AutomatiseringForm.tsx` | Remove `gitlabFilePath` field |
| Delete | `src/lib/gitlabService.ts` | No longer needed — logic moved to edge function |
| Delete | `src/lib/codeReaderService.ts` | No longer needed — logic moved to edge function |

---

## Task 1: Edge Function `supabase/functions/gitlab-sync/index.ts`

**Files:**
- Create: `supabase/functions/gitlab-sync/index.ts`

- [ ] **Step 1: Create the edge function file with the full implementation**

Create `supabase/functions/gitlab-sync/index.ts` with this exact content:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Skip rules: these files are infrastructure, not automations ───────────────
const SKIP_NAMES = new Set([
  "__init__.py", "main.py", "auth.py", "constants.py",
  "exceptions.py", "logging_config.py", "hubspot_client.py",
]);
const SKIP_PATH_SEGMENTS = ["/repository/", "/schemas/"];

// ── Fasen mapping: immediate parent directory → KlantFase[] ──────────────────
const FASEN_MAP: Record<string, string[]> = {
  API:          ["Sales"],
  clockify:     ["Onboarding"],
  kvk:          ["Onboarding"],
  operations:   ["Boekhouding"],
  va_pipelines: ["Boekhouding"],
  properties:   ["Boekhouding"],
};

function shouldSkip(filePath: string): boolean {
  const name = filePath.split("/").pop() ?? "";
  if (SKIP_NAMES.has(name)) return true;
  return SKIP_PATH_SEGMENTS.some((seg) => filePath.includes(seg));
}

function getFasen(filePath: string): string[] {
  const parts = filePath.split("/");
  const parentDir = parts.length >= 2 ? parts[parts.length - 2] : "";
  return FASEN_MAP[parentDir] ?? [];
}

// ── GitLab Tree API: returns all .py file paths under app/ ───────────────────
async function fetchGitlabTree(
  projectId: string,
  branch: string,
  pat: string,
): Promise<string[]> {
  const filePaths: string[] = [];
  let page = 1;

  while (true) {
    const url =
      `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/repository/tree` +
      `?path=app&recursive=true&per_page=100&ref=${encodeURIComponent(branch)}&page=${page}`;

    const res = await fetch(url, { headers: { "PRIVATE-TOKEN": pat } });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitLab Tree API fout (${res.status}): ${body.slice(0, 200)}`);
    }

    const items: Array<{ type: string; path: string }> = await res.json();
    for (const item of items) {
      if (item.type === "blob" && item.path.endsWith(".py")) {
        filePaths.push(item.path);
      }
    }

    const nextPage = res.headers.get("X-Next-Page");
    if (!nextPage) break;
    page = Number(nextPage);
  }

  return filePaths;
}

// ── GitLab Files API: fetch raw file content (base64-decoded) ─────────────────
async function fetchFileContent(
  projectId: string,
  filePath: string,
  branch: string,
  pat: string,
): Promise<string> {
  const encoded = encodeURIComponent(filePath);
  const url =
    `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/repository/files/${encoded}` +
    `?ref=${encodeURIComponent(branch)}`;

  const res = await fetch(url, { headers: { "PRIVATE-TOKEN": pat } });

  if (!res.ok) {
    throw new Error(`GitLab Files API fout (${res.status}): ${filePath}`);
  }

  const data = await res.json();
  // GitLab returns content as base64 with embedded newlines
  return atob((data.content as string).replace(/\n/g, ""));
}

// ── Gemini: extract structured metadata from Python source ────────────────────
async function extractMetadata(
  filename: string,
  content: string,
  geminiKey: string,
): Promise<{
  naam: string;
  doel: string;
  trigger: string;
  stappen: string[];
  systemen: string[];
}> {
  const tools = [
    {
      type: "function",
      function: {
        name: "extract_automation_metadata",
        description: "Extract structured automation metadata from a Python script",
        parameters: {
          type: "object",
          properties: {
            naam: {
              type: "string",
              description: "Korte Nederlandse naam voor de automatisering (max 60 tekens)",
            },
            doel: {
              type: "string",
              description: "Één zin in het Nederlands — wat bereikt dit script?",
            },
            trigger: {
              type: "string",
              description:
                "Wat start deze automatisering? (bijv. 'API endpoint POST /pad', 'webhook', 'handmatig')",
            },
            stappen: {
              type: "array",
              items: { type: "string" },
              description:
                "Array van 3-6 stappen in het Nederlands die beschrijven hoe het script werkt",
            },
            systemen: {
              type: "array",
              items: { type: "string" },
              description:
                "Array van externe systemen die worden gebruikt (bijv. HubSpot, Clockify, KvK, WeFact)",
            },
          },
          required: ["naam", "doel", "trigger", "stappen", "systemen"],
          additionalProperties: false,
        },
      },
    },
  ];

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
              "Je bent een technische assistent die Python automatiseringsscripts analyseert voor een Nederlands boekhoudkantoor. Extraheer gestructureerde metadata. Antwoord altijd in het Nederlands.",
          },
          {
            role: "user",
            content:
              `Analyseer dit Python script en extraheer de automatiseringsmetadata.\n\nBestandsnaam: ${filename}\n\nInhoud:\n${content.slice(0, 6000)}`,
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "extract_automation_metadata" } },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini API fout (${res.status})`);
  }

  const result = await res.json();
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error("Gemini: geen tool call in antwoord");
  }

  return JSON.parse(toolCall.function.arguments);
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is niet geconfigureerd" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Read GitLab integration
    const { data: integration, error: intError } = await db
      .from("integrations")
      .select("*")
      .eq("type", "gitlab")
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({
          error:
            "Geen GitLab-integratie gevonden. Sla eerst een token op via Instellingen.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let pat: string, projectId: string, branch: string;
    try {
      ({ pat, projectId, branch } = JSON.parse(integration.token as string));
    } catch {
      return new Response(
        JSON.stringify({
          error: "GitLab configuratie ongeldig — sla de verbinding opnieuw op",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: Discover all Python automation files
    const allFiles = await fetchGitlabTree(projectId, branch, pat);
    const automationFiles = allFiles.filter((p) => !shouldSkip(p));

    if (automationFiles.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Geen Python-automatiseringsbestanden gevonden onder app/",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Load existing GitLab records for diffing
    const { data: existing } = await db
      .from("automatiseringen")
      .select("id, external_id, status")
      .eq("source", "gitlab");

    const existingMap: Record<string, { id: string; status: string }> = {};
    for (const row of existing ?? []) {
      if (row.external_id) existingMap[row.external_id] = row;
    }

    const syncedPaths = new Set<string>();
    let inserted = 0, updated = 0;
    const now = new Date().toISOString();

    // Step 3: Fetch content + extract metadata + upsert
    for (const filePath of automationFiles) {
      try {
        const content = await fetchFileContent(projectId, filePath, branch, pat);
        const filename = filePath.split("/").pop() ?? filePath;
        const metadata = await extractMetadata(filename, content, GEMINI_API_KEY);
        const fasen = getFasen(filePath);
        syncedPaths.add(filePath);

        if (existingMap[filePath]) {
          // Update existing record — preserve status and other user-edited fields
          await db
            .from("automatiseringen")
            .update({
              naam:                 metadata.naam,
              doel:                 metadata.doel,
              trigger_beschrijving: metadata.trigger,
              stappen:              metadata.stappen,
              systemen:             metadata.systemen,
              fasen,
              gitlab_file_path:     filePath,
              last_synced_at:       now,
            })
            .eq("id", existingMap[filePath].id);
          updated++;
        } else {
          // New record — auto-approved, no review queue
          const { data: newId } = await db.rpc("generate_auto_id");
          await db.from("automatiseringen").insert({
            id:                   newId || `AUTO-GL-${Date.now()}`,
            naam:                 metadata.naam,
            doel:                 metadata.doel,
            trigger_beschrijving: metadata.trigger,
            stappen:              metadata.stappen,
            systemen:             metadata.systemen,
            fasen,
            categorie:            "Backend Script",
            status:               "Actief",
            afhankelijkheden:     "",
            owner:                "",
            verbeterideeen:       "",
            mermaid_diagram:      "",
            external_id:          filePath,
            source:               "gitlab",
            import_status:        null,
            gitlab_file_path:     filePath,
            last_synced_at:       now,
          });
          inserted++;
        }
      } catch (e) {
        console.warn(
          `gitlab-sync: bestand mislukt — ${filePath}: ${(e as Error).message}`,
        );
      }
    }

    // Step 4: Deactivate files no longer in the repo
    let deactivated = 0;
    for (const [extPath, row] of Object.entries(existingMap)) {
      if (!syncedPaths.has(extPath) && row.status !== "Inactief") {
        await db
          .from("automatiseringen")
          .update({ status: "Inactief" })
          .eq("id", row.id);
        deactivated++;
      }
    }

    // Step 5: Update integration timestamp
    await db
      .from("integrations")
      .update({ last_synced_at: now, status: "connected", error_message: null })
      .eq("id", integration.id);

    return new Response(
      JSON.stringify({ success: true, inserted, updated, deactivated, total: automationFiles.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("gitlab-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

- [ ] **Step 2: Verify the file exists**

Run: `ls supabase/functions/gitlab-sync/index.ts`
Expected: file path printed

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/gitlab-sync/index.ts
git commit -m "feat(gitlab): add gitlab-sync edge function for automatic file discovery"
```

---

## Task 2: Storage Layer Cleanup

**Files:**
- Modify: `src/lib/supabaseStorage.ts`

Current state of `supabaseStorage.ts` relevant to this task:
- Line 2: imports `updateGitlabData` is not imported externally, it's exported
- Line 117-120: `updateAutomatisering` sets `gitlab_file_path: item.gitlabFilePath ?? null`
- Lines 251-265: `updateGitlabData` function (to be removed)
- Lines 247-249: `triggerTypeformSync` function (add `triggerGitlabSync` after this)

- [ ] **Step 1: Remove `gitlab_file_path` from `updateAutomatisering`**

In `src/lib/supabaseStorage.ts`, find the `updateAutomatisering` function. The `.update({...})` call currently includes:

```typescript
    gitlab_file_path: item.gitlabFilePath ?? null,
```

Remove that line. The update block should go from this:

```typescript
  const { error } = await supabase.from("automatiseringen").update({
    naam: item.naam,
    categorie: item.categorie,
    doel: item.doel,
    trigger_beschrijving: item.trigger,
    systemen: item.systemen,
    stappen: item.stappen,
    afhankelijkheden: item.afhankelijkheden,
    owner: item.owner,
    status: item.status,
    verbeterideeen: item.verbeterideeën,
    mermaid_diagram: item.mermaidDiagram,
    fasen: item.fasen,
    gitlab_file_path: item.gitlabFilePath ?? null,
  }).eq("id", item.id);
```

To this:

```typescript
  const { error } = await supabase.from("automatiseringen").update({
    naam: item.naam,
    categorie: item.categorie,
    doel: item.doel,
    trigger_beschrijving: item.trigger,
    systemen: item.systemen,
    stappen: item.stappen,
    afhankelijkheden: item.afhankelijkheden,
    owner: item.owner,
    status: item.status,
    verbeterideeen: item.verbeterideeën,
    mermaid_diagram: item.mermaidDiagram,
    fasen: item.fasen,
  }).eq("id", item.id);
```

- [ ] **Step 2: Add `triggerGitlabSync` after `triggerTypeformSync`**

After the existing `triggerTypeformSync` function (around line 247), add:

```typescript
export async function triggerGitlabSync(): Promise<{ inserted: number; updated: number; deactivated: number; total: number }> {
  return invokeEdgeFunction("gitlab-sync");
}
```

- [ ] **Step 3: Remove the `updateGitlabData` function**

Delete the entire `updateGitlabData` function. It currently reads:

```typescript
export async function updateGitlabData(
  id: string,
  data: { gitlabFilePath: string; gitlabLastCommit: string; aiDescription: string }
): Promise<void> {
  const { error } = await supabase
    .from("automatiseringen")
    .update({
      gitlab_file_path: data.gitlabFilePath,
      gitlab_last_commit: data.gitlabLastCommit,
      ai_description: data.aiDescription,
      ai_description_updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}
```

Delete this block entirely.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `supabaseStorage.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabaseStorage.ts
git commit -m "refactor(gitlab): add triggerGitlabSync, remove updateGitlabData and gitlab_file_path from form update"
```

---

## Task 3: Hooks Cleanup

**Files:**
- Modify: `src/lib/hooks.ts`

Current state of `hooks.ts`:
- Line 2: imports `updateGitlabData` from supabaseStorage — to be replaced with `triggerGitlabSync`
- Line 4: `import { fetchGitlabFileContent, fetchGitlabLastCommit } from "./gitlabService";` — to be deleted
- Line 5: `import { generateAiDescription } from "./codeReaderService";` — to be deleted
- Lines 122-176: the full `useGitlabSync` with client-side loop — to be collapsed

- [ ] **Step 1: Update the import from `supabaseStorage`**

Replace the current import line (line 2) from:

```typescript
import { fetchAutomatiseringen, insertAutomatisering, updateAutomatisering, deleteAutomatisering, generateNextId, verifieerAutomatisering, fetchIntegration, saveIntegration, deleteIntegration, triggerHubSpotSync, triggerZapierSync, triggerTypeformSync, updateGitlabData } from "./supabaseStorage";
```

To:

```typescript
import { fetchAutomatiseringen, insertAutomatisering, updateAutomatisering, deleteAutomatisering, generateNextId, verifieerAutomatisering, fetchIntegration, saveIntegration, deleteIntegration, triggerHubSpotSync, triggerZapierSync, triggerTypeformSync, triggerGitlabSync } from "./supabaseStorage";
```

- [ ] **Step 2: Remove the two dead import lines**

Delete these two lines entirely:

```typescript
import { fetchGitlabFileContent, fetchGitlabLastCommit } from "./gitlabService";
import { generateAiDescription } from "./codeReaderService";
```

- [ ] **Step 3: Replace `useGitlabSync` with the simplified version**

Replace the entire `useGitlabSync` function (from `export function useGitlabSync()` to its closing `}`) with:

```typescript
export function useGitlabSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerGitlabSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
      queryClient.invalidateQueries({ queryKey: ["integration", "gitlab"] });
    },
  });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `hooks.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/hooks.ts
git commit -m "refactor(gitlab): collapse useGitlabSync to edge function call, remove dead imports"
```

---

## Task 4: Frontend Cleanup

**Files:**
- Modify: `src/pages/Instellingen.tsx`
- Modify: `src/components/AutomatiseringForm.tsx`

- [ ] **Step 1: Update the sync toast in `GitLabCard` in `Instellingen.tsx`**

Find `handleSync` inside the `GitLabCard` function component. Currently:

```typescript
  async function handleSync() {
    try {
      const result = await gitlabSync.mutateAsync();
      toast.success(`Sync voltooid — ${result.updated} bijgewerkt van de ${result.total}`);
    } catch (e: any) {
      toast.error((e as Error).message || "Sync mislukt");
    }
  }
```

Replace with:

```typescript
  async function handleSync() {
    try {
      const result = await gitlabSync.mutateAsync();
      toast.success(`Sync voltooid — ${result.inserted} nieuw, ${result.updated} bijgewerkt, ${result.deactivated} gedeactiveerd`);
    } catch (e: any) {
      toast.error((e as Error).message || "Sync mislukt");
    }
  }
```

- [ ] **Step 2: Remove `gitlabFilePath` from `AutomatiseringForm.tsx` initial state**

In `src/components/AutomatiseringForm.tsx`, find the `useState<Partial<Automatisering>>` initialization. Remove the `gitlabFilePath: ""` line. Before:

```typescript
  const [form, setForm] = useState<Partial<Automatisering>>({
    naam: "",
    categorie: "HubSpot Workflow",
    doel: "",
    trigger: "",
    systemen: [],
    stappen: [""],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    gitlabFilePath: "",
    ...prefill,
  });
```

After:

```typescript
  const [form, setForm] = useState<Partial<Automatisering>>({
    naam: "",
    categorie: "HubSpot Workflow",
    doel: "",
    trigger: "",
    systemen: [],
    stappen: [""],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    ...prefill,
  });
```

- [ ] **Step 3: Remove `gitlabFilePath` from the submit item in `AutomatiseringForm.tsx`**

Find the `item: Automatisering` object built in the `submit` function. Remove the line:

```typescript
      gitlabFilePath: form.gitlabFilePath?.trim() || undefined,
```

The `item` object currently ends with:

```typescript
      createdAt: prefill?.createdAt || new Date().toISOString(),
      laatstGeverifieerd: prefill?.laatstGeverifieerd || null,
      geverifieerdDoor: prefill?.geverifieerdDoor || "",
      gitlabFilePath: form.gitlabFilePath?.trim() || undefined,
    };
```

After removing:

```typescript
      createdAt: prefill?.createdAt || new Date().toISOString(),
      laatstGeverifieerd: prefill?.laatstGeverifieerd || null,
      geverifieerdDoor: prefill?.geverifieerdDoor || "",
    };
```

- [ ] **Step 4: Remove the "GitLab bestandspad" field from the form JSX**

Find and delete the entire `<Field label="GitLab bestandspad">` block in the JSX return. It currently reads:

```tsx
      <Field label="GitLab bestandspad">
        <Input
          value={form.gitlabFilePath || ""}
          onChange={(e) => set("gitlabFilePath", e.target.value)}
          placeholder="scripts/automation-naam.js"
          className="font-mono text-xs"
        />
        <p className="text-[10px] text-muted-foreground mt-1">Pad naar het bronbestand in GitLab. Wordt gebruikt voor AI-beschrijvingen.</p>
      </Field>
```

Delete this block entirely.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/pages/Instellingen.tsx src/components/AutomatiseringForm.tsx
git commit -m "refactor(gitlab): update sync toast format, remove manual gitlabFilePath form field"
```

---

## Task 5: Delete Dead Files

**Files:**
- Delete: `src/lib/gitlabService.ts`
- Delete: `src/lib/codeReaderService.ts`

- [ ] **Step 1: Delete `gitlabService.ts`**

```bash
rm src/lib/gitlabService.ts
```

- [ ] **Step 2: Delete `codeReaderService.ts`**

```bash
rm src/lib/codeReaderService.ts
```

- [ ] **Step 3: Verify no broken imports**

Run: `npx tsc --noEmit`
Expected: no errors. If you see "Cannot find module './gitlabService'" or "'./codeReaderService'", check that `hooks.ts` Task 3 Step 2 was applied correctly.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(gitlab): delete dead gitlabService.ts and codeReaderService.ts"
```

---

## Manual Acceptance Test

After all tasks are complete, test end-to-end:

1. Open the app → go to Instellingen
2. If GitLab is already connected, disconnect and reconnect with valid PAT + project ID + branch
3. Press "Nu synchroniseren"
4. Expected toast: `Sync voltooid — X nieuw, 0 bijgewerkt, 0 gedeactiveerd` (on first sync)
5. Go to Alle Automatiseringen — verify new records appear with the GitLab source badge
6. Open one automation — verify `naam`, `doel`, `stappen`, `systemen` are populated
7. Sync again — expected: `0 nieuw, X bijgewerkt, 0 gedeactiveerd`
8. Check Instellingen → GitLab card shows "Laatste sync: [timestamp]"
9. Open the edit form on a GitLab automation — verify no "GitLab bestandspad" field is visible
