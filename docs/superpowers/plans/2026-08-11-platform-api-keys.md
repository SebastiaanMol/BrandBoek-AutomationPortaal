# Platform API Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build revocable, audited platform API keys for full external read/edit control, with Claude Desktop access through a local MCP bridge.

**Architecture:** Supabase stores hashed API keys and audit events. A public `platform-api` Edge Function validates bearer keys, checks scopes, and performs controlled `automatiseringen` reads/writes with the service role. The React Settings page manages keys through Supabase RPCs, and a local Node MCP server wraps the Edge Function for Claude Desktop.

**Tech Stack:** Supabase migrations/RPC/RLS, Supabase Edge Functions on Deno, React 18, TypeScript, TanStack Query, Vitest, Node MCP SDK.

---

## File Structure

- Create: `supabase/migrations/20260811120000_platform_api_keys.sql`
  - Tables, RLS policies, key creation/revocation RPCs, and audit read access.
- Create: `supabase/functions/platform-api/index.ts`
  - Bearer-key auth, scope checks, audit logging, and `automatiseringen` CRUD routes. `DELETE` returns `405` in the first release.
- Modify: `supabase/config.toml`
  - Add `[functions.platform-api] verify_jwt = false`.
- Modify: `src/integrations/supabase/types.ts`
  - Add generated-style table and function types for `platform_api_keys`, `platform_api_audit_events`, `create_platform_api_key`, and `revoke_platform_api_key`.
- Create: `src/lib/storage/platformApiKeys.ts`
  - Frontend data access for listing, creating, revoking, and reading audit events.
- Create: `src/lib/queryHooks/platformApiKeys.ts`
  - React Query hooks around the storage functions.
- Create: `src/components/settings/PlatformApiKeysCard.tsx`
  - Settings UI for API key management.
- Modify: `src/pages/Instellingen.tsx`
  - Add an `API keys` tab that renders `PlatformApiKeysCard`.
- Create: `src/test/platformApiKeysStorage.test.ts`
  - Storage/RPC tests.
- Create: `src/test/platformApiKeysSettings.test.tsx`
  - Settings UI tests.
- Create: `src/test/platformApiFunctionSource.test.ts`
  - Static source checks for the Edge Function security behavior.
- Create: `mcp/claude-desktop/package.json`
  - Minimal MCP bridge package metadata.
- Create: `mcp/claude-desktop/src/server.ts`
  - MCP tools that call the `platform-api` Edge Function.
- Create: `mcp/claude-desktop/README.md`
  - Local Claude Desktop setup instructions.

---

### Task 1: Database Schema And RPCs

**Files:**
- Create: `supabase/migrations/20260811120000_platform_api_keys.sql`
- Modify: `src/integrations/supabase/types.ts`

- [ ] **Step 1: Write migration file**

Create `supabase/migrations/20260811120000_platform_api_keys.sql` with this SQL:

```sql
create extension if not exists pgcrypto;

create table if not exists public.platform_api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default array['admin:*']::text[],
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null
);

create index if not exists platform_api_keys_status_idx
  on public.platform_api_keys(status);

create table if not exists public.platform_api_audit_events (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid references public.platform_api_keys(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  success boolean not null,
  error_summary text,
  request_method text,
  request_path text,
  request_ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_api_audit_events_api_key_id_created_at_idx
  on public.platform_api_audit_events(api_key_id, created_at desc);

alter table public.platform_api_keys enable row level security;
alter table public.platform_api_audit_events enable row level security;

drop policy if exists "authenticated can read platform api key metadata" on public.platform_api_keys;
create policy "authenticated can read platform api key metadata"
  on public.platform_api_keys
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated can read platform api audit events" on public.platform_api_audit_events;
create policy "authenticated can read platform api audit events"
  on public.platform_api_audit_events
  for select
  to authenticated
  using (true);

revoke insert, update, delete on public.platform_api_keys from authenticated;
revoke insert, update, delete on public.platform_api_audit_events from authenticated;

create or replace function public.create_platform_api_key(
  key_name text,
  raw_key text,
  key_scopes text[] default array['admin:*']::text[]
)
returns table (
  id uuid,
  name text,
  key_prefix text,
  scopes text[],
  status text,
  created_at timestamptz,
  plaintext_key text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := trim(key_name);
  normalized_key text := trim(raw_key);
  inserted public.platform_api_keys;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if normalized_name = '' then
    raise exception 'key_name_required';
  end if;

  if normalized_key !~ '^bn_live_[A-Za-z0-9_-]{48,}$' then
    raise exception 'invalid_key_format';
  end if;

  insert into public.platform_api_keys (
    name,
    key_prefix,
    key_hash,
    scopes,
    created_by
  )
  values (
    normalized_name,
    left(normalized_key, 16),
    encode(digest(normalized_key, 'sha256'), 'hex'),
    coalesce(nullif(key_scopes, array[]::text[]), array['admin:*']::text[]),
    auth.uid()
  )
  returning * into inserted;

  return query
  select
    inserted.id,
    inserted.name,
    inserted.key_prefix,
    inserted.scopes,
    inserted.status,
    inserted.created_at,
    normalized_key;
end;
$$;

create or replace function public.revoke_platform_api_key(api_key_id uuid)
returns table (
  id uuid,
  status text,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.platform_api_keys;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.platform_api_keys
  set
    status = 'revoked',
    revoked_at = coalesce(revoked_at, now()),
    revoked_by = coalesce(revoked_by, auth.uid())
  where platform_api_keys.id = api_key_id
  returning * into updated;

  if updated.id is null then
    raise exception 'api_key_not_found';
  end if;

  return query select updated.id, updated.status, updated.revoked_at;
end;
$$;

grant execute on function public.create_platform_api_key(text, text, text[]) to authenticated;
grant execute on function public.revoke_platform_api_key(uuid) to authenticated;
```

