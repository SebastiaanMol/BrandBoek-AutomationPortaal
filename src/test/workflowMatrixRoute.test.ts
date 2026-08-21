import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const layoutSource = readFileSync(resolve(process.cwd(), "src/components/AppLayout.tsx"), "utf8");

describe("WorkflowMatrix route", () => {
  it("registers a direct-only route without adding it to the main navigation", () => {
    expect(appSource).toContain('import WorkflowMatrix from "./pages/WorkflowMatrix";');
    expect(appSource).toContain('<Route path="/automation-navigator" element={<WorkflowMatrix />} />');
    expect(layoutSource).not.toContain("/automation-navigator");
  });
});
