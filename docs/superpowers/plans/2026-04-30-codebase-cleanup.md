# Codebase cleanup

## Scope

This cleanup applies to the `automation-navigator` project itself.

`gitlabtest/` is kept as imported reference material from a separate project. It helps explain how the automations work, but it is not part of this app's lint, TypeScript, or test surface.

## Steps

- [x] Step 1: Narrow ESLint scope so reference folders and local worktrees do not pollute lint output.
- [x] Step 2: Refresh or repair Supabase generated types.
- [x] Step 3: Fix remaining TypeScript errors in app code.
- [x] Step 4: Review Supabase function auth settings.
- [ ] Step 5: Normalize encoding/documentation issues.

## Step 1 Notes

Updated `eslint.config.js` to ignore:

- `dist`
- `node_modules`
- `.claude`
- `.worktrees`
- `gitlabtest`
- `docs/superpowers/flow`

This should make `npm run lint` report only issues in the active navigator codebase and Supabase functions.

Verification:

- Before scope cleanup: `npm run lint` reported 1301 problems because it scanned local worktrees and imported reference code.
- After scope cleanup: `npm run lint` reports 80 problems in the active project surface.

## Step 2 Notes

`src/integrations/supabase/types.ts` now includes the newer app tables and columns used by the navigator, including:

- `automatisering_ai_flows`
- `automation_links`
- `flows`
- `pipelines`
- `portal_settings`
- `process_state.active_lanes`
- `process_state.custom_lanes`

`src/lib/supabaseStorage.ts` now uses the typed Supabase client for `process_state` instead of the previous temporary `any` client cast.

## Step 3 Notes

Resolved blocking lint/type cleanup items without broad app rewrites:

- Kept `@typescript-eslint/no-explicit-any` non-blocking because the project TypeScript config already has `strict: false` and existing Edge Function integration code intentionally uses flexible payloads.
- Replaced empty shadcn interface declarations with type aliases.
- Swapped Tailwind's CommonJS plugin import for an ESM import.
- Fixed the CSV step splitter and `const` usage in `AIUpload`.
- Stabilized the fallback data reference in `Analyse` so memo hooks do not re-run because of a freshly created `[]`.

Verification:

- `npm run lint` exits with 0 errors and 9 warnings, all existing Fast Refresh export-shape warnings.
- `npm run build` succeeds when run outside the sandbox. The sandboxed run failed with Windows `spawn EPERM`.

## Step 4 Notes

Reviewed `supabase/config.toml` function auth settings:

- Webhook/sync entrypoints that should be protected are JWT-gated: `hubspot-sync`, `zapier-sync`, `typeform-sync`, and `hubspot-pipelines`.
- Public AI/read endpoints remain unauthenticated as currently configured: `extract-automation`, `brandy-ask`, `brandy-feedback`, `brandy-analyse`, and `enrich-automation`.
- `gitlab-sync` is currently `verify_jwt = false`; keep this only if it is protected by a separate secret or external trigger policy.

## Step 5 Notes

Not completed yet. Several older source files still contain mojibake in comments and UI copy. This should be handled as a separate focused pass to avoid accidentally changing user-facing Dutch text incorrectly.
