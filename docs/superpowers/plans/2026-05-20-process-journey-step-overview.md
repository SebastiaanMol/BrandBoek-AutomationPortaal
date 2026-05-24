# Process Journey Step Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show process journeys as a clear step-by-step chain, with start signal and follow-up control rendered separately.

**Architecture:** Extend the runtime-chain model with Zapier process substeps and explicit transition text between visible steps. Keep evidence and technical endpoint details inside `Logica`, while the main chain reads as business-process steps.

**Tech Stack:** React, TypeScript, Vitest, existing Supabase-backed automation data.

---

### Task 1: Runtime Chain Model

**Files:**
- Modify: `src/lib/flowRuntimeChain.ts`
- Test: `src/test/flowRuntimeChain.test.ts`

- [ ] Add a failing test proving a Zapier automation with rich `importProposal.zap.process.steps` becomes multiple process steps.
- [ ] Add `zapier_step` to `FlowRuntimeStepType`.
- [ ] Add optional `transitionFromPrevious` metadata to runtime steps.
- [ ] Build Zapier substeps from the imported Zapier process summary.
- [ ] Attach webhook-match transition text when a Zapier step leads into a GitLab backend block.

### Task 2: Runtime Chain UI

**Files:**
- Modify: `src/components/flows/FlowRuntimeChain.tsx`
- Modify: `src/pages/FlowDetail.tsx`

- [ ] Keep the start signal above the chain.
- [ ] Remove `emitted_signal` and `downstream` from the numbered process steps.
- [ ] Render follow-up control below the chain.
- [ ] Render “Van stap X naar stap Y” transition text between numbered steps.
- [ ] Update default process-intro copy so it describes a step overview instead of a start-to-follow-up story.

### Task 3: Verification

**Commands:**
- `npx vitest run src/test/flowRuntimeChain.test.ts`
- `npm test`
- `npm run build`
- `npm run lint`

**Live check:**
- Open a Zapier-linked process journey.
- Confirm Zapier appears as numbered steps.
- Confirm start signal and follow-up control are separate from the main step list.
