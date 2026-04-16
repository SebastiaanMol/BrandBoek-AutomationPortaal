# HubSpot–GitLab Endpoint Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically link HubSpot automations to the GitLab backend scripts they call, by matching webhook URL paths to FastAPI endpoint paths, and show those links bidirectionally in the automation detail panel.

**Architecture:** GitLab sync extracts FastAPI endpoint paths via regex and stores them in a new `endpoints TEXT[]` column. HubSpot sync extracts webhook URL paths from `raw_payload` WEBHOOK actions and stores them in `webhook_paths TEXT[]`. After each HubSpot sync, a matching pass joins the two sets and writes results into a new `automation_links` join table with a `confirmed` flag. The frontend fetches links per automation and renders them in the detail panel.

**Tech Stack:** TypeScript, Supabase Edge Functions (Deno), PostgreSQL, React, TanStack Query v5, Supabase JS client

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `supabase/migrations/20260416120000_automation_links.sql` | New `automation_links` table + `endpoints`/`webhook_paths` columns on `automatiseringen` |
| Modify | `supabase/functions/gitlab-sync/index.ts` | Add `extractEndpoints()` helper; store `endpoints` in update + insert |
| Modify | `supabase/functions/hubspot-sync/index.ts` | Add `extractWebhookPaths()` helper; store `webhook_paths` in update + insert; add matching pass at end of sync |
| Modify | `src/lib/supabaseStorage.ts` | Add `fetchAutomationLinks()` and `confirmAutomationLink()` |
| Modify | `src/lib/hooks.ts` | Add `useAutomationLinks()` and `useConfirmLink()` |
| Modify | `src/pages/AlleAutomatiseringen.tsx` | Extract `AutomatiseringDetailPanel` component; add "Backend Script" and "HubSpot Workflows" sections |

---

## Task 1: DB migration

**Files:**
- Create: `supabase/migrations/20260416120000_automation_links.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260416120000_automation_links.sql

-- New columns on automatiseringen
ALTER TABLE automatiseringen
  ADD COLUMN IF NOT EXISTS endpoints     TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS webhook_paths TEXT[] NOT NULL DEFAULT '{}';

-- Join table for matched links
CREATE TABLE IF NOT EXISTS automation_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   text        NOT NULL REFERENCES automatiseringen(id) ON DELETE CASCADE,
  target_id   text        NOT NULL REFERENCES automatiseringen(id) ON DELETE CASCADE,
  match_type  text        NOT NULL CHECK (match_type IN ('exact', 'manual')),
  confirmed   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, target_id)
);

-- RLS: same policy as automatiseringen (authenticated users only)
ALTER TABLE automation_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read automation_links"
  ON automation_links FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authenticated users can insert automation_links"
  ON automation_links FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated users can update automation_links"
  ON automation_links FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "authenticated users can delete automation_links"
  ON automation_links FOR DELETE
  TO authenticated USING (true);

-- Service role also needs full access (used by edge functions)
CREATE POLICY "service role can manage automation_links"
  ON automation_links FOR ALL
  TO service_role USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Push the migration to the hosted project**

```bash
npx supabase db push --linked
```

Expected: `Applying migration 20260416120000_automation_links.sql...` with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260416120000_automation_links.sql
git commit -m "feat: add automation_links table and endpoints/webhook_paths columns"
```

---

## Task 2: GitLab sync — extract and store endpoints

**Files:**
- Modify: `supabase/functions/gitlab-sync/index.ts`

Context: this file has helper functions at the top (lines 9–81) followed by the Gemini `extractMetadata` function (lines 107–200) and the main serve handler. The file-processing loop starts around line 282. The `getFasen()` function ends around line 36.

- [ ] **Step 1: Add `extractEndpoints()` after `getFasen()` (around line 36)**

Find this exact line:
```typescript
function getFasen(filePath: string): string[] {
  const parts = filePath.split("/");
  const parentDir = parts.length >= 2 ? parts[parts.length - 2] : "";
  return FASEN_MAP[parentDir] ?? [];
}
```

