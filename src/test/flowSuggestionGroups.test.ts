import { describe, it, expect } from "vitest";
import { groupFlowSuggesties } from "@/lib/flowSuggestionGroups";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";

function makeSuggestie(
  fromId: string,
  toId: string,
  overrides: Partial<FlowSuggestie> = {},
): FlowSuggestie {
  return {
    fromId,
    toId,
    fromNaam: fromId,
    toNaam: toId,
    fromCategorie: "HubSpot Workflow",
    toCategorie: "HubSpot Workflow",
    zekerheid: "ai",
    redenering: "",
    confirmed: false,
    rejected: false,
    ...overrides,
  };
}

describe("groupFlowSuggesties — confirmedCount / totalCount", () => {
  it("totalCount equals number of suggestions in the group", () => {
    const suggestions = [
      makeSuggestie("a", "b"),
      makeSuggestie("b", "c"),
    ];
    const groups = groupFlowSuggesties(suggestions);
    expect(groups).toHaveLength(1);
    expect(groups[0].totalCount).toBe(2);
  });

  it("confirmedCount is 0 when nothing is confirmed", () => {
    const suggestions = [makeSuggestie("a", "b"), makeSuggestie("b", "c")];
    const groups = groupFlowSuggesties(suggestions);
    expect(groups[0].confirmedCount).toBe(0);
  });

  it("confirmedCount only counts confirmed suggestions", () => {
    const suggestions = [
      makeSuggestie("a", "b", { confirmed: true }),
      makeSuggestie("b", "c"),
    ];
    const groups = groupFlowSuggesties(suggestions);
    expect(groups[0].confirmedCount).toBe(1);
  });

  it("confirms rejected suggestions do not count towards confirmedCount", () => {
    const suggestions = [
      makeSuggestie("a", "b", { rejected: true }),
      makeSuggestie("b", "c", { confirmed: true }),
    ];
    const groups = groupFlowSuggesties(suggestions);
    expect(groups[0].confirmedCount).toBe(1);
  });

  it("groups disconnected suggestions into separate components", () => {
    const suggestions = [
      makeSuggestie("a", "b"),
      makeSuggestie("c", "d"),
    ];
    const groups = groupFlowSuggesties(suggestions);
    expect(groups).toHaveLength(2);
    groups.forEach((g) => expect(g.totalCount).toBe(1));
  });
});
