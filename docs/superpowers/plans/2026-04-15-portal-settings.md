# Portaalinstellingen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an organisation-wide settings card to Instellingen that lets users configure verification period, active statuses/categories, default filters, sort order, required fields, and custom systems/categories — all persisted in Supabase without code changes.

**Architecture:** A single `portal_settings` table holds one JSON row (`id = 'main'`). A `PortalSettings` TypeScript type with defaults is defined in `types.ts`; `fetchPortalSettings`/`savePortalSettings` live in `supabaseStorage.ts`; two React Query hooks expose them. A new `PortaalInstellingenCard` component renders the settings form at the top of `Instellingen.tsx`. Downstream pages (`AlleAutomatiseringen`, `AutomatiseringForm`) read the settings to initialise filters and validate required fields.

**Tech Stack:** TypeScript, React, TanStack Query v5, Supabase JS v2, Tailwind CSS, Sonner (toasts)

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `supabase/migrations/20260415120000_portal_settings.sql` | New table + RLS |
| Modify | `src/lib/types.ts` | Add `PortalSettings`, `DEFAULT_PORTAL_SETTINGS`, `getPortalSettings()`, optional param on `getVerificatieStatus()` |
| Modify | `src/lib/supabaseStorage.ts` | Add `fetchPortalSettings()`, `savePortalSettings()` |
| Modify | `src/lib/hooks.ts` | Add `usePortalSettings()`, `useSavePortalSettings()` |
| Modify | `src/pages/Instellingen.tsx` | Add `PortaalInstellingenCard` component + render at top |
| Modify | `src/pages/AlleAutomatiseringen.tsx` | Init `statusFilter` + `sortOrder` from settings; add client-side sort |
| Modify | `src/components/AutomatiseringForm.tsx` | Use effective systemen/categorieën; validate `verplichtVelden` on submit |

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260415120000_portal_settings.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260415120000_portal_settings.sql
create table if not exists portal_settings (
  id          text primary key default 'main',
  settings    jsonb not null default '{}',
  updated_at  timestamptz default now()
);

alter table portal_settings enable row level security;

create policy "portal_settings_read"
  on portal_settings for select using (true);

create policy "portal_settings_write"
  on portal_settings for all using (auth.role() = 'authenticated');
```

- [ ] **Step 2: Apply the migration to the hosted project**

```bash
npx supabase db push --project-ref icvrrpxtycwgaxcajwdf
```

Expected output: `Applying migration 20260415120000_portal_settings.sql...` with no errors.

- [ ] **Step 3: Verify in Supabase dashboard**

Go to https://supabase.com/dashboard/project/icvrrpxtycwgaxcajwdf/editor and run:
```sql
select * from portal_settings;
```
Expected: empty result set (no rows yet — that's correct, the first upsert creates the row).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260415120000_portal_settings.sql
git commit -m "feat: add portal_settings table with RLS"
```

---

## Task 2: Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add `PortalSettings` and helpers at the bottom of `src/lib/types.ts`**

Append these exports after the existing `berekenImpact` function:

```typescript
// ── Portal Settings ──────────────────────────────────────────────────────────

export type VerplichtVeld =
  | "doel"
  | "trigger"
  | "systemen"
  | "stappen"
  | "owner"
  | "fasen"
  | "afhankelijkheden";

export interface PortalSettings {
  verificatiePeriodeDagen: number;
  beschikbareStatussen: Status[];
  beschikbareCategorieen: Categorie[];
  standaardStatusFilter: string;
  standaardSortering: "created_at" | "naam" | "status";
  verplichtVelden: VerplichtVeld[];
  extraSystemen: string[];
  extraCategorieen: string[];
}

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  verificatiePeriodeDagen: 90,
  beschikbareStatussen: ["Actief", "Verouderd", "In review", "Uitgeschakeld"],
  beschikbareCategorieen: [
    "HubSpot Workflow", "Zapier Zap", "Backend Script", "HubSpot + Zapier",
    "Typeform", "SharePoint", "WeFact", "Docufy", "E-mail", "API", "Anders",
  ],
  standaardStatusFilter: "alle",
  standaardSortering: "created_at",
  verplichtVelden: [],
  extraSystemen: [],
  extraCategorieen: [],
};

export function getPortalSettings(raw: Partial<PortalSettings>): PortalSettings {
  return { ...DEFAULT_PORTAL_SETTINGS, ...raw };
}
```