- [ ] **Step 2: Add frontend Supabase types**

Modify `src/integrations/supabase/types.ts` by adding these table definitions inside `Database.public.Tables`:

```ts
      platform_api_keys: {
        Row: {
          id: string
          name: string
          key_prefix: string
          key_hash: string
          scopes: string[]
          status: string
          created_by: string | null
          created_at: string
          last_used_at: string | null
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          id?: string
          name: string
          key_prefix: string
          key_hash: string
          scopes?: string[]
          status?: string
          created_by?: string | null
          created_at?: string
          last_used_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          key_prefix?: string
          key_hash?: string
          scopes?: string[]
          status?: string
          created_by?: string | null
          created_at?: string
          last_used_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: []
      }
      platform_api_audit_events: {
        Row: {
          id: string
          api_key_id: string | null
          action: string
          target_type: string | null
          target_id: string | null
          success: boolean
          error_summary: string | null
          request_method: string | null
          request_path: string | null
          request_ip: string | null
          user_agent: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          api_key_id?: string | null
          action: string
          target_type?: string | null
          target_id?: string | null
          success: boolean
          error_summary?: string | null
          request_method?: string | null
          request_path?: string | null
          request_ip?: string | null
          user_agent?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          api_key_id?: string | null
          action?: string
          target_type?: string | null
          target_id?: string | null
          success?: boolean
          error_summary?: string | null
          request_method?: string | null
          request_path?: string | null
          request_ip?: string | null
          user_agent?: string | null
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
```

Then replace the `Functions` block with:

```ts
    Functions: {
      create_platform_api_key: {
        Args: {
          key_name: string
          raw_key: string
          key_scopes?: string[]
        }
        Returns: {
          id: string
          name: string
          key_prefix: string
          scopes: string[]
          status: string
          created_at: string
          plaintext_key: string
        }[]
      }
      generate_auto_id: { Args: never; Returns: string }
      revoke_platform_api_key: {
        Args: { api_key_id: string }
        Returns: {
          id: string
          status: string
          revoked_at: string
        }[]
      }
    }
```

- [ ] **Step 3: Run focused validation**

Run:

```bash
npm run test -- src/test/automationsStorage.test.ts
```

Expected: existing tests pass. This task adds schema/types only, so no app behavior should change.

- [ ] **Step 4: Commit database foundation**

Run:

```bash
git add supabase/migrations/20260811120000_platform_api_keys.sql src/integrations/supabase/types.ts
git commit -m "feat: add platform api key schema"
```

Expected: commit succeeds with only these two files staged.

---

### Task 2: Frontend API Key Storage And Hooks

**Files:**
- Create: `src/lib/storage/platformApiKeys.ts`
- Create: `src/lib/queryHooks/platformApiKeys.ts`
- Create: `src/test/platformApiKeysStorage.test.ts`

- [ ] **Step 1: Write storage tests**

