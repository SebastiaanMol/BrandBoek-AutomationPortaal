import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
    <MemoryRouter>
      <AutomationCatalogRow
        automation={automation}
        catalog={getAutomationCatalogRowPresentation(automation)}
        isExpanded={false}
        presentation={null}
        onToggle={vi.fn()}
        onRememberNavigation={vi.fn()}
      />
    </MemoryRouter>,
  );
  return screen.getByRole("row");
}

describe("AutomationCatalogRow inactive dimming", () => {
  it("applies the same striped/hatched blocked-row treatment Procesviewer uses for inactive pipelines", () => {
    const row = renderRow("Uitgeschakeld");
    expect(row).toHaveClass("text-muted-foreground");
    expect(row).toHaveClass("opacity-75");
    expect(row).toHaveClass("bg-slate-100/70");
    expect(row.className).toContain("[background-image:repeating-linear-gradient(135deg,rgba(148,163,184,0.14)_0,rgba(148,163,184,0.14)_6px,transparent_6px,transparent_12px)]");
  });

  it("does not dim an active automation row", () => {
    const row = renderRow("Actief");
    expect(row).not.toHaveClass("opacity-75");
    expect(row).toHaveClass("text-foreground");
  });

  it("does not dim an in-review automation row", () => {
    const row = renderRow("In review");
    expect(row).not.toHaveClass("opacity-75");
  });

  it("does not dim an outdated automation row", () => {
    const row = renderRow("Verouderd");
    expect(row).not.toHaveClass("opacity-75");
  });

  it("keeps the disabled row clickable", () => {
    const onToggle = vi.fn();
    const automation = makeAutomation("Uitgeschakeld");
    render(
      <MemoryRouter>
        <AutomationCatalogRow
          automation={automation}
          catalog={getAutomationCatalogRowPresentation(automation)}
          isExpanded={false}
          presentation={null}
          onToggle={onToggle}
          onRememberNavigation={vi.fn()}
        />
      </MemoryRouter>,
    );

    screen.getByRole("row").click();

    expect(onToggle).toHaveBeenCalledWith(automation.id);
  });
});
