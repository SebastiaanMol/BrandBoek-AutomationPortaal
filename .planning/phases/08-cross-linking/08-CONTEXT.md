# Phase 8: Cross-Linking — Context

**Phase:** 08-cross-linking
**Goal:** The automation detail panel is fully wired — every related entity (process canvas, systems, owner, related automations) is one click away.
**Status:** Planning

---

## Scope

This phase makes four targeted changes to `AutomationDetailPanel.tsx`. No new pages. No new routes. No new dependencies. The Systems and Owners pages built in Phase 7 already accept URL params (`?system=X`, `?owner=X`) and the All Automations page already accepts `?open=ID` — this phase simply adds `<Link>` elements in the detail panel that target those existing URLs.

### What changes

| Req | Change | File |
|-----|--------|------|
| LINK-01 | Add "View on canvas" link pointing to `/processen` | AutomationDetailPanel.tsx |
| LINK-02 | System badges in the Systemen section become clickable `<Link>` wrappers pointing to `/systems?system=X` | AutomationDetailPanel.tsx |
| LINK-03 | Owner text in the Beheer section becomes a `<Link>` pointing to `/owners?owner=X` | AutomationDetailPanel.tsx |
| LINK-04 | New "Related" section derived from `useAutomatiseringen()` — same fase OR shared system, self excluded, capped at 5 | AutomationDetailPanel.tsx |

### What does NOT change

- Systems.tsx, Owners.tsx, AlleAutomatiseringen.tsx — already wired, used as targets only
- No new Supabase queries — `useAutomatiseringen()` is React Query cached (same data Processen.tsx already holds)
- No new npm packages
- No new routes

---

## Decisions Carried In (from STATE.md)

- Must use `useAutomatiseringen()` hook for LINK-04 — no new queries
- `useSearchParams` already drives selected state in Systems/Owners pages — `encodeURIComponent` on write, `searchParams.get()` decodes on read
- Use `it.todo` stubs for Wave 0 DOM-level tests (same pattern as Phase 04 and Phase 07)
- LINK-01: plain `<Link to="/processen">` — no query param needed (automation is visible by definition)
- Related automations capped at 5 to avoid unbounded list
- Navigate related automations to `/alle?open={id}` (AlleAutomatiseringen.tsx already reads `?open` param)

---

## Files Touched

```
src/components/process/AutomationDetailPanel.tsx   ← primary change file
src/test/crossLinking.test.ts                       ← new test file (Wave 0)
```

---

## Wave Structure

| Wave | Plan | Content | Autonomous |
|------|------|---------|------------|
| 0 | 08-01 | Test scaffold (crossLinking.test.ts) | yes |
| 1 | 08-02 | Implement LINK-01 through LINK-04 in AutomationDetailPanel.tsx + make tests green | yes |
| 2 | 08-03 | Human smoke test of all four links | no |
