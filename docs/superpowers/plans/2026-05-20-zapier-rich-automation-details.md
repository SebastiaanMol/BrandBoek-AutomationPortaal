# Zapier Rich Automation Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make imported Zapier automations show what they actually do: trigger, lookups, filters/branches, emails, and true webhook handoffs.

**Architecture:** Enrich the Zapier JSON mapper so raw Zapier nodes become safe, readable process summaries stored in `import_proposal`. Surface those summaries in a dedicated Zapier detail card, while keeping technical endpoint evidence separate from user-facing copy.

**Tech Stack:** Supabase Edge shared TypeScript, React/Vite, Vitest, Playwright live checks.

---

### Task 1: Enrich Zapier Mapping

**Files:**
- Modify: `supabase/functions/_shared/zapier-readonly.ts`
- Test: `src/test/zapierJsonExportMapping.test.ts`

- [ ] Add failing tests for HubSpot-triggered email Zaps and Trustoo webhook Zaps.
- [ ] Parse Zapier nodes into readable trigger, data lookup, condition, email, formatter/delay, and webhook step summaries.
- [ ] Store the richer summary under `import_proposal.zap.process`.
- [ ] Ensure only true Webhooks by Zapier POST actions populate `webhook_paths`.

### Task 2: Show Zapier Details In The Portal

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/storage/automations.ts`
- Create: `src/components/flows/ZapierProcessCard.tsx`
- Modify: `src/pages/AutomationDetailPage.tsx`

- [ ] Expose `importProposal` on `Automatisering`.
- [ ] Render a Zapier-only process card with trigger, steps, conditions, outputs, and technical trace.
- [ ] Keep the existing generic detail panel unchanged for non-Zapier automations.

### Task 3: Verify And Re-import

**Files:**
- Edge deploy: `supabase/functions/zapier-sync`
- Data source: `C:/Users/SebastiaanMol/Desktop/zapfile.json`

- [ ] Run focused Zapier tests.
- [ ] Run full test/build/lint verification.
- [ ] Deploy `zapier-sync`.
- [ ] Re-import the JSON export.
- [ ] Live-check at least one Trustoo Zap and one “Geen gehoor” mail Zap.
