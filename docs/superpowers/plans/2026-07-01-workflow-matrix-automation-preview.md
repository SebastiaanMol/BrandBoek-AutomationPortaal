# Workflow Matrix Automation Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make workflow cards on `/automation-navigator` clickable and show a useful detail preview without leaving the matrix.

**Architecture:** `WorkflowMatrix.tsx` owns selected workflow state and passes an `onSelect` callback down to cards. A local `WorkflowPreviewPanel` component renders a right-side fixed panel from already-loaded automation data, so no extra queries or route changes are needed.

**Tech Stack:** React, TypeScript, Tailwind, existing shadcn `Button`/`Badge`, Vitest, Testing Library.

---

### Task 1: Add UI Coverage

**Files:**
- Modify: `src/test/workflowMatrix.test.tsx`

- [ ] **Step 1: Add a failing interaction test**

Add a test that renders the matrix, clicks `Afspraak reminder workflow`, and expects a preview panel with detail fields.

- [ ] **Step 2: Run the test**

Run: `npm test -- src/test/workflowMatrix.test.tsx`

Expected: FAIL because no preview panel opens yet.

### Task 2: Implement Preview Panel

**Files:**
- Modify: `src/pages/WorkflowMatrix.tsx`

- [ ] **Step 1: Add selected workflow state**

Add `selectedWorkflow` state in `WorkflowMatrix`.

- [ ] **Step 2: Thread selection callbacks**

Pass `onWorkflowSelect` from `WorkflowMatrix` to `PipelineWorkflowSection`, `StageWorkflowCard`, and `WorkflowCard`.

- [ ] **Step 3: Make cards accessible buttons**

Render workflow cards as `<button type="button">` with focus styling and existing card content.

- [ ] **Step 4: Add `WorkflowPreviewPanel`**

Render a fixed right-side panel with name, status, external ID, pipeline/stage IDs, goal, trigger, systems, steps, run data, and collapsible/raw technical details.

- [ ] **Step 5: Close behavior**

Add a close button and backdrop click area that clears `selectedWorkflow`.

### Task 3: Verify

**Files:**
- Test: `src/test/workflowMatrix.test.tsx`

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/test/workflowMatrix.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: PASS.

## Self-Review

- Spec coverage: clickable cards, right preview panel, no extra query, missing-field handling, raw technical details, close behavior, and tests are covered.
- Placeholder scan: no implementation placeholders remain.
- Type consistency: all changes stay inside `WorkflowMatrix.tsx` and existing `WorkflowMatrixAutomation` data shape.
