# GitLab Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each automation can have a `gitlab_file_path` (set manually per record). A sync feature reads that file from GitLab, generates an AI description via Claude Haiku, and writes both the description and the last commit timestamp back to the automation record.

**Architecture:** Client-side hook `useGitlabSync` in `src/lib/hooks.ts` orchestrates the loop: fetch integration config → iterate automations with `gitlabFilePath` set → call GitLab REST API v4 for file content and last commit → call Anthropic Messages API for AI description → upsert results to Supabase. GitLab PAT + project ID + branch are stored as a JSON blob in the existing `integrations` table (type = `"gitlab"`). Four new nullable columns on `automatiseringen` hold the sync output. A `GitLabCard` component in `Instellingen.tsx` handles connect/disconnect/sync with inline progress display.

**Tech Stack:** React 18 + TypeScript, Tanstack Query v5, Supabase (postgres), Vite dev proxy (GitLab API), GitLab REST API v4, Anthropic Messages API (claude-haiku-4-5), date-fns

---

### Task 1: Infrastructure — migration, Vite proxy, Tailwind color, CSS badge

**Files:**
- Create: `supabase/migrations/20260414130000_gitlab_fields.sql`
- Modify: `vite.config.ts`
- Modify: `tailwind.config.ts`
- Modify: `src/index.css`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260414130000_gitlab_fields.sql` with the content:

```sql
alter table automatiseringen
  add column if not exists gitlab_file_path text,
  add column if not exists gitlab_last_commit text,
  add column if not exists ai_description text,
  add column if not exists ai_description_updated_at timestamptz;
```

- [ ] **Step 2: Apply migration via db push**

Run:
```bash
npx supabase db push --linked
```
Expected: migration applied with no errors.

If `db push` fails (e.g. project not linked), apply directly:
```bash
npx supabase db query --linked "
alter table automatiseringen
  add column if not exists gitlab_file_path text,
  add column if not exists gitlab_last_commit text,
  add column if not exists ai_description text,
  add column if not exists ai_description_updated_at timestamptz;"
```

- [ ] **Step 3: Add Vite proxy for GitLab in vite.config.ts**

In `vite.config.ts`, inside the existing `proxy` object after the `"/typeform-api"` entry (line 28), add:

```typescript
      "/gitlab-api": {
        target: "https://gitlab.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gitlab-api/, ""),
      },
```

Result: `vite.config.ts` proxy block becomes:
```typescript
    proxy: {
      "/hubspot-api": { ... },
      "/zapier-api": { ... },
      "/typeform-api": { ... },
      "/gitlab-api": {
        target: "https://gitlab.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gitlab-api/, ""),
      },
    },
```

- [ ] **Step 4: Add --gitlab CSS variable in src/index.css**

In `src/index.css`, after `--api: 215 25% 46%;` (line ~38), add:

```css
    --gitlab: 23 100% 49%;
```

- [ ] **Step 5: Add .badge-gitlab CSS class in src/index.css**

After the `.badge-api { ... }` block (around line 119), add:

```css
  .badge-gitlab {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--gitlab) / 0.1);
    color: hsl(var(--gitlab));
  }
```

- [ ] **Step 6: Add gitlab color token in tailwind.config.ts**

In `tailwind.config.ts`, after `hubspot: "hsl(var(--hubspot))",` (line ~63), add:

```typescript
        gitlab: "hsl(var(--gitlab))",
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260414130000_gitlab_fields.sql vite.config.ts tailwind.config.ts src/index.css
git commit -m "feat(gitlab): add infrastructure — migration, proxy, tailwind color, badge"
```

---

### Task 2: GitLab API service

**Files:**
- Create: `src/lib/gitlabService.ts`

- [ ] **Step 1: Create src/lib/gitlabService.ts**

```typescript
// In dev, requests are proxied through Vite to avoid CORS issues.
// In production, GitLab allows cross-origin requests from browsers.
const GITLAB_BASE = import.meta.env.DEV ? "/gitlab-api" : "https://gitlab.com";

