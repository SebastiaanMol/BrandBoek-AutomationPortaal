# Platform API Keys Design

## Status

Approved direction: build scoped admin API keys for the Supabase platform, excluding `gitlabtest`.

## Goal

Allow external systems to read and edit platform data through a controlled API key interface. The first known external consumer is Claude Desktop, reached through a small MCP bridge that can call platform tools such as listing, reading, creating, and updating automations.

The API key system must provide full-control capability while keeping access revocable, auditable, and separate from the Supabase service role key.

## Non-Goals

- Do not modify or depend on `gitlabtest`.
- Do not expose the Supabase service role key to external callers.
- Do not give external systems direct database access.
- Do not build broad OAuth or marketplace-style app authorization in this phase.

## Recommended Approach

Create a Supabase-native external API layer:

1. Store API key metadata and key hashes in Supabase.
2. Add a privileged Supabase Edge Function that validates external API keys.
3. Route approved read/edit operations through that function using the service role internally.
4. Add platform UI controls for creating, viewing metadata for, and revoking API keys.
5. Provide a Claude Desktop MCP bridge as a supported consumer pattern.

## Data Model

### `platform_api_keys`

Stores API key metadata. Plaintext keys are never stored.

Fields:

- `id uuid primary key`
- `name text not null`
- `key_prefix text not null`
- `key_hash text not null unique`
- `scopes text[] not null default array['admin:*']`
- `status text not null default 'active'`
- `created_by uuid references auth.users(id) on delete set null`
- `created_at timestamptz not null default now()`
- `last_used_at timestamptz`
- `revoked_at timestamptz`
- `revoked_by uuid references auth.users(id) on delete set null`

Constraints:

- `status` is one of `active`, `revoked`.
- `key_hash` stores a SHA-256 hash of the full generated key.
- `key_prefix` stores only a short display prefix such as `bn_live_abcd`.

Access:

- Authenticated platform users can list metadata.
- Only authenticated platform users can create or revoke keys through controlled functions or RPCs.
- No client can read `key_hash` directly.

### `platform_api_audit_events`

Stores activity for external API calls.

Fields:

- `id uuid primary key`
- `api_key_id uuid references platform_api_keys(id) on delete set null`
- `action text not null`
- `target_type text`
- `target_id text`
- `success boolean not null`
- `error_summary text`
- `request_method text`
- `request_path text`
- `created_at timestamptz not null default now()`

Optional fields if useful during implementation:

- `request_ip text`
- `user_agent text`
- `metadata jsonb`

Access:

- Authenticated platform users can read audit events.
- Inserts are performed by Edge Functions with service role access.

## Key Format

Generated keys should be long random secrets with a recognizable prefix:

```text
bn_live_<random_secret>
```

The UI shows the key once immediately after creation. After that, only the name, prefix, status, created date, and last-used timestamp are visible.

## Edge Function

Add `supabase/functions/platform-api`.

Authentication:

- Accept `Authorization: Bearer <api_key>`.
- Optionally also accept `X-Platform-API-Key: <api_key>` for tools that cannot send bearer headers.
- Hash the provided key and compare with active key hashes.
- Reject missing, invalid, or revoked keys with `401`.
- Update `last_used_at` after successful validation.

Authorization:

- Initial full-control scope is `admin:*`.
- Keep scope checks in the implementation even if all first keys use `admin:*`.
- Later scopes can include `automations:read`, `automations:write`, `settings:read`, `settings:write`, and `imports:write`.

Audit:

- Write one audit event for every request.
- Include whether the request succeeded.
- Avoid storing secrets, raw request bodies with credentials, or full API keys in audit metadata.

## Initial API Surface

Start with automations because they are the clearest read/edit platform entity.

Routes inside the Edge Function:

- `GET /automations`
- `GET /automations/:id`
- `POST /automations`
- `PATCH /automations/:id`
- `DELETE /automations/:id`

Delete behavior should follow the existing platform data model. If the current tables do not have a safe soft-delete/status pattern, prefer not to expose hard delete in the first implementation and return `405` until a safe deletion model is defined.

Request and response bodies should use the existing Supabase table shape where practical, with explicit allowlists for writable fields. The function should reject unknown writable fields rather than passing arbitrary payloads through to the database.

## Settings UI

Add an API key management section under Settings.

Capabilities:

- List existing keys by name, prefix, status, created date, and last-used date.
- Create a new full-control key.
- Show the generated key once with a copy action.
- Revoke an active key.
- Display recent audit events for a selected key if that fits the existing Settings layout.

The UI must never display `key_hash`.

## Claude Desktop Integration

Claude Desktop should not receive the Supabase service role key. Instead, use a small local MCP bridge.

The MCP bridge:

- Stores the generated platform API key locally, outside the repository.
- Exposes Claude Desktop tools such as:
  - `list_automations`
  - `get_automation`
  - `create_automation`
  - `update_automation`
  - `delete_automation` if deletion is enabled
- Calls the `platform-api` Edge Function with the API key.
- Returns structured results to Claude Desktop.

This keeps Claude Desktop access visible in the platform audit log and allows the platform key to be revoked without changing Supabase credentials.

## Error Handling

- Missing key: `401` with a generic unauthorized message.
- Invalid or revoked key: `401` with the same generic message.
- Valid key without required scope: `403`.
- Invalid payload: `400` with field-level details where useful.
- Missing entity: `404`.
- Unsupported route or method: `404` or `405`.
- Unexpected failure: `500`, with details logged server-side but not leaked to the caller.

## Security Notes

- Store only hashes of API keys.
- Use long random keys generated by Web Crypto.
- Never log full keys.
- Redact authorization headers from logs and audit metadata.
- Keep all privileged database access inside the Edge Function.
- Use explicit writable-field allowlists.
- Record audit events for successful and failed attempts.

## Testing

Database and type generation:

- Verify migrations apply cleanly.
- Regenerate Supabase types if the project workflow requires it.

Edge Function:

- Valid key can read automations.
- Valid key can edit an allowed automation field.
- Invalid key is rejected.
- Revoked key is rejected.
- Missing scope is rejected.
- Audit event is written for success and failure.
- Unknown writable fields are rejected.

Frontend:

- Settings page lists API keys.
- Creating a key shows the plaintext value once.
- Revoking a key updates the list state.
- The UI does not expose `key_hash`.

MCP bridge:

- Can call `list_automations`.
- Can call `get_automation`.
- Can call `update_automation`.
- Handles unauthorized responses clearly.

## Open Implementation Decisions

- Confirm the canonical automation table and writable field allowlist before implementation.
- Decide whether deletion is soft-delete, hard-delete, or omitted in the first API release.
- Decide whether the MCP bridge lives inside this repository under a dedicated folder or as separate local setup documentation.