Create `src/test/platformApiKeysStorage.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  table: "",
  apiKeys: [] as unknown[],
  auditEvents: [] as unknown[],
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      mocks.table = table;
      if (table === "platform_api_keys") {
        return {
          select(selection: string) {
            expect(selection).not.toContain("key_hash");
            return {
              order() {
                return Promise.resolve({ data: mocks.apiKeys, error: null });
              },
            };
          },
        };
      }
      if (table === "platform_api_audit_events") {
        return {
          select() {
            const query = {
              eq() {
                return query;
              },
              order() {
                return {
                  limit() {
                    return Promise.resolve({ data: mocks.auditEvents, error: null });
                  },
                };
              },
            };
            return query;
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc(name: string, args: Record<string, unknown>) {
      mocks.rpcCalls.push({ name, args });
      if (name === "create_platform_api_key") {
        return Promise.resolve({
          data: [{
            id: "key-1",
            name: args.key_name,
            key_prefix: "bn_live_testpref",
            scopes: args.key_scopes,
            status: "active",
            created_at: "2026-08-11T10:00:00.000Z",
            plaintext_key: args.raw_key,
          }],
          error: null,
        });
      }
      if (name === "revoke_platform_api_key") {
        return Promise.resolve({
          data: [{ id: args.api_key_id, status: "revoked", revoked_at: "2026-08-11T11:00:00.000Z" }],
          error: null,
        });
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  },
}));

describe("platform api key storage", () => {
  beforeEach(() => {
    mocks.table = "";
    mocks.apiKeys = [{
      id: "key-1",
      name: "Claude Desktop",
      key_prefix: "bn_live_abcd",
      scopes: ["admin:*"],
      status: "active",
      created_by: "user-1",
      created_at: "2026-08-11T10:00:00.000Z",
      last_used_at: null,
      revoked_at: null,
      revoked_by: null,
    }];
    mocks.auditEvents = [];
    mocks.rpcCalls = [];
  });

  it("lists api key metadata without selecting key hashes", async () => {
    const { fetchPlatformApiKeys } = await import("@/lib/storage/platformApiKeys");

    const keys = await fetchPlatformApiKeys();

    expect(keys).toEqual([{
      id: "key-1",
      name: "Claude Desktop",
      keyPrefix: "bn_live_abcd",
      scopes: ["admin:*"],
      status: "active",
      createdBy: "user-1",
      createdAt: "2026-08-11T10:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
    }]);
  });

  it("creates a generated full-control key through the RPC", async () => {
    const { createPlatformApiKey } = await import("@/lib/storage/platformApiKeys");

    const created = await createPlatformApiKey("Claude Desktop");

    expect(created.plaintextKey).toMatch(/^bn_live_/);
    expect(created.scopes).toEqual(["admin:*"]);
    expect(mocks.rpcCalls[0]).toMatchObject({
      name: "create_platform_api_key",
      args: {
        key_name: "Claude Desktop",
        key_scopes: ["admin:*"],
      },
    });
    expect(String(mocks.rpcCalls[0].args.raw_key)).toMatch(/^bn_live_/);
  });

  it("revokes a key through the RPC", async () => {
    const { revokePlatformApiKey } = await import("@/lib/storage/platformApiKeys");

    await revokePlatformApiKey("key-1");

    expect(mocks.rpcCalls[0]).toEqual({
      name: "revoke_platform_api_key",
      args: { api_key_id: "key-1" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/test/platformApiKeysStorage.test.ts
```

Expected: FAIL because `@/lib/storage/platformApiKeys` does not exist.

- [ ] **Step 3: Create storage module**

Create `src/lib/storage/platformApiKeys.ts`:

```ts
import { supabase } from "@/integrations/supabase/client";

export interface PlatformApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  status: "active" | "revoked";
  createdBy: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}

export interface CreatedPlatformApiKey extends PlatformApiKey {
  plaintextKey: string;
}

export interface PlatformApiAuditEvent {
  id: string;
  apiKeyId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  success: boolean;
  errorSummary: string | null;
  requestMethod: string | null;
  requestPath: string | null;
  createdAt: string;
}

export async function fetchPlatformApiKeys(): Promise<PlatformApiKey[]> {
  const { data, error } = await supabase
    .from("platform_api_keys")
    .select("id,name,key_prefix,scopes,status,created_by,created_at,last_used_at,revoked_at,revoked_by")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapApiKey);
}

export async function createPlatformApiKey(name: string): Promise<CreatedPlatformApiKey> {
  const rawKey = generatePlatformApiKey();
  const { data, error } = await supabase.rpc("create_platform_api_key", {
    key_name: name.trim(),
    raw_key: rawKey,
    key_scopes: ["admin:*"],
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("API key aanmaken mislukt");
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: row.scopes,
    status: row.status as PlatformApiKey["status"],
    createdBy: null,
    createdAt: row.created_at,
    lastUsedAt: null,
    revokedAt: null,
    revokedBy: null,
    plaintextKey: row.plaintext_key,
  };
}

export async function revokePlatformApiKey(id: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_platform_api_key", { api_key_id: id });
  if (error) throw error;
}

export async function fetchPlatformApiAuditEvents(apiKeyId: string): Promise<PlatformApiAuditEvent[]> {
  const { data, error } = await supabase
    .from("platform_api_audit_events")
    .select("id,api_key_id,action,target_type,target_id,success,error_summary,request_method,request_path,created_at")
    .eq("api_key_id", apiKeyId)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    apiKeyId: row.api_key_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    success: row.success,
    errorSummary: row.error_summary,
    requestMethod: row.request_method,
    requestPath: row.request_path,
    createdAt: row.created_at,
  }));
}

function generatePlatformApiKey(): string {
  const bytes = new Uint8Array(36);
  crypto.getRandomValues(bytes);
  const secret = Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("");
  return `bn_live_${secret}`;
}

function mapApiKey(row: {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  status: string;
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
}): PlatformApiKey {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: row.scopes,
    status: row.status as PlatformApiKey["status"],
    createdBy: row.created_by,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
  };
}
```