/**
 * Fetches the decoded text content of a file from GitLab.
 * Throws if the file is not found or the token is invalid.
 */
export async function fetchGitlabFileContent(
  projectId: string,
  filePath: string,
  branch: string,
  token: string
): Promise<string> {
  const encoded = encodeURIComponent(filePath);
  const res = await fetch(
    `${GITLAB_BASE}/api/v4/projects/${projectId}/repository/files/${encoded}?ref=${encodeURIComponent(branch)}`,
    { headers: { "PRIVATE-TOKEN": token } }
  );
  if (!res.ok) {
    throw new Error(`GitLab bestand ophalen mislukt (${res.status}): ${filePath}`);
  }
  const data = await res.json();
  // GitLab returns content as base64 with embedded newlines
  return atob((data.content as string).replace(/\n/g, ""));
}

/**
 * Returns the ISO timestamp of the most recent commit that touched this file.
 * Returns "onbekend" if no commit is found or the request fails.
 */
export async function fetchGitlabLastCommit(
  projectId: string,
  filePath: string,
  branch: string,
  token: string
): Promise<string> {
  const res = await fetch(
    `${GITLAB_BASE}/api/v4/projects/${projectId}/repository/commits?path=${encodeURIComponent(filePath)}&ref_name=${encodeURIComponent(branch)}&per_page=1`,
    { headers: { "PRIVATE-TOKEN": token } }
  );
  if (!res.ok) return "onbekend";
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return "onbekend";
  return (data[0] as { created_at: string }).created_at;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/gitlabService.ts
git commit -m "feat(gitlab): add gitlabService — fetch file content and last commit"
```

---

### Task 3: AI description service

**Files:**
- Create: `src/lib/codeReaderService.ts`

- [ ] **Step 1: Create src/lib/codeReaderService.ts**

```typescript
/**
 * Sends file content to the Anthropic Messages API and returns a 1-2 sentence
 * Dutch description of what the automation does.
 *
 * Requires VITE_ANTHROPIC_API_KEY to be set.
 * The `anthropic-dangerous-request-cors-allow-all` header enables browser-side calls.
 */
export async function generateAiDescription(fileContent: string): Promise<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("VITE_ANTHROPIC_API_KEY is niet ingesteld");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-request-cors-allow-all": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Beschrijf in maximaal 2 zinnen wat de volgende automation doet. Antwoord uitsluitend in het Nederlands. Wees concreet en technisch.\n\n${fileContent.slice(0, 4000)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API fout (${res.status}): ${body}`);
  }

  const data = await res.json();
  return (data.content[0] as { text: string }).text;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/codeReaderService.ts
git commit -m "feat(gitlab): add codeReaderService — AI description via Anthropic Haiku"
```

---

### Task 4: Types + storage updates

**Files:**
- Modify: `src/lib/types.ts` — add 4 fields to `Automatisering`
- Modify: `src/lib/supabaseStorage.ts` — map new fields + add `upsertGitlabData`

- [ ] **Step 1: Add 4 fields to Automatisering interface in src/lib/types.ts**

After `beschrijvingInSimpeleTaal?: string[];` (line 58), add:

```typescript
  gitlabFilePath?: string;
  gitlabLastCommit?: string;
  aiDescription?: string;
  aiDescriptionUpdatedAt?: string | null;
```

- [ ] **Step 2: Map new fields in fetchAutomatiseringen in src/lib/supabaseStorage.ts**

In `fetchAutomatiseringen`, the `return (rows || []).map((r) => ({` block ends with:
```typescript
    beschrijvingInSimpeleTaal: (r.import_proposal as any)?.beschrijving_in_simpele_taal ?? undefined,
  }));
```

Add after that `beschrijvingInSimpeleTaal` line (before `}));`):
```typescript
    gitlabFilePath: r.gitlab_file_path ?? undefined,
    gitlabLastCommit: r.gitlab_last_commit ?? undefined,
    aiDescription: r.ai_description ?? undefined,
    aiDescriptionUpdatedAt: r.ai_description_updated_at ?? undefined,
