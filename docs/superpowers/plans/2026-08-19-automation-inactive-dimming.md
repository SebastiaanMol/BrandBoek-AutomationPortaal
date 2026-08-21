# Automation Catalog Inactive Dimming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dim disabled ("Uitgeschakeld") automation rows in the main automations table the same way `PipelineMatrix.tsx` dims inactive pipelines, while confirming (and locking in with a test) that disabled automations already always sort after every other status.

**Architecture:** One row component (`AutomationCatalogRow` in `src/pages/AlleAutomatiseringen.tsx`) gains a computed `isInactive` flag that adds `text-muted-foreground opacity-70` to its row className — the exact class pair `PipelineMatrix.tsx` already uses for inactive pipeline rows. The row's existing click/keyboard handlers are untouched, so it stays fully interactive. No change to `sortAutomationsForList` is needed; its existing behavior (status-priority-first sort, `Uitgeschakeld` always last) already satisfies the "always active before inactive" requirement — this plan adds a test that pins that guarantee down explicitly.

**Tech Stack:** React, TypeScript, Vitest, @testing-library/react.

---

## File Structure

- Modify: `src/pages/AlleAutomatiseringen.tsx` — add `isInactive` computation and dimming class to `AutomationCatalogRow`; export `AutomationCatalogRow` (currently a private `const`) so it can be unit-tested directly, matching how `SentryIssueBadge` and `AutomatiseringDetailPanel` are already exported from the same file.
- Create: `src/test/automationCatalogRowDimming.test.tsx` — behavior test for the new dimming class.
- Modify: `src/test/automationListSort.test.ts` — add one test locking in that `Uitgeschakeld` automations always sort last, independent of the existing per-sort-order tests (which already demonstrate this as a side effect but don't assert it as the specific guarantee this feature depends on).

## Task 1: Dim disabled automation rows and lock in the active-first sort guarantee

**Files:**
- Modify: `src/pages/AlleAutomatiseringen.tsx:521` (component declaration) and `:538-563` (the row's className)
- Create: `src/test/automationCatalogRowDimming.test.tsx`
- Modify: `src/test/automationListSort.test.ts`

- [ ] **Step 1: Write the failing dimming test**

Create `src/test/automationCatalogRowDimming.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutomationCatalogRow } from "@/pages/AlleAutomatiseringen";
import { getAutomationCatalogRowPresentation } from "@/lib/automationCatalogPresentation";
import type { Automatisering, Status } from "@/lib/types";

function makeAutomation(status: Status, naam = "Test automation"): Automatisering {
  return {
    id: `automation-${status}`,
    naam,
    categorie: "Backend Script",
    doel: "",
    trigger: "",
    systemen: ["Backend"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status,
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
  };
}

function renderRow(status: Status) {
  const automation = makeAutomation(status);
  render(
    <AutomationCatalogRow
      automation={automation}
      catalog={getAutomationCatalogRowPresentation(automation)}
      isExpanded={false}
      presentation={null}
      onToggle={vi.fn()}
      onRememberNavigation={vi.fn()}
    />,
  );
  return screen.getByRole("row");
}

describe("AutomationCatalogRow inactive dimming", () => {
  it("dims a disabled automation row the same way PipelineMatrix dims inactive pipelines", () => {
    const row = renderRow("Uitgeschakeld");
    expect(row).toHaveClass("text-muted-foreground");
    expect(row).toHaveClass("opacity-70");
  });

  it("does not dim an active automation row", () => {
    const row = renderRow("Actief");
    expect(row).not.toHaveClass("opacity-70");
    expect(row).toHaveClass("text-foreground");
  });

  it("does not dim an in-review automation row", () => {
    const row = renderRow("In review");
    expect(row).not.toHaveClass("opacity-70");
  });

  it("does not dim an outdated automation row", () => {
    const row = renderRow("Verouderd");
    expect(row).not.toHaveClass("opacity-70");
  });

  it("keeps the disabled row clickable", () => {
    const onToggle = vi.fn();
    const automation = makeAutomation("Uitgeschakeld");
    render(
      <AutomationCatalogRow
        automation={automation}
        catalog={getAutomationCatalogRowPresentation(automation)}
        isExpanded={false}
        presentation={null}
        onToggle={onToggle}
        onRememberNavigation={vi.fn()}
      />,
    );

    screen.getByRole("row").click();

    expect(onToggle).toHaveBeenCalledWith(automation.id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/test/automationCatalogRowDimming.test.tsx`

Expected: FAIL — `AutomationCatalogRow` is not an exported member of `@/pages/AlleAutomatiseringen` (it's currently a private `const` inside the module), so the import fails.

- [ ] **Step 3: Export `AutomationCatalogRow` and add the dimming class**

In `src/pages/AlleAutomatiseringen.tsx`, change the component declaration at line 521 from:

```tsx
const AutomationCatalogRow = memo(function AutomationCatalogRow({
```

to:

```tsx
export const AutomationCatalogRow = memo(function AutomationCatalogRow({
```

Then, in the same component, add the `isInactive` computation next to the existing `sourceFindingRowClass` computation (currently at lines 538-544):

```tsx
  const sourceFinding = getActiveSourceWarningFinding(automation);
  const sourceFindingIsCritical = sourceFinding?.severity === "critical" || sourceFinding?.type === "source_missing";
  const sourceFindingRowClass = sourceFinding
    ? sourceFindingIsCritical
      ? "bg-red-50/60 ring-1 ring-inset ring-red-200"
      : "bg-amber-50/60 ring-1 ring-inset ring-amber-200"
    : "";
  const isInactive = automation.status === "Uitgeschakeld";
```

Then update the row's className (currently at line 563) from:

```tsx
        className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(280px,1.6fr)_130px_130px_160px_112px] md:items-center md:gap-4 md:px-5 ${sourceFindingRowClass} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`}
```

to:

```tsx
        className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(280px,1.6fr)_130px_130px_160px_112px] md:items-center md:gap-4 md:px-5 ${sourceFindingRowClass} ${isInactive ? "text-muted-foreground opacity-70" : "text-foreground"} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`}
```

This mirrors the exact pattern `PipelineMatrix.tsx` uses for inactive pipeline rows (`isInactive ? "text-muted-foreground opacity-70" : "text-foreground"`). No other prop, handler, or attribute on the row changes — `onClick`, `onKeyDown`, and `tabIndex` stay exactly as they are, so the row remains fully interactive when dimmed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/test/automationCatalogRowDimming.test.tsx`

Expected: PASS (5 tests).

- [ ] **Step 5: Add the sort-priority regression test**

In `src/test/automationListSort.test.ts`, add a new test inside the existing `describe("sortAutomationsForList", ...)` block, after the last existing `it(...)`:

```ts
  it("always places disabled automations after every other status, regardless of sort order", () => {
    const automations = [
      makeAutomation("disabled", "Uitgeschakeld", "2026-05-25T00:00:00.000Z", "A disabled"),
      makeAutomation("outdated", "Verouderd", "2026-05-24T00:00:00.000Z", "B outdated"),
      makeAutomation("review", "In review", "2026-05-23T00:00:00.000Z", "C review"),
      makeAutomation("active", "Actief", "2026-05-22T00:00:00.000Z", "D active"),
    ];

    for (const sortOrder of ["created_at", "naam", "status"] as const) {
      const result = sortAutomationsForList(automations, sortOrder);
      expect(result.map((a) => a.id)).toEqual(["active", "review", "outdated", "disabled"]);
    }
  });
```

- [ ] **Step 6: Run the new sort-priority test to verify it already passes**

Run: `npm test -- src/test/automationListSort.test.ts`

Since this test exercises pre-existing behavior in `sortAutomationsForList` (`src/lib/automationListSort.ts`), it should already PASS without any production code change — this step is verification, not TDD red/green. If it unexpectedly fails, stop and re-check `STATUS_PRIORITY` in `src/lib/automationListSort.ts` before touching anything else; that would mean the existing sort guarantee has regressed and needs its own fix, which is out of scope for this plan.

Expected: PASS (4 tests total in the file).

- [ ] **Step 7: Run the full automation-related test suite**

Run: `npm test -- src/test/automationCatalogRowDimming.test.tsx src/test/automationListSort.test.ts src/test/automationCatalogPresentation.test.ts src/test/PipelineMatrix.test.tsx`

Expected: PASS, no failed tests.

- [ ] **Step 8: Commit**

```bash
git add src/pages/AlleAutomatiseringen.tsx src/test/automationCatalogRowDimming.test.tsx src/test/automationListSort.test.ts
git commit -m "Dim disabled automation rows like inactive pipelines"
```

## Self-Review

- **Spec coverage:** Visual dimming (spec section "Visual dimming") → Step 3. Sorting guarantee locked in with a test (spec section "Sorting") → Step 5. Row stays clickable (spec "Visual dimming" note) → covered by the "keeps the disabled row clickable" test in Step 1 and by leaving `onClick`/`onKeyDown` untouched in Step 3. Non-goals (badge color, other views, other "active" logic) → untouched by this plan, no task needed.
- **Scope:** Single file touched for production code (`AlleAutomatiseringen.tsx`), matching the spec's explicit scope restriction to that one view.
- **Type consistency:** `AutomationCatalogRow`'s prop names (`automation`, `catalog`, `isExpanded`, `presentation`, `onToggle`, `onRememberNavigation`, `sentrySummary?`) are used identically in the new test as they're declared in the component today. `Status` values used in tests (`"Actief"`, `"In review"`, `"Verouderd"`, `"Uitgeschakeld"`) match `src/lib/types.ts`'s `Status` union exactly.