Add immediately after it:
```typescript
// ── Endpoint extraction: regex on FastAPI APIRouter patterns ─────────────────
function extractEndpoints(content: string): string[] {
  const prefixMatch = content.match(/APIRouter\s*\(\s*prefix\s*=\s*["']([^"']+)["']/);
  const prefix = prefixMatch?.[1] ?? "";
  const routeRe = /@router\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/g;
  const endpoints: string[] = [];
  let m;
  while ((m = routeRe.exec(content)) !== null) {
    endpoints.push(`${prefix}${m[2]}`);
  }
  return endpoints;
}
```

- [ ] **Step 2: Call `extractEndpoints()` in the file-processing loop and add `endpoints` to the update**

Find this block inside the `batch.map(async (filePath) => {` loop:
```typescript
            const content = await fetchFileContent(projectId, filePath, branch, pat);
            const filename = filePath.split("/").pop() ?? filePath;
            const metadata = await extractMetadata(filename, content, GEMINI_API_KEY);
            const systemen = [...new Set(["GitLab", ...(metadata.systemen ?? [])])];
            const fasen = getFasen(filePath);

            if (existingMap[filePath]) {
              const { error: updateError } = await db
                .from("automatiseringen")
                .update({
                  naam:                 metadata.naam,
                  doel:                 metadata.doel,
                  trigger_beschrijving: metadata.trigger,
                  stappen:              metadata.stappen,
                  systemen:             systemen,
                  fasen,
                  gitlab_file_path:     filePath,
                  last_synced_at:       now,
                })
```

Replace with:
```typescript
            const content = await fetchFileContent(projectId, filePath, branch, pat);
            const filename = filePath.split("/").pop() ?? filePath;
            const metadata = await extractMetadata(filename, content, GEMINI_API_KEY);
            const systemen = [...new Set(["GitLab", ...(metadata.systemen ?? [])])];
            const fasen = getFasen(filePath);
            const endpoints = extractEndpoints(content);

            if (existingMap[filePath]) {
              const { error: updateError } = await db
                .from("automatiseringen")
                .update({
                  naam:                 metadata.naam,
                  doel:                 metadata.doel,
                  trigger_beschrijving: metadata.trigger,
                  stappen:              metadata.stappen,
                  systemen:             systemen,
                  fasen,
                  endpoints,
                  gitlab_file_path:     filePath,
                  last_synced_at:       now,
                })
```

- [ ] **Step 3: Add `endpoints` to the insert block**

Find the insert block (immediately after the update block, inside the `else` branch):
```typescript
              const { data: newId } = await db.rpc("generate_auto_id");
              const { error: insertError } = await db.from("automatiseringen").insert({
                id:                   newId || `AUTO-GL-${Date.now()}`,
                naam:                 metadata.naam,
                doel:                 metadata.doel,
                trigger_beschrijving: metadata.trigger,
                stappen:              metadata.stappen,
                systemen:             systemen,
                fasen,
                categorie:            "Backend Script",
                status:               "Actief",
                afhankelijkheden:     "",
                owner:                "",
                verbeterideeen:       "",
                mermaid_diagram:      "",
                external_id:          filePath,
                source:               "gitlab",
                import_status:        "approved",
                gitlab_file_path:     filePath,
                last_synced_at:       now,
              });
```

Replace with:
```typescript
              const { data: newId } = await db.rpc("generate_auto_id");
              const { error: insertError } = await db.from("automatiseringen").insert({
                id:                   newId || `AUTO-GL-${Date.now()}`,
                naam:                 metadata.naam,
                doel:                 metadata.doel,
                trigger_beschrijving: metadata.trigger,
                stappen:              metadata.stappen,
                systemen:             systemen,
                fasen,
                endpoints,
                categorie:            "Backend Script",
                status:               "Actief",
                afhankelijkheden:     "",
                owner:                "",
                verbeterideeen:       "",
                mermaid_diagram:      "",
                external_id:          filePath,
                source:               "gitlab",
                import_status:        "approved",
                gitlab_file_path:     filePath,
                last_synced_at:       now,
              });
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/gitlab-sync/index.ts
git commit -m "feat: extract FastAPI endpoints via regex in gitlab-sync"
```

---

## Task 3: HubSpot sync — webhook paths + matching pass

