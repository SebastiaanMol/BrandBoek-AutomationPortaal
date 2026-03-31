# Phase 3: Export - Research

**Researched:** 2026-03-31
**Domain:** SVG-to-canvas browser export (PNG + PDF) in a React/TypeScript Vite app
**Confidence:** HIGH

---

## Summary

The export feature is **already implemented** in `src/pages/Processen.tsx`. The page contains working `exportPng()` and `exportPdf()` functions, a `DropdownMenu` export button in the header, and the helper `getSvgElement()` / `svgToCanvas()` utilities. The UI skeleton (button, icons, dropdown items) is present and wired up.

The implementation uses a pure-browser approach: SVG clone → inline computed styles → base64 data URL → `<img>` → `<canvas>` → `canvas.toDataURL()` for PNG, and a CDN-loaded jsPDF for PDF. This avoids adding any new npm dependency. The current approach has a known reliability risk: jsPDF is loaded from a CDN at runtime, which can fail in offline/restricted environments and introduces a CSP concern.

The planning work for Phase 3 is therefore not "build the export feature from scratch" but rather **validate and harden the existing implementation** against the two success criteria in PROC-05, and replace the CDN-loaded jsPDF with a bundled npm package.

**Primary recommendation:** Install `jspdf` as a proper npm dependency (v4.x, currently 4.2.1), remove the CDN script injection, and write a smoke-test that confirms the SVG element is found and `svgToCanvas` resolves to a non-empty canvas.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROC-05 | Process map can be exported as PNG or PDF | Export functions already exist in Processen.tsx; need bundled jsPDF, robustness hardening, and visual verification |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jspdf | 4.2.1 (npm) | Convert canvas image to PDF download | Already used in the page; npm install eliminates CDN failure risk |
| Browser Canvas API | native | Rasterise SVG to bitmap at 2× scale | Zero-dependency, already in place |
| XMLSerializer | native | Serialize SVG DOM to string for base64 data URL | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 0.462.0 | `ImageDown`, `FileDown`, `ChevronDown` icons | Already imported in Processen.tsx |
| sonner | 1.7.4 | `toast.success` / `toast.error` feedback | Already wired in export handlers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Browser Canvas API (current) | `html-to-image` (npm, v1.11.13) | html-to-image captures full DOM including non-SVG overlays but adds ~50 KB dependency; Canvas API is already working and zero-cost |
| CDN-loaded jsPDF (current) | `jspdf` npm package | npm install is strictly better: bundled, typed, offline-safe, no CSP issue |

**Installation (jsPDF only — everything else already present):**
```bash
npm install jspdf --legacy-peer-deps
```

**Version verification (done 2026-03-31):**
- `jspdf`: 4.2.1 (published recently; API unchanged from 2.x for `addImage` / `save`)
- `html-to-image`: 1.11.13 (not needed given existing SVG approach works)

---

## Architecture Patterns

### How the export pipeline works (existing code)

```
Processen.tsx
  getSvgElement()            → querySelector(".process-canvas-wrap svg")
  svgToCanvas(svg)           → clones SVG, inlines computed styles, base64-encodes,
                               loads into <img>, draws on 2× canvas
  exportPng()                → canvas.toDataURL("image/png") → <a>.click()
  exportPdf()                → canvas → jsPDF({ orientation:"landscape" }) → pdf.save()
```

The SVG lives inside `.process-canvas-wrap`:

```html
<!-- Processen.tsx line 478 -->
<div className="process-canvas-wrap border border-border rounded ...">
  <ProcessCanvas .../>     <!-- renders <svg ref={svgRef} width={svgWidth} height={...} -->
</div>
```

`ProcessCanvas` renders a single `<svg>` with `ref={svgRef}` at line 521. The SVG has explicit `width` and `height` attributes computed from layout constants. The selector `.process-canvas-wrap svg` is correct and reliable.

### Pattern 1: Replace CDN jsPDF with bundled import

**What:** Remove the `document.createElement("script")` injection and import jsPDF at the module level.

**When to use:** Always — CDN loading is fragile and anti-pattern in a Vite app.

```typescript
// Replace the CDN-load block in exportPdf() with:
import { jsPDF } from "jspdf";

async function exportPdf() {
  const svg = getSvgElement();
  if (!svg) return toast.error("Canvas niet gevonden");
  try {
    const canvas = await svgToCanvas(svg);
    const imgData = canvas.toDataURL("image/png");
    const w = canvas.width / 2;
    const h = canvas.height / 2;
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [w, h] });
    pdf.addImage(imgData, "PNG", 0, 0, w, h);
    pdf.save("proceskaart.pdf");
    toast.success("PDF gedownload");
  } catch (err) {
    console.error(err);
    toast.error("Export mislukt");
  }
}
```