- [ ] **Step 2: Update `getVerificatieStatus` to accept optional period**

Replace the existing `getVerificatieStatus` function:

```typescript
export function getVerificatieStatus(a: Automatisering, periodeDagen = 90): VerificatieStatus {
  if (!a.laatstGeverifieerd) return "nooit";
  const diff = Date.now() - new Date(a.laatstGeverifieerd).getTime();
  const threshold = periodeDagen * 24 * 60 * 60 * 1000;
  return diff <= threshold ? "geverifieerd" : "verouderd";
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add PortalSettings type and update getVerificatieStatus signature"
```

---

## Task 3: Storage functions

**Files:**
- Modify: `src/lib/supabaseStorage.ts`

- [ ] **Step 1: Update the import line at the top of `src/lib/supabaseStorage.ts`**

Change:
```typescript
import { Automatisering, Integration, Koppeling, KlantFase, Systeem, Categorie, Status } from "./types";
```
To:
```typescript
import { Automatisering, Integration, Koppeling, KlantFase, Systeem, Categorie, Status, PortalSettings, getPortalSettings } from "./types";
```

- [ ] **Step 2: Add `fetchPortalSettings` and `savePortalSettings` at the bottom of the file**

```typescript
// ─── Portal Settings ─────────────────────────────────────────────────────────

export async function fetchPortalSettings(): Promise<PortalSettings> {
  const { data, error } = await (supabase as any)
    .from("portal_settings")
    .select("settings")
    .eq("id", "main")
    .maybeSingle();
  if (error) throw error;
  return getPortalSettings((data?.settings ?? {}) as Partial<PortalSettings>);
}

export async function savePortalSettings(settings: PortalSettings): Promise<void> {
  const { error } = await (supabase as any)
    .from("portal_settings")
    .upsert(
      { id: "main", settings, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) throw error;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabaseStorage.ts
git commit -m "feat: add fetchPortalSettings and savePortalSettings"
```

---

## Task 4: Hooks

**Files:**
- Modify: `src/lib/hooks.ts`

- [ ] **Step 1: Update the import line in `src/lib/hooks.ts`**

Change:
```typescript
import { fetchAutomatiseringen, insertAutomatisering, updateAutomatisering, deleteAutomatisering, generateNextId, verifieerAutomatisering, fetchIntegration, saveIntegration, deleteIntegration, triggerHubSpotSync, triggerZapierSync, triggerTypeformSync, triggerGitlabSync } from "./supabaseStorage";
```
To:
```typescript
import { fetchAutomatiseringen, insertAutomatisering, updateAutomatisering, deleteAutomatisering, generateNextId, verifieerAutomatisering, fetchIntegration, saveIntegration, deleteIntegration, triggerHubSpotSync, triggerZapierSync, triggerTypeformSync, triggerGitlabSync, fetchPortalSettings, savePortalSettings } from "./supabaseStorage";
```

Also add `PortalSettings` to the types import:
```typescript
import { Automatisering, PortalSettings } from "./types";
```

- [ ] **Step 2: Add `usePortalSettings` and `useSavePortalSettings` at the bottom of `src/lib/hooks.ts`**

```typescript
export function usePortalSettings() {
  return useQuery({
    queryKey: ["portal_settings"],
    queryFn: fetchPortalSettings,
  });
}

export function useSavePortalSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: PortalSettings) => savePortalSettings(settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal_settings"] }),
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/hooks.ts
git commit -m "feat: add usePortalSettings and useSavePortalSettings hooks"
```

---

## Task 5: PortaalInstellingenCard UI

**Files:**
- Modify: `src/pages/Instellingen.tsx`

- [ ] **Step 1: Add imports to `src/pages/Instellingen.tsx`**

Add to the existing import block:
```typescript
import { useState, useEffect } from "react";
import { usePortalSettings, useSavePortalSettings } from "@/lib/hooks";
import { PortalSettings, DEFAULT_PORTAL_SETTINGS, STATUSSEN, CATEGORIEEN, VerplichtVeld } from "@/lib/types";
import { Loader2, Save } from "lucide-react";
```

Note: `useState` is already imported. Only add what's missing.

- [ ] **Step 2: Add the `PortaalInstellingenCard` component before the `IntegrationCard` function**

Insert this entire component before line 22 (the `function IntegrationCard` line):

