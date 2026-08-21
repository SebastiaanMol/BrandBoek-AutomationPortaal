# Manual Process View Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the automatic Proces Cockpit status text with a manually managed process-view status stored on `process_state`.

**Architecture:** Add a typed `manual_status` field to process-state storage and expose a focused update helper. Process Cockpit reads the status from `processStates`, filters by it, and writes changes through a TanStack mutation that invalidates process-state queries.

**Tech Stack:** React, TypeScript, Supabase, TanStack Query, Tailwind/shadcn UI, Vitest, Testing Library.

---

### Task 1: Storage And Migration

**Files:**
- Create: `supabase/migrations/20260701170000_process_state_manual_status.sql`
- Modify: `src/lib/storage/processState.ts`
- Modify: `src/lib/queryHooks/processState.ts`
- Test: `src/test/processStateStorage.test.ts`

- [ ] **Step 1: Write failing storage tests**

Add tests that expect `manualStatus` to be mapped from `manual_status`, default to `niet_ingericht`, and update through `updateProcessManualStatus`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/processStateStorage.test.ts`

Expected: FAIL because `manualStatus` and `updateProcessManualStatus` do not exist yet.

- [ ] **Step 3: Implement storage**

Add typed statuses, select/upsert `manual_status`, fallback default, and an update helper that upserts minimal empty process-state data when a row does not exist.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/test/processStateStorage.test.ts`

Expected: PASS.

### Task 2: Cockpit Model/UI

**Files:**
- Modify: `src/lib/processCockpit.ts`
- Modify: `src/pages/Procesviewer.tsx`
- Test: `src/test/procesviewerCockpit.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Add tests that expect the cockpit to show the four manual statuses, filter on them, and call the update mutation when a status dropdown changes.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/procesviewerCockpit.test.tsx`

Expected: FAIL because the cockpit still renders automatic `Op orde`/`Aandacht` status.

- [ ] **Step 3: Implement model/UI**

Add `manualStatus` to cockpit rows. Replace `StatusPill` with an editable status select/badge. Update the status filter options to the four manual statuses.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/test/procesviewerCockpit.test.tsx`

Expected: PASS.

### Task 3: Verification

**Files:**
- Test: `src/test/processStateStorage.test.ts`
- Test: `src/test/procesviewerCockpit.test.tsx`

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/test/processStateStorage.test.ts src/test/procesviewerCockpit.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: PASS.

## Self-Review

- Spec coverage: storage, default behavior, cockpit replacement, dropdown editing, filtering, and query invalidation are covered.
- Placeholder scan: no implementation placeholders remain.
- Type consistency: stored key is `manual_status`, frontend key is `manualStatus`, allowed values are the four specified statuses.
