# Codebase Concerns

## Tech Debt

### Missing Error Handling
- `src/lib/AuthContext.tsx` — auth errors not surfaced to user
- `src/pages/AIUpload.tsx` — brittle CSV/JSON parsing with no fallback
- Dual persistence layer (localStorage via `storage.ts` + Supabase via `supabaseStorage.ts`) — maintenance burden, risk of data divergence

### Legacy / Dead Code
- `src/pages/NieuweAutomatisering.tsx` — legacy page, superseded by `src/pages/NieuweAutomatiseringPage.tsx`. Kept but not routed.
- `src/pages/AIUpload.tsx` — no backend, not routed yet
- `src/components/KennisGraaf3D.tsx` — not in sidebar nav

### Unimplemented Stubs
- Integration sync endpoints not implemented
- AI upload has no backend logic

---

## Security Issues

- **Open CORS** on AI extraction edge function — no origin restriction
- **Plaintext token storage** in integrations table — integration credentials stored unencrypted
- **No input validation** on automation data before Supabase writes
- **Hardcoded API endpoints** visible in `vite.config.ts`

---

## Performance Bottlenecks

- `src/pages/KennisGraaf.tsx` / `KennisGraaf3D.tsx` — large graph rendering (~1625 lines), no virtualization or lazy loading for large node sets
- N+1 queries for koppelingen (links) in `src/lib/supabaseStorage.ts`
- AI batch processing without rate limiting
- Synchronous `JSON.stringify()` in export flows — blocks UI on large datasets

---

## Fragile Areas

- **Graph problem detection** — heuristic rules in domain graph logic are undocumented; changes are easy to break silently
- **Auto-generated Mermaid diagrams** — no validation; malformed output not caught
- **AI extraction schema** — must stay manually in sync with `src/types.ts`; drift causes silent data loss
- **BPMN viewer** — recently added, minimal test coverage

---

## Test Gaps (Critical)

- No tests for AI integration flows ⚠️ high priority
- No tests for graph analysis functions ⚠️ high priority
- No tests for authentication ⚠️ critical
- No tests for Supabase database operations ⚠️ critical
- No E2E tests despite Playwright config being present
- `src/lib/storage.ts` (seed data) has minimal coverage

---

## Missing Features (Future Risk)

- No audit logging for automation changes
- No bulk operations support
- No offline support
- No collaborative editing
- No role-based access control (single-user assumed throughout)

---

## Notes

- `.env` contains Supabase credentials — must not be committed (already in `.gitignore`)
- `bun.lock` and `package-lock.json` both present — only npm is used, bun.lock is stale

---
*Mapped: 2026-03-30*
