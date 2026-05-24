import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/Instellingen.tsx"), "utf8");

describe("Zapier settings copy", () => {
  it("presents Zapier as a read-only integration", () => {
    const zapierBlock = source.slice(source.indexOf('key: "zapier"'), source.indexOf('key: "typeform"'));

    expect(zapierBlock).toContain("Lees bestaande Zaps read-only uit via de Zapier API");
    expect(zapierBlock).toContain("Zapier OAuth/Bearer token");
    expect(zapierBlock).toContain("read-only");
    expect(zapierBlock).not.toContain("API Key");
    expect(zapierBlock).not.toContain("Importeer Zaps automatisch");
  });
});
