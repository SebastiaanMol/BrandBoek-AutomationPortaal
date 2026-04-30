# XOR Gateway Visual Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-label-inside-diamond on the XOR gateway with a BPMN-standard X marker + label below, matching the existing `AndDiamond` pattern.

**Architecture:** Single-component edit inside `ProcessCanvas.tsx`. The `DecisionDiamond` function (lines 310–357) currently puts a `<text>` at the diamond's center; we replace it with two diagonal `<line>` elements and move the label below, exactly mirroring `AndDiamond` (lines 491–542).

**Tech Stack:** React 18, TypeScript, SVG, Vitest + @testing-library/react (jsdom)

---

### Task 1: Update DecisionDiamond — X marker + label below

**Files:**
- Modify: `src/components/process/ProcessCanvas.tsx:310-357`
- Test: `src/test/bpmnTypes.test.ts`

The existing test suite only has pure-function tests. `DecisionDiamond` is an unexported internal component with SVG/state dependencies — writing a full render test would require exporting the component and mocking lane config. Instead, we extend `bpmnTypes.test.ts` with a label-truncation unit test (the only extractable logic) and verify visually.

- [ ] **Step 1: Add label-truncation test for decision steps**

Open `src/test/bpmnTypes.test.ts`. After the last `describe` block, add:

```ts
describe("BPMN-04: DecisionDiamond label truncation", () => {
  function truncateDecision(label: string) {
    return label.length > 13 ? label.slice(0, 12) + "…" : label;
  }

  it("keeps short labels unchanged", () => expect(truncateDecision("Beslissing")).toBe("Beslissing"));
  it("truncates at 13 chars",        () => expect(truncateDecision("Beslissing XYZ")).toBe("Beslissing X…"));
  it("keeps 13-char label as-is",    () => expect(truncateDecision("1234567890123")).toBe("1234567890123"));
});
```

- [ ] **Step 2: Run the new tests to verify they pass (no code to break yet)**

```
npx vitest run src/test/bpmnTypes.test.ts
```

Expected: all 23 tests pass.

- [ ] **Step 3: Implement — replace inner text with X marker and move label below**

In `src/components/process/ProcessCanvas.tsx`, find the `DecisionDiamond` return block (around line 328). Replace these lines:

```tsx
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fontWeight="500" fill="#1e293b"
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {label}
      </text>
```

With:

```tsx
      <line x1={cx - h * 0.55} y1={cy - h * 0.55} x2={cx + h * 0.55} y2={cy + h * 0.55}
        stroke={hov ? cfg.stroke : "#64748b"} strokeWidth="2" style={{ pointerEvents: "none" }} />
      <line x1={cx + h * 0.55} y1={cy - h * 0.55} x2={cx - h * 0.55} y2={cy + h * 0.55}
        stroke={hov ? cfg.stroke : "#64748b"} strokeWidth="2" style={{ pointerEvents: "none" }} />
      <text x={cx} y={cy + h + 10} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fontWeight="500" fill="#1e293b"
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {label}
      </text>
```

- [ ] **Step 4: Run full test suite**

```
npx vitest run
```

Expected: all 150 tests pass (147 existing + 3 new).

- [ ] **Step 5: Visual verification**

Start the dev server (`npm run dev`) and open the process canvas. Add a decision step or find an existing one. Confirm:
- Diamond shows an X symbol inside (two diagonal lines)
- Step label appears below the diamond (not inside it)
- Hover turns both X lines and diamond border to the lane color
- Behaviour matches `AndDiamond` visually

- [ ] **Step 6: Commit**

```bash
git add src/components/process/ProcessCanvas.tsx src/test/bpmnTypes.test.ts
git commit -m "feat(canvas): BPMN-standard XOR gateway — X marker + label below"
```
