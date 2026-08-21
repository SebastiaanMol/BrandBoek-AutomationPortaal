# Automatic Sync Detail Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an Automatic sync canvas block explainable by opening a right-side detail panel with its purpose and linked items.

**Architecture:** Reuse the existing right-panel pattern in `ProcessenEditor`. Add artifact click selection in `ProcessCanvas`, then render a focused `AutomaticSyncDetailPanel` for `automaticSyncBlock` artifacts using existing `ProcessArtifact`, `Automation`, and `Flow` data.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing shadcn/ui Button/Badge styling.

---

### Task 1: Select Automatic Sync Artifact

**Files:**
- Modify: `src/components/process/ProcessCanvas.tsx`
- Modify: `src/components/process/ProcessenEditor.tsx`
- Test: `src/test/processenEditorEditMode.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a test that renders a saved `automaticSyncBlock`, clicks `Automatic sync block Pipeline-brede automatische sync`, and expects a right panel heading `Pipeline-brede automatische sync`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/test/processenEditorEditMode.test.tsx -t "opens the automatic sync detail panel"`

- [ ] **Step 3: Write minimal implementation**

Add `onArtifactClick?: (artifact: ProcessArtifact) => void` to `ProcessCanvasProps`; call it from artifact group click. Add `selectedArtifactId` state in `ProcessenEditor`, clear other selections when selecting an artifact.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/test/processenEditorEditMode.test.tsx -t "opens the automatic sync detail panel"`

### Task 2: Automatic Sync Detail Panel Content

**Files:**
- Create: `src/components/process/AutomaticSyncDetailPanel.tsx`
- Modify: `src/components/process/ProcessenEditor.tsx`
- Test: `src/test/automaticSyncDetailPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Render the panel with one automation and one process journey. Expect title, description, `Gekoppelde procesreizen`, `Gekoppelde automations`, and the fixed explanation text.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/test/automaticSyncDetailPanel.test.tsx`

- [ ] **Step 3: Write minimal implementation**

Create a right-side panel component with header, close button, description textarea in edit mode, read-only explanation, item lists, and optional open callbacks.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/test/automaticSyncDetailPanel.test.tsx`

### Task 3: Regression Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run targeted tests**

Run: `npm test -- --run src/test/automaticSyncDetailPanel.test.tsx src/test/flowDetailPanel.test.tsx src/test/processenEditorEditMode.test.tsx src/test/processCanvasPlacement.test.tsx`

- [ ] **Step 2: Run TypeScript**

Run: `npx tsc --noEmit --pretty false`