```

- [ ] **Step 3: Add upsertGitlabData function to src/lib/supabaseStorage.ts**

After `triggerTypeformSync` (around line 244) and before the process state section, add:

```typescript
export async function upsertGitlabData(
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

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/supabaseStorage.ts
git commit -m "feat(gitlab): add Automatisering gitlab fields and upsertGitlabData"
```

---

### Task 5: useGitlabSync hook

**Files:**
- Modify: `src/lib/hooks.ts`

- [ ] **Step 1: Add React useState import to src/lib/hooks.ts**

The file currently starts with:
```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAutomatiseringen, insertAutomatisering, ...
```

Add `import { useState } from "react";` as the first line:
```typescript
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAutomatiseringen, insertAutomatisering, updateAutomatisering, deleteAutomatisering, generateNextId, verifieerAutomatisering, fetchIntegration, saveIntegration, deleteIntegration, triggerHubSpotSync, triggerZapierSync, triggerTypeformSync, upsertGitlabData } from "./supabaseStorage";
import { Automatisering } from "./types";
import { fetchGitlabFileContent, fetchGitlabLastCommit } from "./gitlabService";
import { generateAiDescription } from "./codeReaderService";
```

Note: `upsertGitlabData` is added to the existing `supabaseStorage` import. The two new imports for `gitlabService` and `codeReaderService` are appended after the existing imports.

- [ ] **Step 2: Add GitlabSyncProgress type and useGitlabSync hook to src/lib/hooks.ts**

Append after `useTypeformSync` (end of file):

```typescript
export interface GitlabSyncProgress {
  current: number;
  total: number;
  currentName: string;
}