**Files:**
- Modify: `supabase/functions/hubspot-sync/index.ts`

Context: `mapWorkflow()` is around line 397. The update upsert is around line 566, insert around line 584. The deactivate loop ends around line 618, followed by the integration status update.

- [ ] **Step 1: Add `extractWebhookPaths()` immediately before `mapWorkflow()`**

Find this line:
```typescript
function mapWorkflow(wf: any) {
```

Add immediately before it:
```typescript
function extractWebhookPaths(actions: any[]): string[] {
  return actions
    .filter((a) => (a.type ?? a.actionType) === "WEBHOOK")
    .flatMap((a) => {
      const raw: string = a.url ?? a.webhookUrl ?? "";
      try { return [new URL(raw).pathname]; } catch { return []; }
    });
}

```

- [ ] **Step 2: Add `webhookPaths` to `mapWorkflow()` return value**

Inside `mapWorkflow()`, find the `const actions = flattenActions(wf.actions ?? []);` line and the `return {` block. The `return` block currently ends like this:

```typescript
  return {
    naam,
    status:                       wf.enabled ? "Actief" : "Uitgeschakeld",
    beschrijving,
    doel:                         naam ? `Automatisch gegenereerd op basis van naam: '${naam}'` : "",
    trigger,
    systemen,
    stappen,
    branches,
    categorie,
    fasen:                        inferredFasen,
    enrollment,
    beschrijving_in_simpele_taal: beschrijvingInSimpeleTaal,
    confidence,
  };
```

Replace with:
```typescript
  return {
    naam,
    status:                       wf.enabled ? "Actief" : "Uitgeschakeld",
    beschrijving,
    doel:                         naam ? `Automatisch gegenereerd op basis van naam: '${naam}'` : "",
    trigger,
    systemen,
    stappen,
    branches,
    categorie,
    fasen:                        inferredFasen,
    enrollment,
    beschrijving_in_simpele_taal: beschrijvingInSimpeleTaal,
    confidence,
    webhookPaths:                 extractWebhookPaths(actions),
  };
```

- [ ] **Step 3: Add `webhook_paths` to the update upsert**

Find the update block (inside the `if (existingMap[externalId])` branch):
```typescript
        await db.from("automatiseringen").update({
          naam:                 wf.name,
          status:               wf.enabled ? "Actief" : "Uitgeschakeld",
          trigger_beschrijving: mapped.trigger,
          systemen:             mapped.systemen,
          stappen:              mapped.stappen,
          branches:             mapped.branches,
          categorie:            mapped.categorie,
          import_proposal:      { ...mapped },
          raw_payload:          wf,
          last_synced_at:       now,
        }).eq("id", existingRow.id);
```

Replace with:
```typescript
        await db.from("automatiseringen").update({
          naam:                 wf.name,
          status:               wf.enabled ? "Actief" : "Uitgeschakeld",
          trigger_beschrijving: mapped.trigger,
          systemen:             mapped.systemen,
          stappen:              mapped.stappen,
          branches:             mapped.branches,
          categorie:            mapped.categorie,
          webhook_paths:        mapped.webhookPaths,
          import_proposal:      { ...mapped },
          raw_payload:          wf,
          last_synced_at:       now,
        }).eq("id", existingRow.id);
```

- [ ] **Step 4: Add `webhook_paths` to the insert**

Find the insert block (inside the `else` branch, for new workflows):
```typescript
        await db.from("automatiseringen").insert({
          id:              newId || `AUTO-HS-${externalId}`,
          naam:            mapped.naam,
          status:          mapped.status,
          doel:            "",              // leeg laten — moet gekeurd worden
          trigger_beschrijving: mapped.trigger,
          systemen:        mapped.systemen,
          stappen:         mapped.stappen,
          branches:        mapped.branches,
          categorie:       mapped.categorie,
          afhankelijkheden: "",
          owner:           "",
          verbeterideeen:  "",
          mermaid_diagram: "",
          fasen:           mapped.fasen,
          external_id:     externalId,
          source:          "hubspot",
          import_source:   "hubspot",
          import_status:   "pending_approval",
          import_proposal: { ...mapped },
          raw_payload:     wf,
          last_synced_at:  now,
        });
```

