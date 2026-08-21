# Process Canvas Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automations and process journeys can be placed on connections or step cards, reordered deterministically, and rendered as compact bottom-edge dots without resizing step cards.

**Architecture:** Add a backward-compatible `CanvasPlacement` model, then update process state mapping, flow-link helpers, editor mutation handlers, and canvas rendering. Preserve old `fromStepId/toStepId` behavior while preferring explicit placement when available.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing SVG process canvas.

---

## File Structure

- `src/data/processData.ts`: define `CanvasPlacement`, extend `Automation`, and type `flowLinks` with placement-aware values.
- `src/lib/processFlowLinks.ts`: centralize placement parsing/filter/removal helpers for process journey links.
- `src/lib/processStateMapping.ts`: save/load automation and flow placements while accepting old link shapes.
- `src/components/process/ProcessenEditor.tsx`: add attach-to-step and reorder handlers for automations and flows, and cleanup step placements.
- `src/components/process/ProcessCanvas.tsx`: render unified dots on connections and step-card bottom edge, accept step drops, and use blue/orange visual distinction.
- `src/test/processCanvasPlacement.test.tsx`: UI coverage for step-card dots and drop handlers.
- `src/test/processStatePlacement.test.ts`: unit coverage for persistence/backward compatibility.

### Task 1: Placement Types And Persistence

- [ ] Write failing tests in `src/test/processStatePlacement.test.ts` for old connection links, new step placements, and cleanup filtering.
- [ ] Run `npm test -- src/test/processStatePlacement.test.ts` and confirm the new tests fail because placement support is missing.
- [ ] Add `CanvasPlacement` and `ProcessPlacementLink` types in `src/data/processData.ts`.
- [ ] Update `src/lib/processFlowLinks.ts` to preserve valid step placements and connection placements.
- [ ] Update `src/lib/processStateMapping.ts` so `buildSavedProcessState` writes `placement` first and old `fromStepId/toStepId` second.
- [ ] Run `npm test -- src/test/processStatePlacement.test.ts` and confirm it passes.

### Task 2: Editor Mutations

- [ ] Write failing tests in `src/test/processCanvasPlacement.test.tsx` for dropping an automation and a process journey onto a step card.
- [ ] Run the new tests and confirm the drop handlers are not called yet.
- [ ] Extend `ProcessCanvasProps` with `onAttachAutomationToStep`, `onAttachFlowToStep`, `onReorderAutomationPlacement`, and `onReorderFlowPlacement`.
- [ ] Add matching handlers in `ProcessenEditor.tsx` that update `automation.placement` or `flowLinks[flowId]` and clear old connection fields where needed.
- [ ] Run the targeted UI tests and confirm they pass.

### Task 3: Step-Card Dot Rendering

- [ ] Write failing UI tests that render two automations and one process journey attached to the same step and assert bottom-edge dot labels and colors exist.
- [ ] Run the tests and confirm no step-card placement dots render yet.
- [ ] Refactor `AutomationDot` and `FlowDot` into a shared visual dot renderer using the lightning symbol for both types.
- [ ] Render step-card placement dots at the bottom edge, horizontally centered, with overflow after the visible capacity.
- [ ] Run the targeted UI tests and confirm they pass.

### Task 4: Connection Ordering And Backward Compatibility

- [ ] Write failing tests for ordered connection placements and old `fromStepId/toStepId` rendering.
- [ ] Run the tests and confirm ordering/compatibility gaps.
- [ ] Update connection dot selection to combine explicit connection placements with legacy link fields and sort by `order`.
- [ ] Add minimal reorder callback wiring for connection drops using the drop order position.
- [ ] Run the targeted tests and confirm they pass.

### Task 5: Cleanup And Verification

- [ ] Extend existing cleanup tests so deleted/parked steps remove step placements and connection placements for both automations and flows.
- [ ] Run the cleanup tests and confirm failures before implementation.
- [ ] Update cleanup handlers in `ProcessenEditor.tsx` to remove both placement shapes.
- [ ] Run `npm test -- src/test/processStatePlacement.test.ts src/test/processCanvasPlacement.test.tsx src/test/processenEditorEditMode.test.tsx`.
- [ ] Run `npm test -- src/test/processCanvasManualConnections.test.tsx src/test/procesviewerSharedCanvas.test.tsx` for canvas regression coverage.
- [ ] Start the app and perform live browser verification on the process canvas.
