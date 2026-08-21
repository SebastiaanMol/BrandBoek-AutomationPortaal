import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/Procesviewer.tsx"), "utf8");

describe("Procesviewer page header", () => {
  it("uses the shared compact command header in the cockpit", () => {
    expect(source).toContain("PageHeaderShell");
    expect(source).toContain("PageCommandBar");
    expect(source).not.toContain('<p className="label-uppercase">Procesviewer</p>');
  });
});