### Pattern 2: SVG CSS variable resolution (already in place)

The `svgToCanvas` function already walks every element, reads `window.getComputedStyle`, and inlines `fill`, `stroke`, `color`, `background-color`. This is the correct fix for Tailwind/CSS-variable colors disappearing in the rasterised output. No change needed.

### Pattern 3: System font fallback (already in place)

The clone inserts `* { font-family: system-ui, Arial, sans-serif !important; }` to avoid external font loads that would stall `img.onload`. This is correct.

### Anti-Patterns to Avoid

- **CDN script injection for jsPDF:** Network failure or CSP blocks cause silent export failure. Use npm instead.
- **Reading `svg.width` property (HTMLElement):** Always use `svg.getAttribute("width")` or `svg.viewBox.baseVal.width` — the existing code already does this correctly.
- **Triggering export while canvas is still loading:** The `loading` state guard is managed by the page; no extra guard needed, but should be verified.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF generation | Custom PDF byte writer | jsPDF | PDF spec is complex; jsPDF is the ecosystem standard |
| SVG-to-bitmap | Third-party service | Browser Canvas API (existing) | Works in-browser, no CORS, no dependency |
| Font embedding in exports | Custom font subsetter | System font fallback (existing) | Avoids cross-origin font load; good enough for handover docs |

---

## Common Pitfalls

### Pitfall 1: CSS variables not resolved in the export
**What goes wrong:** SVG exported as PNG shows grey/transparent shapes where Tailwind CSS variables (`--color-border`, `--background`) were used.
**Why it happens:** SVG serialization captures attribute values, not computed styles. CSS variables are not expanded.
**How to avoid:** The `svgToCanvas` function already inlines `fill`, `stroke`, `color`, `background-color` via `getComputedStyle`. Verify all swimlane background colours appear in the export; extend the `attrs` array if any are missing (e.g., `stroke-width`, `opacity`).
**Warning signs:** Swimlane headers or borders appear invisible/white in the PNG output.

### Pitfall 2: SVG scrolled off-screen is clipped
**What goes wrong:** The canvas wrapping div has `overflow-auto` (Processen.tsx line 472). If the user has scrolled right, `getBoundingClientRect()` returns the visible portion, not the full SVG.
**Why it happens:** `svgToCanvas` reads `svg.getAttribute("width")` for dimensions (correct) but the image is drawn by loading the serialized SVG — this should render the full SVG regardless of scroll. However if the SVG lacks explicit `width`/`height` attributes, `getBoundingClientRect` becomes the fallback. The existing code uses `svg.getAttribute("width") ?? svg.viewBox.baseVal.width`, which is safe since ProcessCanvas always sets explicit width/height.
**How to avoid:** No code change needed, but verify with a wide canvas (many columns) that the full canvas appears in the export, not just the visible portion.
**Warning signs:** Export is cropped horizontally.

### Pitfall 3: CDN jsPDF unavailable
**What goes wrong:** `exportPdf()` silently shows "Export mislukt" toast because the CDN script fails to load.
**Why it happens:** The current implementation dynamically loads jsPDF from `cdnjs.cloudflare.com`. Network or CSP restrictions block it.
**How to avoid:** Install `jspdf` as an npm dependency and import it statically. This is the primary fix task.
**Warning signs:** PDF export fails on first attempt; PNG export still works.

### Pitfall 4: jsPDF v4 API change
**What goes wrong:** Build error after installing jsPDF v4 — `new jsPDF` import path changed.
**Why it happens:** In jsPDF ≥ 3.x the import is `import { jsPDF } from "jspdf"` (named export), identical to what's already written in the CDN-path code. Confirmed unchanged in v4.
**How to avoid:** Use `import { jsPDF } from "jspdf"` — this is exactly the existing pattern.
**Warning signs:** TypeScript error `Module '"jspdf"' has no exported member 'jsPDF'`.

---

## Code Examples

