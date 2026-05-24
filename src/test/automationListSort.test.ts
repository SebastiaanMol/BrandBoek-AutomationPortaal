import { describe, expect, it } from "vitest";
import { sortAutomationsForList, type AutomationListSortOrder } from "@/lib/automationListSort";
import type { Automatisering, Status } from "@/lib/types";

function makeAutomation(
  id: string,
  status: Status,
  createdAt: string,
  naam = id,
): Automatisering {
  return {
    id,
    naam,
    categorie: "Backend Script",
    doel: "",
    trigger: "",
    systemen: ["Backend"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status,
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt,
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
  };
}

function sortedIds(sortOrder: AutomationListSortOrder): string[] {
  return sortAutomationsForList([
    makeAutomation("disabled-newest", "Uitgeschakeld", "2026-05-21T00:00:00.000Z", "A disabled"),
    makeAutomation("outdated", "Verouderd", "2026-05-18T00:00:00.000Z", "B outdated"),
    makeAutomation("active-later-name", "Actief", "2026-05-20T00:00:00.000Z", "Z active"),
    makeAutomation("review", "In review", "2026-05-19T00:00:00.000Z", "C review"),
    makeAutomation("active-first-name", "Actief", "2026-05-17T00:00:00.000Z", "A active"),
  ], sortOrder).map((automation) => automation.id);
}

describe("sortAutomationsForList", () => {
  it("keeps active automations above disabled automations when sorting by creation date", () => {
    expect(sortedIds("created_at")).toEqual([
      "active-first-name",
      "active-later-name",
      "review",
      "outdated",
      "disabled-newest",
    ]);
  });

  it("keeps disabled automations at the bottom while sorting active automations by name", () => {
    expect(sortedIds("naam")).toEqual([
      "active-first-name",
      "active-later-name",
      "review",
      "outdated",
      "disabled-newest",
    ]);
  });

  it("uses the same practical status priority when the status sort is selected", () => {
    expect(sortedIds("status")).toEqual([
      "active-first-name",
      "active-later-name",
      "review",
      "outdated",
      "disabled-newest",
    ]);
  });
});