```typescript
function PortaalInstellingenCard() {
  const { data: saved, isLoading } = usePortalSettings();
  const save = useSavePortalSettings();
  const [local, setLocal] = useState<PortalSettings>(DEFAULT_PORTAL_SETTINGS);
  const [newSysteem, setNewSysteem] = useState("");
  const [newCategorie, setNewCategorie] = useState("");

  useEffect(() => {
    if (saved) setLocal(saved);
  }, [saved]);

  function toggleStatus(s: typeof STATUSSEN[number]) {
    const next = local.beschikbareStatussen.includes(s)
      ? local.beschikbareStatussen.filter((x) => x !== s)
      : [...local.beschikbareStatussen, s];
    if (next.length === 0) return; // minimaal één
    setLocal({ ...local, beschikbareStatussen: next });
  }

  function toggleCategorie(c: typeof CATEGORIEEN[number]) {
    const next = local.beschikbareCategorieen.includes(c)
      ? local.beschikbareCategorieen.filter((x) => x !== c)
      : [...local.beschikbareCategorieen, c];
    if (next.length === 0) return;
    setLocal({ ...local, beschikbareCategorieen: next });
  }

  function toggleVerplicht(v: VerplichtVeld) {
    const next = local.verplichtVelden.includes(v)
      ? local.verplichtVelden.filter((x) => x !== v)
      : [...local.verplichtVelden, v];
    setLocal({ ...local, verplichtVelden: next });
  }

  function addSysteem() {
    const val = newSysteem.trim();
    if (!val || local.extraSystemen.includes(val)) return;
    setLocal({ ...local, extraSystemen: [...local.extraSystemen, val] });
    setNewSysteem("");
  }

  function addCategorie() {
    const val = newCategorie.trim();
    if (!val || local.extraCategorieen.includes(val)) return;
    setLocal({ ...local, extraCategorieen: [...local.extraCategorieen, val] });
    setNewCategorie("");
  }

  async function handleSave() {
    try {
      await save.mutateAsync(local);
      toast.success("Instellingen opgeslagen");
    } catch (e: any) {
      toast.error(e.message || "Opslaan mislukt");
    }
  }

  const labelClass = "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-3";
  const rowClass = "flex items-start gap-3 mb-3";
  const fieldLabelClass = "w-40 shrink-0 text-sm text-foreground pt-0.5";

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Portaalinstellingen laden...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <h2 className="font-medium text-sm">Portaalinstellingen</h2>

      {/* BEDRIJFSREGELS */}
      <div>
        <p className={labelClass}>Bedrijfsregels</p>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Verificatieperiode</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={365}
              value={local.verificatiePeriodeDagen}
              onChange={(e) => setLocal({ ...local, verificatiePeriodeDagen: Math.max(1, Number(e.target.value)) })}
              className="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground">dagen</span>
          </div>
        </div>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Actieve statussen</span>
          <div className="flex flex-wrap gap-2">
            {STATUSSEN.map((s) => (
              <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={local.beschikbareStatussen.includes(s)}
                  onChange={() => toggleStatus(s)}
                  className="rounded"
                />
                <span className="text-sm">{s}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Actieve categorieën</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIEEN.map((c) => (
              <label key={c} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={local.beschikbareCategorieen.includes(c)}
                  onChange={() => toggleCategorie(c)}
                  className="rounded"
                />
                <span className="text-sm">{c}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* WEERGAVE-STANDAARDEN */}
      <div>
        <p className={labelClass}>Weergave-standaarden</p>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Standaard statusfilter</span>
          <select
            value={local.standaardStatusFilter}
            onChange={(e) => setLocal({ ...local, standaardStatusFilter: e.target.value })}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="alle">Alle statussen</option>
            {STATUSSEN.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Standaard sortering</span>
          <select
            value={local.standaardSortering}
            onChange={(e) => setLocal({ ...local, standaardSortering: e.target.value as PortalSettings["standaardSortering"] })}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="created_at">Aanmaakdatum</option>
            <option value="naam">Naam (A–Z)</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* DATAVELDEN */}
      <div>
        <p className={labelClass}>Datavelden</p>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Verplichte velden</span>
          <div className="flex flex-wrap gap-2">
            {(["doel", "trigger", "systemen", "stappen", "owner", "fasen", "afhankelijkheden"] as VerplichtVeld[]).map((v) => (
              <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={local.verplichtVelden.includes(v)}
                  onChange={() => toggleVerplicht(v)}
                  className="rounded"
                />
                <span className="text-sm capitalize">{v}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Extra systemen</span>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newSysteem}
                onChange={(e) => setNewSysteem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSysteem()}
                placeholder="Systeem toevoegen..."
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button onClick={addSysteem} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary transition-colors">+</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {local.extraSystemen.map((s, i) => (
                <span key={i} className="flex items-center gap-1 bg-secondary px-2 py-0.5 rounded text-xs">
                  {s}
                  <button onClick={() => setLocal({ ...local, extraSystemen: local.extraSystemen.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-foreground">×</button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Extra categorieën</span>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategorie}
                onChange={(e) => setNewCategorie(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategorie()}
                placeholder="Categorie toevoegen..."
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button onClick={addCategorie} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary transition-colors">+</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {local.extraCategorieen.map((c, i) => (
                <span key={i} className="flex items-center gap-1 bg-secondary px-2 py-0.5 rounded text-xs">
                  {c}
                  <button onClick={() => setLocal({ ...local, extraCategorieen: local.extraCategorieen.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-foreground">×</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          onClick={handleSave}
          disabled={save.isPending}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Save className="h-3.5 w-3.5" />
          {save.isPending ? "Opslaan..." : "Instellingen opslaan"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render `PortaalInstellingenCard` at the top of the `Instellingen` return**

In the `Instellingen` function, add `<PortaalInstellingenCard />` as the first card, before `{cards.map(...)}`:

```tsx
return (
  <div className="max-w-2xl space-y-6">
    <div>
      <h1 className="text-xl font-semibold">Instellingen</h1>
      <p className="text-sm text-muted-foreground mt-1">Beheer koppelingen met externe systemen</p>
    </div>

    <PortaalInstellingenCard />

    {cards.map((c) => (
      <div key={c.key}>{c.node}</div>
    ))}
  </div>
);
```

- [ ] **Step 4: Verify in browser**

Run the dev server (`npm run dev`), navigate to `/instellingen`. Expected:
- "Portaalinstellingen" card appears above integration cards
- All checkboxes checked by default (all statuses/categories active)
- Verification period shows 90
- Clicking "Instellingen opslaan" shows success toast
- Refresh page — saved values persist

- [ ] **Step 5: Commit**

```bash
git add src/pages/Instellingen.tsx
git commit -m "feat: add PortaalInstellingenCard to Instellingen page"
```

---

## Task 6: AlleAutomatiseringen — init filters and sort from settings

**Files:**
- Modify: `src/pages/AlleAutomatiseringen.tsx`

- [ ] **Step 1: Add `usePortalSettings` import**

Add to the existing import from `@/lib/hooks`:
```typescript
import { useAutomatiseringen, useDeleteAutomatisering, usePortalSettings } from "@/lib/hooks";
```

- [ ] **Step 2: Add settings hook and init effect inside `AlleAutomatiseringen`**

After the existing `const { data, isLoading } = useAutomatiseringen();` line, add:

```typescript
const { data: portalSettings } = usePortalSettings();
const [sortOrder, setSortOrder] = useState<"created_at" | "naam" | "status">("created_at");
const [settingsApplied, setSettingsApplied] = useState(false);