### Remove CDN jsPDF — full replacement for `exportPdf`
```typescript
// Source: jsPDF npm docs — https://github.com/parallax/jsPDF#usage
import { jsPDF } from "jspdf";

async function exportPdf() {
  const svg = getSvgElement();
  if (!svg) return toast.error("Canvas niet gevonden");
  try {
    const canvas = await svgToCanvas(svg);
    const imgData = canvas.toDataURL("image/png");
    const w = canvas.width / 2;   // canvas is 2× for retina; PDF uses logical px
    const h = canvas.height / 2;
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [w, h] });
    pdf.addImage(imgData, "PNG", 0, 0, w, h);
    pdf.save("proceskaart.pdf");
    toast.success("PDF gedownload");
  } catch (err) {
    console.error(err);
    toast.error("Export mislukt");
  }
}
```

### Verify SVG dimensions (existing pattern — no change needed)
```typescript
// Source: Processen.tsx svgToCanvas()
const w = Number(svg.getAttribute("width") ?? svg.viewBox.baseVal.width);
const h = Number(svg.getAttribute("height") ?? svg.viewBox.baseVal.height);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| html-to-image / dom-to-image (ecosystem default) | Direct SVG serialization + Canvas API (custom) | Phase 1 (pre-existing) | No new npm dependency; works cleanly for pure-SVG canvas |
| jsPDF loaded from CDN | jsPDF as npm import | This phase | Reliable bundled build, TypeScript types, offline-safe |

**Deprecated/outdated:**
- CDN script injection for jsPDF: Anti-pattern in Vite/ESM apps — replaced by npm install.

---

## Open Questions

1. **Do swimlane header backgrounds render correctly?**
   - What we know: `svgToCanvas` inlines `fill`, `stroke`, `color`, `background-color` only.
   - What's unclear: Swimlane row backgrounds may use SVG `<rect fill="...">` with CSS variable values not covered by the four inlined properties. Needs manual visual check.
   - Recommendation: Manual verification task in the wave — export PNG, compare visually to browser view.

2. **Does the export capture the UnassignedPanel or only the canvas?**
   - What we know: `getSvgElement()` selects `.process-canvas-wrap svg` — only the SVG, not the right panel.
   - What's unclear: Success criteria says "swimlane layout with automation names legible" — this is the canvas SVG only, which is correct.
   - Recommendation: No action needed; confirm in verification.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is a code-only change (replace CDN with npm package, hardening). No external services or CLI tools required beyond standard npm/node which are confirmed present from prior phases.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vite.config.ts` (vitest config inline) or `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROC-05 | `getSvgElement()` finds the SVG selector | unit | `npm test -- --grep "export"` | ❌ Wave 0 |
| PROC-05 | `svgToCanvas()` resolves with non-zero width/height | unit (jsdom limited) | manual-only — requires real browser DOM | manual-only |
| PROC-05 | PNG download triggers without error | smoke | manual visual verification | manual-only |
| PROC-05 | PDF download triggers without error | smoke | manual visual verification | manual-only |
| PROC-05 | Automation names legible at normal zoom in exported PNG | visual | manual visual verification | manual-only |

**Note on testability:** `svgToCanvas` uses `window.getComputedStyle`, `Image`, and `canvas.getContext("2d")` — these are all jsdom-limited or unavailable in a headless Vitest environment. Export correctness must be verified manually (visual diff) rather than via automated unit tests. A unit test for the pure logic (selector presence, dimension extraction) is feasible and useful.

### Sampling Rate
- **Per task commit:** `npm test` (existing suite must stay green)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green + manual visual export check before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/test/export.test.ts` — unit test for `getSvgElement` selector pattern and `svgToCanvas` dimension logic (pure math, no DOM required)

---

## Sources

### Primary (HIGH confidence)
- Direct code reading of `src/pages/Processen.tsx` — export functions fully implemented
- Direct code reading of `src/components/process/ProcessCanvas.tsx` — SVG structure confirmed
- `package.json` — confirmed jspdf not in dependencies; html-to-image not installed
- `npm view jspdf version` — confirmed current version 4.2.1 (run 2026-03-31)
- `npm view html-to-image version` — confirmed 1.11.13 available but not needed

### Secondary (MEDIUM confidence)
- jsPDF GitHub README (https://github.com/parallax/jsPDF) — import pattern `{ jsPDF } from "jspdf"` confirmed for v2+/v4

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — jsPDF version verified via npm registry; existing code directly inspected
- Architecture: HIGH — export functions are already written; patterns confirmed from source
- Pitfalls: HIGH — CSS variable pitfall directly visible in code; CDN pitfall visible in exportPdf implementation

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (jsPDF stable; no fast-moving dependencies involved)