Replace with:
```typescript
        await db.from("automatiseringen").insert({
          id:              newId || `AUTO-HS-${externalId}`,
          naam:            mapped.naam,
          status:          mapped.status,
          doel:            "",              // leeg laten — moet gekeurd worden
          trigger_beschrijving: mapped.trigger,
          systemen:        mapped.systemen,
          stappen:         mapped.stappen,
          branches:        mapped.branches,
          categorie:       mapped.categorie,
          afhankelijkheden: "",
          owner:           "",
          verbeterideeen:  "",
          mermaid_diagram: "",
          fasen:           mapped.fasen,
          webhook_paths:   mapped.webhookPaths,
          external_id:     externalId,
          source:          "hubspot",
          import_source:   "hubspot",
          import_status:   "pending_approval",
          import_proposal: { ...mapped },
          raw_payload:     wf,
          last_synced_at:  now,
        });
```

- [ ] **Step 5: Add the matching pass after the deactivate loop**

Find the block that updates the integration status (after the deactivate loop):
```typescript
    await db.from("integrations").update({
      last_synced_at: new Date().toISOString(),
      status: "connected",
      error_message: null,
    }).eq("id", integration.id);
```

Add the matching pass immediately before it:
```typescript
    // ── Endpoint matching pass ────────────────────────────────────────────────
    // Load all HubSpot automations with webhook_paths and all GitLab automations
    // with endpoints, then write matches into automation_links.
    const { data: hsAutos } = await db
      .from("automatiseringen")
      .select("id, webhook_paths")
      .eq("source", "hubspot");

    const { data: glAutos } = await db
      .from("automatiseringen")
      .select("id, endpoints")
      .eq("source", "gitlab");

    const newMatches: Array<{ source_id: string; target_id: string; match_type: string; confirmed: boolean }> = [];
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

    // Upsert — ignoreDuplicates preserves existing confirmed=true rows
    if (newMatches.length > 0) {
      await db.from("automation_links").upsert(newMatches, { onConflict: "source_id,target_id", ignoreDuplicates: true });
    }

    // Delete stale unconfirmed links (path match no longer present)
    const matchedKeys = new Set(newMatches.map((m) => `${m.source_id}:${m.target_id}`));
    const hsIds = (hsAutos ?? []).map((r: any) => r.id);
    if (hsIds.length > 0) {
      const { data: existingLinks } = await db
        .from("automation_links")
        .select("id, source_id, target_id")
        .in("source_id", hsIds)
        .eq("confirmed", false);

      const staleIds = (existingLinks ?? [])
        .filter((l: any) => !matchedKeys.has(`${l.source_id}:${l.target_id}`))
        .map((l: any) => l.id);

      if (staleIds.length > 0) {
        await db.from("automation_links").delete().in("id", staleIds);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

```

- [ ] **Step 6: Verify no other `webhook_paths` references needed**

```bash
grep -n "webhook_paths\|webhookPaths" supabase/functions/hubspot-sync/index.ts
```

Expected: `extractWebhookPaths` definition, `webhookPaths` in the `mapWorkflow` return, and `webhook_paths` in update + insert.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/hubspot-sync/index.ts
git commit -m "feat: store webhook_paths and run endpoint matching pass in hubspot-sync"
```

---

## Task 4: Frontend — storage functions and hooks

**Files:**
- Modify: `src/lib/supabaseStorage.ts`
- Modify: `src/lib/hooks.ts`

- [ ] **Step 1: Add types for link data at the top of `supabaseStorage.ts`**

Find the import line at the top of `src/lib/supabaseStorage.ts`:
```typescript
import { supabase } from "@/integrations/supabase/client";
import { Automatisering, Integration, Koppeling, KlantFase, Systeem, Categorie, Status, PortalSettings, getPortalSettings } from "./types";
```

No change needed to imports — the types below are local to supabaseStorage.

- [ ] **Step 2: Add `fetchAutomationLinks()` and `confirmAutomationLink()` at the end of `supabaseStorage.ts`**

Append to the end of `src/lib/supabaseStorage.ts`:
```typescript