- [ ] **Step 4: Create query hooks**

Create `src/lib/queryHooks/platformApiKeys.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPlatformApiKey,
  fetchPlatformApiAuditEvents,
  fetchPlatformApiKeys,
  revokePlatformApiKey,
} from "@/lib/storage/platformApiKeys";

export function usePlatformApiKeys() {
  return useQuery({
    queryKey: ["platform-api-keys"],
    queryFn: fetchPlatformApiKeys,
  });
}

export function useCreatePlatformApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createPlatformApiKey(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-api-keys"] });
    },
  });
}

export function useRevokePlatformApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokePlatformApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["platform-api-audit-events"] });
    },
  });
}

export function usePlatformApiAuditEvents(apiKeyId: string | null) {
  return useQuery({
    queryKey: ["platform-api-audit-events", apiKeyId],
    queryFn: () => fetchPlatformApiAuditEvents(apiKeyId ?? ""),
    enabled: Boolean(apiKeyId),
  });
}
```

- [ ] **Step 5: Run storage test**

Run:

```bash
npm run test -- src/test/platformApiKeysStorage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit frontend data layer**

Run:

```bash
git add src/lib/storage/platformApiKeys.ts src/lib/queryHooks/platformApiKeys.ts src/test/platformApiKeysStorage.test.ts
git commit -m "feat: add platform api key frontend storage"
```

Expected: commit succeeds with only these files staged.

---

### Task 3: Settings UI

**Files:**
- Create: `src/components/settings/PlatformApiKeysCard.tsx`
- Modify: `src/pages/Instellingen.tsx`
- Create: `src/test/platformApiKeysSettings.test.tsx`

- [ ] **Step 1: Write UI tests**

Create `src/test/platformApiKeysSettings.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlatformApiKeysCard } from "@/components/settings/PlatformApiKeysCard";

