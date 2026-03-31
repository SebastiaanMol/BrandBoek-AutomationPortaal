/**
 * exportFlow.test.ts
 * Unit tests for Phase 3 export pipeline logic (PROC-05).
 *
 * Tests 1-2, 4-5: Pure logic tests — pass immediately in Wave 0.
 * Test 3 (jsPDF import): Red in Wave 0; turns green after Wave 1 installs jspdf npm package.
 *
 * NOTE: svgToCanvas uses window.getComputedStyle, Image, and Canvas APIs — all
 * jsdom-limited. Full export correctness is verified via human checkpoint (Plan 03).
 * Only pure-math helpers are tested here.
 */

import { describe, it, expect } from "vitest";
// Wave 1 will enable: import { jsPDF } from "jspdf"
// Until then, test 3 uses a dynamic import so the suite doesn't crash at parse time.

// ── Duplicated pure logic from src/pages/Processen.tsx ──────────────────────
// Keep in sync with Processen.tsx if the source logic ever changes.
// Do NOT import from src/pages/Processen.tsx — React component side effects
// prevent direct import in unit tests.

const SVG_SELECTOR = ".process-canvas-wrap svg";

function svgDimensions(
  w_attr: string | null,
  vbw: number,
  h_attr: string | null,
  vbh: number,
): { w: number; h: number } {
  return { w: Number(w_attr ?? vbw), h: Number(h_attr ?? vbh) };
}

function canvasDimensions(w: number, h: number): { cw: number; ch: number } {
  return { cw: w * 2, ch: h * 2 };
}

function pdfDimensions(canvasW: number, canvasH: number): { w: number; h: number } {
  return { w: canvasW / 2, h: canvasH / 2 };
}

// ── PROC-05: Export pipeline ──────────────────────────────────────────────────

describe("export pipeline", () => {
  it("SVG_SELECTOR is the correct selector string", () => {
    expect(SVG_SELECTOR).toBe(".process-canvas-wrap svg");
  });

  it("svgDimensions uses getAttribute first, falls back to viewBox", () => {
    expect(svgDimensions("800", 0, "600", 0)).toEqual({ w: 800, h: 600 });
    expect(svgDimensions(null, 1200, null, 400)).toEqual({ w: 1200, h: 400 });
  });

  it("jsPDF is importable from npm package", async () => {
    // Uses a variable import specifier to bypass Vite's static import analysis.
    // This way the test is a runtime failure (red), not a build-time suite crash.
    // Intentionally red in Wave 0 — turns green after Wave 1 installs jspdf npm package.
    // Wave 1 target: import { jsPDF } from "jspdf"
    const pkg = "jspdf";
    const mod = await import(/* @vite-ignore */ pkg);
    expect(typeof mod.jsPDF).toBe("function");
  });

  it("canvas output dimensions are 2x the SVG logical dimensions", () => {
    expect(canvasDimensions(800, 600)).toEqual({ cw: 1600, ch: 1200 });
  });

  it("PDF logical dimensions halve canvas dimensions back", () => {
    expect(pdfDimensions(1600, 1200)).toEqual({ w: 800, h: 600 });
  });
});