export function useGitlabSync() {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<GitlabSyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function syncGitlab(): Promise<{ synced: number; total: number }> {
    setIsSyncing(true);
    setProgress(null);
    setError(null);
    try {
      const integration = await fetchIntegration("gitlab");
      if (!integration) throw new Error("GitLab niet verbonden");

      const { pat, projectId, branch } = JSON.parse(integration.token) as {
        pat: string;
        projectId: string;
        branch: string;
      };

      const automations = await fetchAutomatiseringen();
      const withGitlab = automations.filter((a) => a.gitlabFilePath);

      setProgress({ current: 0, total: withGitlab.length, currentName: "" });

      for (let i = 0; i < withGitlab.length; i++) {
        const a = withGitlab[i];
        setProgress({ current: i + 1, total: withGitlab.length, currentName: a.naam });

        const fileContent = await fetchGitlabFileContent(projectId, a.gitlabFilePath!, branch, pat);
        const lastCommit = await fetchGitlabLastCommit(projectId, a.gitlabFilePath!, branch, pat);
        const aiDescription = await generateAiDescription(fileContent);

        await upsertGitlabData(a.id, {
          gitlabFilePath: a.gitlabFilePath!,
          gitlabLastCommit: lastCommit,
          aiDescription,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
      return { synced: withGitlab.length, total: withGitlab.length };
    } catch (e: any) {
      const msg = (e as Error).message || "GitLab sync mislukt";
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsSyncing(false);
      setProgress(null);
    }
  }

  return { syncGitlab, isSyncing, progress, error };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks.ts
git commit -m "feat(gitlab): add useGitlabSync hook with per-automation progress state"
```

---

### Task 6: GitLab card in Instellingen

**Files:**
- Modify: `src/pages/Instellingen.tsx`

- [ ] **Step 1: Add useGitlabSync to the import line**

Change line 2 from:
```typescript
import { useIntegration, useSaveIntegration, useDeleteIntegration, useHubSpotSync, useZapierSync, useTypeformSync } from "@/lib/hooks";
```
To:
```typescript
import { useIntegration, useSaveIntegration, useDeleteIntegration, useHubSpotSync, useZapierSync, useTypeformSync, useGitlabSync } from "@/lib/hooks";
```

- [ ] **Step 2: Add GitLabCard component to src/pages/Instellingen.tsx**

Insert the following component after the closing `}` of `IntegrationCard` (line 133) and before `export default function Instellingen()`:

```typescript
function GitLabCard() {
  const { data: integration, isLoading } = useIntegration("gitlab");
  const saveIntegration = useSaveIntegration();
  const deleteIntegration = useDeleteIntegration();
  const { syncGitlab, isSyncing, progress, error } = useGitlabSync();

  const [pat, setPat] = useState("");
  const [projectId, setProjectId] = useState("");
  const [branch, setBranch] = useState("main");
  const [showPat, setShowPat] = useState(false);
  const isConnected = !!integration;

  async function handleConnect() {
    if (!pat.trim() || !projectId.trim()) {
      toast.error("Voer een PAT en project ID in");
      return;
    }
    try {
      await saveIntegration.mutateAsync({
        type: "gitlab",
        token: JSON.stringify({ pat: pat.trim(), projectId: projectId.trim(), branch: branch.trim() || "main" }),
      });
      setPat("");
      setProjectId("");
      setBranch("main");
      toast.success("GitLab verbonden");
    } catch (e: any) {
      toast.error((e as Error).message || "Verbinding mislukt");
    }
  }

  async function handleSync() {
    try {
      const result = await syncGitlab();
      toast.success(`GitLab sync voltooid — ${result.synced} automations bijgewerkt`);
    } catch (e: any) {
      toast.error((e as Error).message || "Sync mislukt");
    }
  }

  async function handleDisconnect() {
    try {
      await deleteIntegration.mutateAsync("gitlab");
      toast.success("GitLab ontkoppeld");
    } catch (e: any) {
      toast.error((e as Error).message || "Ontkoppelen mislukt");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 bg-orange-50 border border-orange-100 text-orange-600">
            <span className="font-bold text-sm">GL</span>
          </div>
          <div>
            <h2 className="font-medium text-sm">GitLab</h2>
            <p className="text-xs text-muted-foreground">Lees automation-bestanden en genereer AI-beschrijvingen</p>
          </div>
        </div>
        {!isLoading && (
          <div className="flex items-center gap-1.5 shrink-0">
            {isConnected ? (
              <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /><span className="text-xs text-green-600 font-medium">Verbonden</span></>
            ) : (
              <span className="text-xs text-muted-foreground">Niet verbonden</span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {!isLoading && !isConnected && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Personal Access Token</label>
            <div className="relative">
              <input
                type={showPat ? "text" : "password"}
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm pr-16 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button type="button" onClick={() => setShowPat(!showPat)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground">
                {showPat ? "Verberg" : "Toon"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Maak een token aan in GitLab → Profile → Access Tokens met <code className="bg-muted px-1 rounded">read_repository</code> scope.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Project ID</label>
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="12345678"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Te vinden in GitLab → project homepage → Project ID.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Branch</label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={handleConnect}
            disabled={saveIntegration.isPending || !pat.trim() || !projectId.trim()}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Link2 className="h-3.5 w-3.5" />
            {saveIntegration.isPending ? "Verbinden..." : "Verbinden"}
          </button>
        </div>
      )}

      {!isLoading && isConnected && (
        <div className="space-y-3">
          {progress && (
            <p className="text-xs text-muted-foreground">
              Bezig: {progress.currentName} ({progress.current}/{progress.total})
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Bezig met synchroniseren..." : "AI-beschrijvingen vernieuwen"}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={deleteIntegration.isPending}
              className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-50 transition-colors"
            >
              <Link2Off className="h-3.5 w-3.5" />
              Ontkoppelen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add GitLabCard to the Instellingen page**

In `export default function Instellingen()`, after the closing `</IntegrationCard>` for Typeform (the last integration card), add `<GitLabCard />`:

```typescript
      <IntegrationCard
        type="typeform"
        label="Typeform"
        description="Importeer formulieren automatisch via de Typeform API"
        badge="TF"
        badgeClass="bg-blue-50 border border-blue-100 text-blue-600"
        tokenLabel="Personal Access Token"
        tokenPlaceholder="tfp_xxxxxxxxxxxxxxxxxxxxxxxx"
        tokenHint='Ga naar <strong>typeform.com</strong> → Account → Developer apps → Personal tokens.'
        syncMutation={typeformSync}
      />

      <GitLabCard />
    </div>
  );
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Instellingen.tsx
git commit -m "feat(gitlab): add GitLab integration card with PAT/project/branch form and sync"
```

---

### Task 7: GitLab badge + AI description on automation cards

**Files:**
- Modify: `src/components/Badges.tsx`
- Modify: `src/pages/AlleAutomatiseringen.tsx`

- [ ] **Step 1: Add GitLab to SystemBadge map in Badges.tsx**

In `SystemBadge`, add to the `map` object after `API: "badge-api",`:

```typescript
    GitLab: "badge-gitlab",
```

- [ ] **Step 2: Add date-fns imports to AlleAutomatiseringen.tsx**

In `src/pages/AlleAutomatiseringen.tsx`, add after the existing import block (after line 13):

```typescript
import { format } from "date-fns";
import { nl } from "date-fns/locale";
```

- [ ] **Step 3: Add GitLab badge to card header row in AlleAutomatiseringen.tsx**

In the card header button, after `<StatusBadge status={a.status} />` (line ~135), add:

```typescript
                  {a.gitlabFilePath && (
                    <span className="badge-gitlab">GL</span>
                  )}
```

- [ ] **Step 4: Add AI description block to expanded card view in AlleAutomatiseringen.tsx**

After the existing `beschrijvingInSimpeleTaal / doel` block (the block ending around line 214 with `} : null}`), add:

```typescript
                    {a.aiDescription && (
                      <div className="bg-orange-50/50 border border-orange-100 rounded-md px-4 py-3">
                        <p className="label-uppercase mb-1">GitLab AI-beschrijving</p>
                        <p className="text-sm text-foreground leading-relaxed">{a.aiDescription}</p>
                        {a.gitlabLastCommit && a.gitlabLastCommit !== "onbekend" && (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            Laatste commit: {format(new Date(a.gitlabLastCommit), "d MMM yyyy, HH:mm", { locale: nl })}
                          </p>
                        )}
                      </div>
                    )}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/Badges.tsx src/pages/AlleAutomatiseringen.tsx
git commit -m "feat(gitlab): show GitLab badge and AI description on automation cards"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Step 1 (migration): Task 1 steps 1–2
- ✅ Step 2 (Vite proxy): Task 1 step 3
- ✅ Step 3 (Tailwind color + CSS): Task 1 steps 4–6
- ✅ Step 4 (gitlabService): Task 2
- ✅ Step 5 (codeReaderService): Task 3
- ✅ Step 6 (useGitlabSync hook): Task 5
- ✅ Step 7 (GitLab token form in Instellingen): Task 6 steps 1–3
- ✅ Step 8 (sync button with progress): Task 6 steps 2–3 (progress display inside GitLabCard)
- ✅ Step 9 (GitLab badge + ai_description + last commit on cards): Task 7

**Placeholder scan:** No TBDs or incomplete sections found.

**Type consistency:**
- `GitlabSyncProgress` defined in Task 5, used only in Task 5 ✓
- `upsertGitlabData(id, { gitlabFilePath, gitlabLastCommit, aiDescription })` defined in Task 4 step 3, called in Task 5 step 2 with matching shape ✓
- `a.gitlabFilePath`, `a.gitlabLastCommit`, `a.aiDescription` added to `Automatisering` in Task 4 step 1, read in Task 7 ✓
- `fetchGitlabFileContent`, `fetchGitlabLastCommit` defined in Task 2 step 1, imported in Task 5 step 1 ✓
- `generateAiDescription` defined in Task 3 step 1, imported in Task 5 step 1 ✓
- `useGitlabSync` exported in Task 5 step 2, imported in Task 6 step 1 ✓

**Architectural note:** The `GitLabCard` component in `Instellingen.tsx` is intentionally separate from `IntegrationCard` because its sync mutation has a different return type (`{ synced, total }` vs `{ inserted, updated, deactivated, total }`) and requires inline progress display that `IntegrationCard` does not support.