const mocks = vi.hoisted(() => ({
  keys: [{
    id: "key-1",
    name: "Claude Desktop",
    keyPrefix: "bn_live_abcd",
    scopes: ["admin:*"],
    status: "active" as const,
    createdBy: "user-1",
    createdAt: "2026-08-11T10:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
    revokedBy: null,
  }],
  create: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("@/lib/storage/platformApiKeys", () => ({
  fetchPlatformApiKeys: () => Promise.resolve(mocks.keys),
  fetchPlatformApiAuditEvents: () => Promise.resolve([]),
  createPlatformApiKey: mocks.create,
  revokePlatformApiKey: mocks.revoke,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlatformApiKeysCard />
    </QueryClientProvider>,
  );
}

describe("PlatformApiKeysCard", () => {
  it("lists api key metadata without rendering hashes", async () => {
    renderCard();

    expect(await screen.findByText("Claude Desktop")).toBeInTheDocument();
    expect(screen.getByText("bn_live_abcd")).toBeInTheDocument();
    expect(screen.queryByText(/key_hash/i)).not.toBeInTheDocument();
  });

  it("creates a key and shows the plaintext value once", async () => {
    mocks.create.mockResolvedValueOnce({
      ...mocks.keys[0],
      id: "key-2",
      name: "Claude Desktop Local",
      plaintextKey: "bn_live_generated_secret",
    });
    renderCard();

    await userEvent.type(await screen.findByLabelText("Naam"), "Claude Desktop Local");
    await userEvent.click(screen.getByRole("button", { name: "API key aanmaken" }));

    expect(await screen.findByText("bn_live_generated_secret")).toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledWith("Claude Desktop Local");
  });

  it("revokes an active key", async () => {
    mocks.revoke.mockResolvedValueOnce(undefined);
    renderCard();

    await userEvent.click(await screen.findByRole("button", { name: "Intrekken Claude Desktop" }));

    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith("key-1"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/test/platformApiKeysSettings.test.tsx
```

Expected: FAIL because `PlatformApiKeysCard` does not exist.

- [ ] **Step 3: Create UI component**

Create `src/components/settings/PlatformApiKeysCard.tsx`:

```tsx
import { useState } from "react";
import { Copy, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCreatePlatformApiKey,
  usePlatformApiKeys,
  useRevokePlatformApiKey,
} from "@/lib/queryHooks/platformApiKeys";

export function PlatformApiKeysCard(): React.ReactNode {
  const { data: keys = [], isLoading } = usePlatformApiKeys();
  const createKey = useCreatePlatformApiKey();
  const revokeKey = useRevokePlatformApiKey();
  const [name, setName] = useState("");
  const [createdPlaintextKey, setCreatedPlaintextKey] = useState<string | null>(null);

  async function handleCreate(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Naam is verplicht");
      return;
    }

    try {
      const created = await createKey.mutateAsync(trimmed);
      setCreatedPlaintextKey(created.plaintextKey);
      setName("");
      toast.success("API key aangemaakt");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "API key aanmaken mislukt");
    }
  }

  async function handleCopy(): Promise<void> {
    if (!createdPlaintextKey) return;
    await navigator.clipboard.writeText(createdPlaintextKey);
    toast.success("API key gekopieerd");
  }

  async function handleRevoke(id: string): Promise<void> {
    try {
      await revokeKey.mutateAsync(id);
      toast.success("API key ingetrokken");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "API key intrekken mislukt");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-medium">Platform API keys</h2>
            <p className="text-xs text-muted-foreground">Geef externe tools gecontroleerde lees- en schrijfrechten.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          admin:*
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="platform-api-key-name" className="text-xs font-medium text-foreground">Naam</label>
        <div className="flex gap-2">
          <input
            id="platform-api-key-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Claude Desktop"
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleCreate}
            disabled={createKey.isPending || !name.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createKey.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            API key aanmaken
          </button>
        </div>
      </div>

      {createdPlaintextKey && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="mb-2 text-xs font-medium">Bewaar deze key nu. Hij wordt hierna niet opnieuw getoond.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded bg-white px-2 py-1 text-xs">{createdPlaintextKey}</code>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-xs hover:bg-amber-100"
            >
              <Copy className="h-3 w-3" />
              Kopieer
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            API keys laden...
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen API keys aangemaakt.</p>
        ) : (
          keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{key.name}</p>
                <p className="text-xs text-muted-foreground">
                  {key.keyPrefix} · {key.status === "active" ? "Actief" : "Ingetrokken"} · Laatst gebruikt: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString("nl-NL") : "nog niet"}
                </p>
              </div>
              {key.status === "active" && (
                <button
                  aria-label={`Intrekken ${key.name}`}
                  onClick={() => handleRevoke(key.id)}
                  disabled={revokeKey.isPending}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  Intrekken
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add Settings tab**

Modify `src/pages/Instellingen.tsx`:

Add import:

```ts
import { PlatformApiKeysCard } from "@/components/settings/PlatformApiKeysCard";
```

Add a new tab trigger inside `TabsList`:

```tsx
          <TabsTrigger value="api-keys">API keys</TabsTrigger>
```

Add tab content after the `koppelingen` `TabsContent`:

```tsx
        <TabsContent value="api-keys" className="mt-4">
          <PlatformApiKeysCard />
        </TabsContent>
```

- [ ] **Step 5: Run UI tests**

Run:

```bash
npm run test -- src/test/platformApiKeysSettings.test.tsx src/test/zapierSettingsCopy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Settings UI**

Run:

```bash
git add src/components/settings/PlatformApiKeysCard.tsx src/pages/Instellingen.tsx src/test/platformApiKeysSettings.test.tsx
git commit -m "feat: add platform api key settings"
```

Expected: commit succeeds with only these files staged.

---

### Task 4: Platform API Edge Function

**Files:**
- Create: `supabase/functions/platform-api/index.ts`
- Modify: `supabase/config.toml`
- Create: `src/test/platformApiFunctionSource.test.ts`

- [ ] **Step 1: Write source-level security tests**

Create `src/test/platformApiFunctionSource.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/platform-api/index.ts"), "utf8");

describe("platform-api edge function source", () => {
  it("accepts bearer and platform api key headers", () => {
    expect(source).toContain('authorization")?.replace(/^Bearer\\s+/i, "")');
    expect(source).toContain('x-platform-api-key');
  });

  it("hashes incoming keys and never compares plaintext key storage", () => {
    expect(source).toContain('crypto.subtle.digest("SHA-256"');
    expect(source).toContain(".eq(\"key_hash\", keyHash)");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY)");
  });

  it("rejects hard delete for the first release", () => {
    expect(source).toContain('body: { error: "Delete is not enabled for automations." },');
    expect(source).toContain("status: 405");
  });

  it("writes audit events", () => {
    expect(source).toContain('platform_api_audit_events');
    expect(source).toContain("success");
    expect(source).toContain("error_summary");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/test/platformApiFunctionSource.test.ts
```

Expected: FAIL because `supabase/functions/platform-api/index.ts` does not exist.

- [ ] **Step 3: Create Edge Function**

Create `supabase/functions/platform-api/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-platform-api-key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const WRITABLE_AUTOMATION_FIELDS = new Set([
  "id",
  "naam",
  "categorie",
  "doel",
  "trigger_beschrijving",
  "systemen",
  "stappen",
  "afhankelijkheden",
  "owner",
  "status",
  "verbeterideeen",
  "mermaid_diagram",
  "fasen",
  "branches",
  "endpoints",
  "webhook_paths",
  "source",
  "external_id",
  "import_source",
  "import_status",
  "pipeline_id",
  "stage_id",
  "phase",
  "team_role",
  "reviewer_overrides",
]);

type Db = ReturnType<typeof createPlatformClient>;

type ApiKeyRecord = {
  id: string;
  scopes: string[];
  status: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const db = createPlatformClient();
  let keyRecord: ApiKeyRecord | null = null;
  const url = new URL(req.url);

  try {
    keyRecord = await authorize(db, req);
    const response = await routeRequest(db, req, url, keyRecord);
    await writeAudit(db, req, url, keyRecord.id, response.auditAction, response.targetType, response.targetId, true, null);
    return jsonResponse(response.body, response.status);
  } catch (error) {
    const message = errorMessage(error);
    const status = statusFromError(message);
    await writeAudit(db, req, url, keyRecord?.id ?? null, inferAction(req, url), inferTargetType(url), inferTargetId(url), false, message);
    return jsonResponse({ error: publicErrorMessage(status, message) }, status);
  }
});

function createPlatformClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("server_misconfigured");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authorize(db: Db, req: Request): Promise<ApiKeyRecord> {
  const rawKey = req.headers.get("x-platform-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!rawKey) throw new Error("unauthorized");
  const keyHash = await sha256Hex(rawKey.trim());
  const { data, error } = await db
    .from("platform_api_keys")
    .select("id,scopes,status")
    .eq("key_hash", keyHash)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("unauthorized");
  await db.from("platform_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { id: data.id, scopes: data.scopes ?? [], status: data.status };
}

async function routeRequest(db: Db, req: Request, url: URL, keyRecord: ApiKeyRecord) {
  const parts = url.pathname.split("/").filter(Boolean);
  const platformIndex = parts.indexOf("platform-api");
  const routeParts = platformIndex >= 0 ? parts.slice(platformIndex + 1) : parts;
  const [resource, id] = routeParts;

  if (resource !== "automations") throw new Error("not_found");

  if (req.method === "GET" && !id) {
    requireScope(keyRecord, "automations:read");
    const { data, error } = await db.from("automatiseringen").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return { body: { data: data ?? [] }, status: 200, auditAction: "automations.list", targetType: "automatiseringen", targetId: null };
  }

  if (req.method === "GET" && id) {
    requireScope(keyRecord, "automations:read");
    const { data, error } = await db.from("automatiseringen").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("not_found");
    return { body: { data }, status: 200, auditAction: "automations.get", targetType: "automatiseringen", targetId: id };
  }

  if (req.method === "POST" && !id) {
    requireScope(keyRecord, "automations:write");
    const payload = allowAutomationFields(await readJson(req), true);
    const { data, error } = await db.from("automatiseringen").insert(payload).select("*").single();
    if (error) throw error;
    return { body: { data }, status: 201, auditAction: "automations.create", targetType: "automatiseringen", targetId: data.id };
  }

  if (req.method === "PATCH" && id) {
    requireScope(keyRecord, "automations:write");
    const payload = allowAutomationFields(await readJson(req), false);
    const { data, error } = await db.from("automatiseringen").update(payload).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("not_found");
    return { body: { data }, status: 200, auditAction: "automations.update", targetType: "automatiseringen", targetId: id };
  }

  if (req.method === "DELETE" && id) {
    requireScope(keyRecord, "automations:write");
    return {
      body: { error: "Delete is not enabled for automations." },
      status: 405,
      auditAction: "automations.delete.disabled",
      targetType: "automatiseringen",
      targetId: id,
    };
  }

  throw new Error("method_not_allowed");
}

function requireScope(keyRecord: ApiKeyRecord, scope: string): void {
  if (keyRecord.scopes.includes("admin:*") || keyRecord.scopes.includes(scope)) return;
  throw new Error("forbidden");
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_payload");
  return body as Record<string, unknown>;
}

function allowAutomationFields(payload: Record<string, unknown>, creating: boolean): Record<string, unknown> {
  const allowed: Record<string, unknown> = {};
  const rejected = Object.keys(payload).filter((key) => !WRITABLE_AUTOMATION_FIELDS.has(key));
  if (rejected.length > 0) throw new Error(`invalid_fields:${rejected.join(",")}`);
  for (const [key, value] of Object.entries(payload)) allowed[key] = value;
  if (creating && typeof allowed.id !== "string") throw new Error("invalid_payload:id_required");
  if (creating && typeof allowed.naam !== "string") throw new Error("invalid_payload:naam_required");
  return allowed;
}

async function writeAudit(
  db: Db,
  req: Request,
  url: URL,
  apiKeyId: string | null,
  action: string,
  targetType: string | null,
  targetId: string | null,
  success: boolean,
  errorSummary: string | null,
): Promise<void> {
  await db.from("platform_api_audit_events").insert({
    api_key_id: apiKeyId,
    action,
    target_type: targetType,
    target_id: targetId,
    success,
    error_summary: errorSummary,
    request_method: req.method,
    request_path: url.pathname,
    request_ip: req.headers.get("x-forwarded-for"),
    user_agent: req.headers.get("user-agent"),
    metadata: {},
  });
}

function inferAction(req: Request, url: URL): string {
  const target = inferTargetId(url);
  if (req.method === "GET" && target) return "automations.get";
  if (req.method === "GET") return "automations.list";
  if (req.method === "POST") return "automations.create";
  if (req.method === "PATCH") return "automations.update";
  if (req.method === "DELETE") return "automations.delete";
  return "unknown";
}

function inferTargetType(url: URL): string | null {
  return url.pathname.includes("automations") ? "automatiseringen" : null;
}

function inferTargetId(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const index = parts.indexOf("automations");
  return index >= 0 ? parts[index + 1] ?? null : null;
}

function statusFromError(message: string): number {
  if (message === "unauthorized") return 401;
  if (message === "forbidden") return 403;
  if (message === "not_found") return 404;
  if (message === "method_not_allowed") return 405;
  if (message.startsWith("invalid_payload") || message.startsWith("invalid_fields")) return 400;
  return 500;
}

function publicErrorMessage(status: number, message: string): string {
  if (status === 401) return "Unauthorized";
  if (status === 403) return "Forbidden";
  if (status === 404) return "Not found";
  if (status === 405) return "Method not allowed";
  if (status === 400) return message;
  return "Internal server error";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "unknown_error");
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 4: Configure function without JWT verification**

Modify `supabase/config.toml` by adding:

```toml
[functions.platform-api]
verify_jwt = false
```

- [ ] **Step 5: Run source test**

Run:

```bash
npm run test -- src/test/platformApiFunctionSource.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Edge Function**

Run:

```bash
git add supabase/functions/platform-api/index.ts supabase/config.toml src/test/platformApiFunctionSource.test.ts
git commit -m "feat: add platform api edge function"
```

Expected: commit succeeds with only these files staged.

---

### Task 5: Claude Desktop MCP Bridge

**Files:**
- Create: `mcp/claude-desktop/package.json`
- Create: `mcp/claude-desktop/tsconfig.json`
- Create: `mcp/claude-desktop/src/server.ts`
- Create: `mcp/claude-desktop/README.md`

- [ ] **Step 1: Create MCP package metadata**

Create `mcp/claude-desktop/package.json`:

```json
{
  "name": "automation-navigator-claude-desktop-mcp",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.17.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "@types/node": "^22.16.5"
  }
}
```

Create `mcp/claude-desktop/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Create MCP server**

Create `mcp/claude-desktop/src/server.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const apiBaseUrl = process.env.AUTOMATION_NAVIGATOR_API_URL;
const apiKey = process.env.AUTOMATION_NAVIGATOR_API_KEY;

if (!apiBaseUrl || !apiKey) {
  throw new Error("Set AUTOMATION_NAVIGATOR_API_URL and AUTOMATION_NAVIGATOR_API_KEY before starting this MCP server.");
}

const server = new McpServer({
  name: "automation-navigator",
  version: "0.1.0",
});

server.tool("list_automations", {}, async () => {
  return textResult(await platformRequest("GET", "/automations"));
});

server.tool("get_automation", {
  id: z.string().min(1),
}, async ({ id }) => {
  return textResult(await platformRequest("GET", `/automations/${encodeURIComponent(id)}`));
});

server.tool("create_automation", {
  automation: z.record(z.unknown()),
}, async ({ automation }) => {
  return textResult(await platformRequest("POST", "/automations", automation));
});

server.tool("update_automation", {
  id: z.string().min(1),
  updates: z.record(z.unknown()),
}, async ({ id, updates }) => {
  return textResult(await platformRequest("PATCH", `/automations/${encodeURIComponent(id)}`, updates));
});

server.tool("delete_automation", {
  id: z.string().min(1),
}, async ({ id }) => {
  return textResult(await platformRequest("DELETE", `/automations/${encodeURIComponent(id)}`));
});

async function platformRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl!.replace(/\/$/, "")}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok) {
    return { ok: false, status: response.status, payload };
  }
  return { ok: true, status: response.status, payload };
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 3: Create Claude Desktop setup docs**

Create `mcp/claude-desktop/README.md`:

```md
# Claude Desktop MCP Bridge

This local MCP server lets Claude Desktop read and edit Automation Navigator through the `platform-api` Edge Function.

## Build

```bash
cd mcp/claude-desktop
npm install
npm run build
```

## Environment

Set these environment variables in the Claude Desktop MCP server configuration:

```bash
AUTOMATION_NAVIGATOR_API_URL=https://<project-ref>.functions.supabase.co/platform-api
AUTOMATION_NAVIGATOR_API_KEY=bn_live_<generated_key>
```

Use an API key created in the platform Settings page. Do not use the Supabase service role key.

## Tools

- `list_automations`
- `get_automation`
- `create_automation`
- `update_automation`
- `delete_automation`

The first release of the platform API returns `405` for `delete_automation` until a safe deletion model is enabled.
```

- [ ] **Step 4: Build MCP bridge**

Run:

```bash
cd mcp/claude-desktop
npm install
npm run build
```

Expected: `tsc` exits successfully and `mcp/claude-desktop/dist/server.js` is generated.

- [ ] **Step 5: Commit MCP bridge**

Run:

```bash
git add mcp/claude-desktop/package.json mcp/claude-desktop/package-lock.json mcp/claude-desktop/tsconfig.json mcp/claude-desktop/src/server.ts mcp/claude-desktop/README.md
git commit -m "feat: add claude desktop mcp bridge"
```

Expected: commit succeeds with only MCP bridge files staged.

---

### Task 6: Final Verification And Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-08-11-platform-api-keys-design.md`

- [ ] **Step 1: Add implementation notes to the approved spec**

Append this section to `docs/superpowers/specs/2026-08-11-platform-api-keys-design.md`:

```md
## Implementation Notes

- First release exposes `DELETE /automations/:id` as a disabled route returning `405`.
- Claude Desktop access is implemented through `mcp/claude-desktop`.
- API keys are generated client-side and stored server-side as SHA-256 hashes through `create_platform_api_key`.
```

- [ ] **Step 2: Run focused test suite**

Run:

```bash
npm run test -- src/test/platformApiKeysStorage.test.ts src/test/platformApiKeysSettings.test.tsx src/test/platformApiFunctionSource.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run project quality checks**

Run:

```bash
npm run test
npm run build
```

Expected: both commands complete successfully.

- [ ] **Step 4: Commit documentation note**

Run:

```bash
git add docs/superpowers/specs/2026-08-11-platform-api-keys-design.md
git commit -m "docs: note platform api key implementation details"
```

Expected: commit succeeds with only the spec file staged.

---

## Self-Review

Spec coverage:

- Hashed, revocable API keys: Task 1 and Task 2.
- Audited external requests: Task 1 and Task 4.
- Edge Function with service role boundary: Task 4.
- Settings UI create/list/revoke/show-once: Task 2 and Task 3.
- Claude Desktop through MCP bridge: Task 5.
- `gitlabtest` excluded: no task touches `gitlabtest`.

Known scoped decision:

- Hard deletion is disabled in Task 4 with a `405` response because the current `automatiseringen` schema does not show a clear soft-delete column.

Verification commands:

- Focused Vitest runs are included per implementation slice.
- Full `npm run test` and `npm run build` are included in final verification.