useEffect(() => {
  if (portalSettings && !settingsApplied) {
    setStatusFilter(portalSettings.standaardStatusFilter);
    setSortOrder(portalSettings.standaardSortering);
    setSettingsApplied(true);
  }
}, [portalSettings, settingsApplied]);
```

- [ ] **Step 3: Add client-side sort after the `filtered` array**

After the existing `const filtered = all.filter(...)` block, add:

```typescript
const sorted = [...filtered].sort((a, b) => {
  if (sortOrder === "naam") return a.naam.localeCompare(b.naam, "nl");
  if (sortOrder === "status") return a.status.localeCompare(b.status, "nl");
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
});
```

- [ ] **Step 4: Replace `filtered.map` with `sorted.map` and update result count**

Change `{filtered.map((a) => {` to `{sorted.map((a) => {`

Change `<p className="text-sm text-muted-foreground">{filtered.length} results</p>` to `<p className="text-sm text-muted-foreground">{sorted.length} results</p>`

- [ ] **Step 5: Add sort dropdown to the filter row**

After the existing koppelingFilter `<Select>`, add:

```tsx
<Select value={sortOrder} onValueChange={(v) => setSortOrder(v as typeof sortOrder)}>
  <SelectTrigger className="w-44"><SelectValue placeholder="Sortering" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="created_at">Aanmaakdatum</SelectItem>
    <SelectItem value="naam">Naam (A–Z)</SelectItem>
    <SelectItem value="status">Status</SelectItem>
  </SelectContent>
</Select>
```

- [ ] **Step 6: Also reset sortOrder in the `?open=` effect**

In the existing `useEffect` that handles `pendingOpen`, add:
```typescript
setSortOrder(portalSettings?.standaardSortering ?? "created_at");
setSettingsApplied(false); // allow re-init if settings load later
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Verify in browser**

1. Go to Instellingen, set standaard sortering to "Naam (A–Z)", save
2. Navigate to `/alle` — list should open already sorted A–Z
3. Change the sort dropdown on the page — list reorders immediately

- [ ] **Step 9: Commit**

```bash
git add src/pages/AlleAutomatiseringen.tsx
git commit -m "feat: init AlleAutomatiseringen filters and sort from portal settings"
```

---

## Task 7: AutomatiseringForm — effective lists and required field validation

**Files:**
- Modify: `src/components/AutomatiseringForm.tsx`

- [ ] **Step 1: Add `usePortalSettings` import to `AutomatiseringForm.tsx`**

Add to the hooks import:
```typescript
import { useAutomatiseringen, useSaveAutomatisering, useUpdateAutomatisering, useNextId, usePortalSettings } from "@/lib/hooks";
```

- [ ] **Step 2: Add portal settings hook and effective lists inside the component**

After the existing `const updateMutation = useUpdateAutomatisering();` line, add:

```typescript
const { data: portalSettings } = usePortalSettings();
const effectiveSystemen = [
  ...SYSTEMEN,
  ...(portalSettings?.extraSystemen ?? []),
] as string[];
const effectiveCategorieen = [
  ...CATEGORIEEN,
  ...(portalSettings?.extraCategorieen ?? []),
] as string[];
```

- [ ] **Step 3: Replace `SYSTEMEN` with `effectiveSystemen` in the form JSX**

Find every place in `AutomatiseringForm.tsx` where `SYSTEMEN` is used to render checkboxes or options, and replace with `effectiveSystemen`. Similarly replace `CATEGORIEEN` with `effectiveCategorieen`.

To find them:
```bash
grep -n "SYSTEMEN\|CATEGORIEEN" src/components/AutomatiseringForm.tsx
```

Replace each occurrence used for rendering (not type annotations) with the effective version.

- [ ] **Step 4: Add required-field validation to the `submit` function**

In the `submit` function, after the existing `if (!form.naam?.trim())` check, add:

```typescript
const required = portalSettings?.verplichtVelden ?? [];
for (const veld of required) {
  if (veld === "systemen" && (!form.systemen || form.systemen.length === 0)) {
    toast.error("Systemen is verplicht"); return;
  }
  if (veld === "fasen" && (!form.fasen || form.fasen.length === 0)) {
    toast.error("Fasen is verplicht"); return;
  }
  if (veld === "stappen" && (!form.stappen || form.stappen.filter((s) => s.trim()).length === 0)) {
    toast.error("Stappen is verplicht"); return;
  }
  if (
    (veld === "doel" || veld === "trigger" || veld === "owner" || veld === "afhankelijkheden") &&
    !form[veld]?.trim()
  ) {
    const label: Record<string, string> = {
      doel: "Doel", trigger: "Trigger", owner: "Owner", afhankelijkheden: "Afhankelijkheden",
    };
    toast.error(`${label[veld]} is verplicht`);
    return;
  }
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Verify in browser**

1. Go to Instellingen, mark "Owner" as verplicht veld, save
2. Go to `/nieuw`, fill in only the name, click save
3. Expected: toast "Owner is verplicht", form does not submit
4. Fill in owner, save again — succeeds

Also verify extra systemen:
1. Add "Moneybird" as extra systeem in portaalinstellingen, save
2. Go to `/nieuw` — "Moneybird" should appear in the systemen checkboxes

- [ ] **Step 7: Commit**

```bash
git add src/components/AutomatiseringForm.tsx
git commit -m "feat: use portal settings for effective lists and required field validation"
```
