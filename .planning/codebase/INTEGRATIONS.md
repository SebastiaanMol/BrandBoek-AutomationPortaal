# External Integrations

**Analysis Date:** 2026-03-30

## APIs & External Services

**Workflow Automation Platforms:**
- **HubSpot** - Import workflows via private app tokens
  - SDK: @supabase/supabase-js (invokes Edge Function)
  - Auth: Bearer token (private app) stored in `integrations` table
  - Edge Function: `supabase/functions/hubspot-sync/index.ts`
  - Endpoint: `https://api.hubapi.com/automation/v3/workflows`
  - Capabilities: Fetch enabled/disabled workflows, extract trigger info, sync status

- **Zapier** - Import zaps (automations) via API key
  - SDK: @supabase/supabase-js (invokes Edge Function)
  - Auth: X-API-Key header with API key stored in `integrations` table
  - Edge Function: `supabase/functions/zapier-sync/index.ts`
  - Endpoint: `https://api.zapier.com/v1/zaps`
  - Capabilities: Fetch zaps, extract app names, sync enabled/disabled status

- **Typeform** - Import forms via bearer token
  - SDK: @supabase/supabase-js (invokes Edge Function)
  - Auth: Bearer token stored in `integrations` table
  - Edge Function: `supabase/functions/typeform-sync/index.ts`
  - Endpoint: `https://api.typeform.com/forms?page_size=200`
  - Capabilities: Fetch forms, extract titles and metadata

## Proxy Configuration

**Development Server Proxies (vite.config.ts):**
- `/hubspot-api` → `https://api.hubapi.com` (changeOrigin: true)
- `/zapier-api` → `https://api.zapier.com` (changeOrigin: true)
- `/typeform-api` → `https://api.typeform.com` (changeOrigin: true)

Note: These proxies are configured but integrations use server-side Edge Functions for actual API calls to avoid CORS issues.

## Data Storage

**Database:**
- Provider: Supabase (PostgreSQL)
- Connection: Client-side via `@supabase/supabase-js`
- Client: `src/integrations/supabase/client.ts`
- Auth Mode: Session-based with localStorage persistence and auto token refresh
- Schema Files: `src/integrations/supabase/types.ts` (auto-generated from Supabase)

**Key Tables:**
- `automatiseringen` - Main automation records (id, naam, categorie, status, mermaid_diagram, etc.)
  - Columns: `external_id` (sync key), `source` (hubspot/zapier/typeform), `last_synced_at`
- `koppelingen` - Relationships between automations (bron_id → doel_id)
- `integrations` - User API tokens and sync status
  - Columns: `user_id`, `type`, `token`, `status`, `error_message`, `last_synced_at`
- `auth.users` - Supabase authentication users

**RLS Policies:**
- All authenticated users can read/write `automatiseringen` and `koppelingen`
- Users can only access their own `integrations` records

## Authentication & Identity

**Auth Provider:** Supabase Auth
- Implementation: Email/password authentication (implied by auth setup)
- Session Management: `src/lib/AuthContext.tsx` provides React context
- Storage: localStorage with auto-refresh enabled
- User info accessible via: `supabase.auth.getUser()` and `supabase.auth.onAuthStateChange()`
- Client: `src/integrations/supabase/client.ts`

## Monitoring & Observability

**Error Tracking:**
- None detected - errors are handled locally and reported to user via toast notifications

**Logs:**
- Console logging in Edge Functions (Deno `console.error()`)
- Integration error messages stored in `integrations.error_message` field
- Toast notifications (sonner) display errors to users

## CI/CD & Deployment

**Hosting:**
- Not detected - client-side SPA for deployment to static hosting

**CI Pipeline:**
- Not detected - no GitHub Actions or similar configured

**Supabase Deployment:**
- Edge Functions deployed via Supabase CLI
- Database migrations versioned in `supabase/migrations/` directory

## Environment Configuration

**Required env vars:**
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon key

**For Edge Functions (server-side only):**
- `SUPABASE_URL` - Supabase project URL (auto-injected)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (auto-injected)

**Secrets location:**
- Client env: `.env` file (source-controlled with public key only)
- Edge Function secrets: Supabase dashboard environment variables
- Integration tokens: Stored encrypted in `integrations.token` (Supabase handles encryption)

## API Token Management

**Storage Flow:**
1. User enters token in Settings page (`src/pages/Instellingen.tsx`)
2. Token saved via `saveIntegration()` → Supabase `integrations` table
3. Edge Functions retrieve token from DB using service role
4. Token used to call external APIs (HubSpot, Zapier, Typeform)

**Token Fields:**
- `integrations.type` - "hubspot" | "zapier" | "typeform"
- `integrations.token` - OAuth/API token string
- `integrations.status` - "connected" | "error"
- `integrations.error_message` - Error details from last failed sync

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- Manual sync triggers via UI buttons in Settings page
- Sync invokes Edge Functions which call external APIs
- No automatic webhooks configured

## Sync Architecture

**Sync Flow:**

1. User clicks "Synchronize" button in `src/pages/Instellingen.tsx`
2. React Query mutation calls `triggerHubSpotSync()` / `triggerZapierSync()` / `triggerTypeformSync()` in `src/lib/supabaseStorage.ts`
3. Function invokes Supabase Edge Function via `supabase.functions.invoke()`
4. Edge Function (Deno runtime):
   - Retrieves integration token from DB (service role access)
   - Calls external API (HubSpot/Zapier/Typeform)
   - Compares with existing `automatiseringen` records (external_id matching)
   - Updates or inserts new records
   - Marks old records as "Uitgeschakeld" if no longer present in external system
   - Updates `integrations.last_synced_at` and `integrations.status`

**Sync Data Mapping:**

| External System | Source ID | Name Field | Status Field | Extracted |
|---|---|---|---|---|
| HubSpot | `wf.id` | `wf.name` | `wf.enabled` → "Actief"/"Uitgeschakeld" | Trigger type, Actions |
| Zapier | `zap.id` | `zap.title` | `zap.is_enabled` → "Actief"/"Uitgeschakeld" | Steps, App names |
| Typeform | `form.id` | `form.title` | Always "Actief" | "Typeform submission" |

## Data Fetching Strategy

**Client-side Data Loading:**
- `src/lib/hooks.ts` provides React Query hooks for all CRUD operations
- Query keys: `["automatiseringen"]`, `["integration", type]`, `["nextAutoId"]`
- Invalidation on mutation success (automatic refetch)
- Network state handled by React Query

**Edge Functions:**
- Deno HTTP server (https://deno.land/std@0.168.0/http/server.ts)
- CORS headers configured for all responses
- Error responses include descriptive messages in Dutch

---

*Integration audit: 2026-03-30*
