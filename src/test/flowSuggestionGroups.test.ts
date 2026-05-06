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
    fromSource: "hubspot",
    toSource: "hubspot",
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

  it("orders shuffled chain suggestions as A to B to C to D", () => {
    const suggestions = [
      makeSuggestie("c", "d", { fromNaam: "C", toNaam: "D" }),
      makeSuggestie("a", "b", { fromNaam: "A", toNaam: "B" }),
      makeSuggestie("b", "c", { fromNaam: "B", toNaam: "C" }),
    ];
    const groups = groupFlowSuggesties(suggestions);
    expect(groups).toHaveLength(1);
    expect(groups[0].nodes.map((node) => node.id)).toEqual(["a", "b", "c", "d"]);
    expect(groups[0].suggestions.map((suggestion) => `${suggestion.fromId}->${suggestion.toId}`)).toEqual([
      "a->b",
      "b->c",
      "c->d",
    ]);
    expect(groups[0].structureType).toBe("lineair");
  });

  it("marks many-to-one groups as branched", () => {
    const suggestions = [
      makeSuggestie("a", "target", { fromNaam: "A", toNaam: "Target" }),
      makeSuggestie("b", "target", { fromNaam: "B", toNaam: "Target" }),
      makeSuggestie("c", "target", { fromNaam: "C", toNaam: "Target" }),
    ];

    const groups = groupFlowSuggesties(suggestions);
    expect(groups[0].structureType).toBe("vertakt");
    expect(groups[0].structureSummary).toContain("3 automations gaan naar Target");
  });

  it("keeps group order stable when incoming rows are shuffled or confirmed changes", () => {
    const suggestions = [
      makeSuggestie("x", "y", { fromNaam: "Xray", toNaam: "Yankee" }),
      makeSuggestie("a", "b", { fromNaam: "Alpha", toNaam: "Beta" }),
      makeSuggestie("b", "c", { fromNaam: "Beta", toNaam: "Charlie" }),
    ];

    const firstOrder = groupFlowSuggesties(suggestions).map((group) => group.id);
    const shuffledOrder = groupFlowSuggesties([...suggestions].reverse()).map((group) => group.id);
    const confirmedOrder = groupFlowSuggesties(
      [...suggestions].reverse().map((suggestie) =>
        suggestie.fromId === "a" ? { ...suggestie, confirmed: true } : suggestie,
      ),
    ).map((group) => group.id);

    expect(firstOrder).toEqual(["a__b__c", "x__y"]);
    expect(shuffledOrder).toEqual(firstOrder);
    expect(confirmedOrder).toEqual(firstOrder);
  });
});