// ─── Automation Links ─────────────────────────────────────────────────────────

export type AutomationLinkWithTarget = {
  id: string;
  source_id: string;
  target_id: string;
  match_type: string;
  confirmed: boolean;
  target: { id: string; naam: string; gitlab_file_path: string | null } | null;
};

export type AutomationLinkWithSource = {
  id: string;
  source_id: string;
  target_id: string;
  match_type: string;
  confirmed: boolean;
  source: { id: string; naam: string } | null;
};

export async function fetchAutomationLinks(id: string): Promise<{
  asSource: AutomationLinkWithTarget[];
  asTarget: AutomationLinkWithSource[];
}> {
  const db = supabase as any;
  const [{ data: asSource }, { data: asTarget }] = await Promise.all([
    db
      .from("automation_links")
      .select("id, source_id, target_id, match_type, confirmed, target:automatiseringen!target_id(id, naam, gitlab_file_path)")
      .eq("source_id", id),
    db
      .from("automation_links")
      .select("id, source_id, target_id, match_type, confirmed, source:automatiseringen!source_id(id, naam)")
      .eq("target_id", id),
  ]);
  return { asSource: asSource ?? [], asTarget: asTarget ?? [] };
}

export async function confirmAutomationLink(linkId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("automation_links")
    .update({ confirmed: true })
    .eq("id", linkId);
  if (error) throw error;
}
```

- [ ] **Step 3: Add `useAutomationLinks()` and `useConfirmLink()` to `hooks.ts`**

First update the import line at the top of `src/lib/hooks.ts`:
```typescript
import { fetchAutomatiseringen, insertAutomatisering, updateAutomatisering, deleteAutomatisering, generateNextId, verifieerAutomatisering, fetchIntegration, saveIntegration, deleteIntegration, triggerHubSpotSync, triggerZapierSync, triggerTypeformSync, triggerGitlabSync, fetchPortalSettings, savePortalSettings } from "./supabaseStorage";
```

Replace with:
```typescript
import { fetchAutomatiseringen, insertAutomatisering, updateAutomatisering, deleteAutomatisering, generateNextId, verifieerAutomatisering, fetchIntegration, saveIntegration, deleteIntegration, triggerHubSpotSync, triggerZapierSync, triggerTypeformSync, triggerGitlabSync, fetchPortalSettings, savePortalSettings, fetchAutomationLinks, confirmAutomationLink } from "./supabaseStorage";
```

Then append to the end of `src/lib/hooks.ts`:
```typescript

export function useAutomationLinks(id: string) {
  return useQuery({
    queryKey: ["automation_links", id],
    queryFn: () => fetchAutomationLinks(id),
    enabled: !!id,
  });
}

export function useConfirmLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => confirmAutomationLink(linkId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation_links"] }),
  });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabaseStorage.ts src/lib/hooks.ts
git commit -m "feat: add fetchAutomationLinks and useAutomationLinks hook"
```

---

## Task 5: UI — extract detail panel + add link sections

**Files:**
- Modify: `src/pages/AlleAutomatiseringen.tsx`

Context: the detail panel content is currently rendered inline inside the `sorted.map()` callback, between lines ~198 and ~322. It references `navigate`, `deleteMutation`, `a`, and `setOpenId`. We extract it to a component to allow hook calls (`useAutomationLinks`, `useConfirmLink`).

- [ ] **Step 1: Add import for the new hooks at the top of the file**

Find the hooks import line in `src/pages/AlleAutomatiseringen.tsx`:
```typescript
import { useAutomatiseringen, useSaveAutomatisering, useUpdateAutomatisering, useDeleteAutomatisering, usePortalSettings } from "@/lib/hooks";
```

Replace with:
```typescript
import { useAutomatiseringen, useSaveAutomatisering, useUpdateAutomatisering, useDeleteAutomatisering, usePortalSettings, useAutomationLinks, useConfirmLink } from "@/lib/hooks";
```

- [ ] **Step 2: Extract the inline detail panel into `AutomatiseringDetailPanel`**

In the `sorted.map()` body, find the entire `<div className="px-5 pb-5 pt-3 border-t border-border space-y-5">` block (lines ~198–322) and replace it with a component call:

```tsx
                  <AutomatiseringDetailPanel
                    a={a}
                    onDeleted={() => setOpenId(null)}
                    deleteMutation={deleteMutation}
                  />
