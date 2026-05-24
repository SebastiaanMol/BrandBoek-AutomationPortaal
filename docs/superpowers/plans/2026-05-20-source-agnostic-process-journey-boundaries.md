# Source-Agnostic Process Journey Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make process journeys start at the first proven process automation and end at the last proven process outcome, independent of whether the automation source is Zapier, HubSpot, GitLab, or another system.

**Architecture:** Add a lightweight boundary normalization step inside the runtime-chain builder. It orders automations by proven handoffs before rendering, derives the start signal from the actual first automation, and only renders HubSpot outcome steps when a HubSpot outcome is proven. For non-HubSpot terminal outcomes, the chain shows a generic end result and keeps follow-up checks separate.

**Tech Stack:** React, TypeScript, Vitest, existing automation metadata and runtime-chain rendering.

---

### Task 1: Prove Boundary Ordering

**Files:**
- Modify: `src/test/flowRuntimeChain.test.ts`
- Modify: `src/lib/flowRuntimeChain.ts`

- [ ] Add a failing test where the input order is GitLab then Zapier, but the proven webhook match means Zapier is the actual first process automation.
- [ ] Implement a runtime-order helper that builds source-target handoffs from webhook paths and GitLab endpoints.
- [ ] Use the helper at the start of `buildFlowRuntimeChain` before deriving the signal or rendering steps.
- [ ] Re-run `npx vitest run src/test/flowRuntimeChain.test.ts` and confirm the new ordering test passes.

### Task 2: Prove Direct Backend Starts

**Files:**
- Modify: `src/test/flowRuntimeChain.test.ts`
- Modify: `src/lib/flowRuntimeChain.ts`
- Modify if needed: `src/components/flows/FlowRuntimeChain.tsx`
- Modify if needed: `src/pages/FlowSuggestionDetail.tsx`

- [ ] Add a failing test for a GitLab-only process journey with no upstream Zapier/HubSpot automation.
- [ ] Make the start signal describe a direct backend/API/webhook start instead of calling it a HubSpot workflow.
- [ ] Ensure the GitLab block has no fake previous automation text.
- [ ] Re-run the focused test and confirm the direct backend start reads correctly.

### Task 3: Prove Terminal Outcomes

**Files:**
- Modify: `src/test/flowRuntimeChain.test.ts`
- Modify: `src/lib/flowRuntimeChain.ts`
- Modify: `src/components/flows/FlowRuntimeChain.tsx`
- Modify: `src/pages/FlowSuggestionDetail.tsx`

- [ ] Add a failing test for a backend process with no proven HubSpot write, such as a WeFact/debiteur backend automation.
- [ ] Stop rendering `return_to_hubspot`, `state_write` as HubSpot, and `emitted_signal` when no HubSpot write or HubSpot record creation is proven.
- [ ] Render one terminal outcome step that says what the backend outcome is, such as WeFact debiteur bijgewerkt or backendverwerking afgerond.
- [ ] Keep `downstream` as a separate follow-up control, not as a numbered process step.
- [ ] Re-run focused tests, then `npm test`, `npm run build`, and `npm run lint`.

### Task 4: Live Verification

**Files:**
- No code changes expected.

- [ ] Open a Zapier-linked process journey in the browser.
- [ ] Confirm the visual order follows the proven trigger-to-backend path, even if data order is not the same as process order.
- [ ] Confirm a direct backend journey does not claim HubSpot or Zapier as start source unless proven.
- [ ] Confirm the last numbered step is the last proven process outcome, while follow-up remains in `Vervolgcontrole`.