```

Then add the `AutomatiseringDetailPanel` component at the bottom of the file (before the `Detail` function). It contains everything that was previously in the inline block, plus the new link sections:

```tsx
function AutomatiseringDetailPanel({
  a,
  onDeleted,
  deleteMutation,
}: {
  a: Automatisering;
  onDeleted: () => void;
  deleteMutation: ReturnType<typeof useDeleteAutomatisering>;
}) {
  const navigate = useNavigate();
  const { data: links } = useAutomationLinks(a.id);
  const confirmMutation = useConfirmLink();

  return (
    <div className="px-5 pb-5 pt-3 border-t border-border space-y-5">
      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => navigate(`/brandy?context=${a.id}&naam=${encodeURIComponent(a.naam)}`)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" /> Vraag Brandy
        </button>
        <button
          onClick={() => navigate(`/bewerk/${a.id}`)}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="inline-flex items-center gap-1.5 text-sm text-destructive hover:underline">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete automation?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{a.id} — {a.naam}</strong>? This also removes all links. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep Automation</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  try {
                    await deleteMutation.mutateAsync(a.id);
                    onDeleted();
                    toast.success(`${a.id} deleted`);
                  } catch (err: any) {
                    toast.error(err.message || "Delete failed");
                  }
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Plain-language description */}
      {a.beschrijvingInSimpeleTaal && a.beschrijvingInSimpeleTaal.length > 0 ? (
        <div className="bg-secondary/40 rounded-md px-4 py-3 space-y-1.5">
          <p className="label-uppercase mb-2">Wat doet deze automatisering?</p>
          {a.beschrijvingInSimpeleTaal.map((line, i) => (
            <p key={i} className="text-sm text-foreground leading-relaxed">{line}</p>
          ))}
        </div>
      ) : a.doel ? (
        <div className="bg-secondary/40 rounded-md px-4 py-3">
          <p className="label-uppercase mb-1">Wat doet deze automatisering?</p>
          <p className="text-sm text-foreground leading-relaxed">{a.doel}</p>
        </div>
      ) : null}

      {/* Trigger */}
      {a.trigger && (
        <div className="flex items-start gap-2">
          <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="label-uppercase mb-0.5">Wordt gestart door</p>
            <p className="text-sm text-foreground">{a.trigger}</p>
          </div>
        </div>
      )}

      {/* Flow steps */}
      {a.stappen.length > 0 && (
        <div>
          <p className="label-uppercase mb-2">Hoe werkt het?</p>
          <div className="flex flex-col gap-1.5">
            {a.stappen.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-foreground leading-snug pt-0.5">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase + meta row */}
      <div className="grid md:grid-cols-2 gap-4 pt-1 border-t border-border">
        {a.fasen && a.fasen.length > 0 && (
          <div>
            <p className="label-uppercase mb-1.5">Bedrijfsfasen</p>
            <div className="flex gap-1.5 flex-wrap">
              {a.fasen.map((f) => (
                <span key={f} className="px-2 py-0.5 rounded-full text-[11px] bg-secondary text-foreground border border-border">{f}</span>
              ))}
            </div>
          </div>
        )}
        {a.owner && <Detail label="Owner" value={a.owner} />}
        {a.afhankelijkheden && <Detail label="Dependencies" value={a.afhankelijkheden} />}
      </div>

      {/* Systems */}
      <div>
        <p className="label-uppercase mb-1">Systemen</p>
        <div className="flex gap-1.5 flex-wrap">
          {a.systemen.map((s) => <SystemBadge key={s} systeem={s} />)}
        </div>
      </div>

      {a.verbeterideeën && <Detail label="Improvement Ideas" value={a.verbeterideeën} />}

      {a.mermaidDiagram && (
        <div>
          <p className="label-uppercase mb-2">Flow Diagram</p>
          <MermaidDiagram chart={a.mermaidDiagram} />
        </div>
      )}

      {/* Backend Script (shown on HubSpot automations) */}
      {links && links.asSource.length > 0 && (
        <div className="border-t border-border pt-4">
          <p className="label-uppercase mb-2">Backend Script</p>
          <div className="space-y-2">
            {links.asSource.map((link) => (
              <div key={link.id} className="bg-secondary rounded-[var(--radius-inner)] p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground shrink-0">{link.target?.id}</span>
                    <span className="text-sm font-medium truncate">{link.target?.naam}</span>
                  </div>
                  {link.target?.gitlab_file_path && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{link.target.gitlab_file_path}</p>
                  )}
                </div>
                {link.confirmed ? (
                  <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Gekoppeld</span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Suggestie</span>
                    <button
                      onClick={() => confirmMutation.mutate(link.id)}
                      disabled={confirmMutation.isPending}
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      Bevestig
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HubSpot Workflows (shown on GitLab automations) */}
      {links && links.asTarget.length > 0 && (
        <div className="border-t border-border pt-4">
          <p className="label-uppercase mb-2">HubSpot Workflows</p>
          <div className="space-y-2">
            {links.asTarget.map((link) => (
              <div key={link.id} className="bg-secondary rounded-[var(--radius-inner)] p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground shrink-0">{link.source?.id}</span>
                  <span className="text-sm font-medium truncate">{link.source?.naam}</span>
                </div>
                {link.confirmed ? (
                  <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Gekoppeld</span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Suggestie</span>
                    <button
                      onClick={() => confirmMutation.mutate(link.id)}
                      disabled={confirmMutation.isPending}
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      Bevestig
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AlleAutomatiseringen.tsx
git commit -m "feat: add Backend Script and HubSpot Workflows sections to automation detail"
```

---

## Task 6: Deploy edge functions

**Files:** (no code changes)

- [ ] **Step 1: Deploy both updated edge functions**

```bash
npx supabase functions deploy gitlab-sync --project-ref icvrrpxtycwgaxcajwdf --no-verify-jwt
npx supabase functions deploy hubspot-sync --project-ref icvrrpxtycwgaxcajwdf --no-verify-jwt
```

Expected: `Deployed Functions on project icvrrpxtycwgaxcajwdf: gitlab-sync` and the same for `hubspot-sync`.

- [ ] **Step 2: Trigger GitLab sync to populate `endpoints`**

In the app, go to Instellingen → Externe systemen → GitLab → klik "Sync".

Verify in Supabase SQL editor:
```sql
SELECT id, naam, endpoints
FROM automatiseringen
WHERE source = 'gitlab'
  AND array_length(endpoints, 1) > 0
LIMIT 5;
```

Expected: rows with non-empty `endpoints` arrays, e.g. `{/clockify/hubspot/upsert_client}`.

- [ ] **Step 3: Trigger HubSpot sync to populate `webhook_paths` and run the matching pass**

In the app, go to Instellingen → Externe systemen → HubSpot → klik "Sync".

Verify `webhook_paths` populated:
```sql
SELECT id, naam, webhook_paths
FROM automatiseringen
WHERE source = 'hubspot'
  AND array_length(webhook_paths, 1) > 0
LIMIT 5;
```

Verify links created:
```sql
SELECT al.id, al.source_id, al.target_id, al.confirmed,
       hs.naam AS hubspot_naam, gl.naam AS gitlab_naam
FROM automation_links al
JOIN automatiseringen hs ON hs.id = al.source_id
JOIN automatiseringen gl ON gl.id = al.target_id
LIMIT 10;
```

Expected: rows showing HubSpot workflows linked to GitLab scripts.

- [ ] **Step 4: Verify UI in the app**

Open an automation from step 3 in the detail panel. It should show a "Backend Script" section with the matched GitLab automation. Open the linked GitLab automation — it should show a "HubSpot Workflows" section with the originating workflow. Unconfirmed links show an amber "Suggestie" badge and a "Bevestig" button. Clicking "Bevestig" turns it green.

- [ ] **Step 5: Commit (no code changes — mark complete)**

All code was committed in earlier tasks. No additional commit needed.
