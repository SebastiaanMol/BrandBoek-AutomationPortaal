import { describe, expect, it } from "vitest";
import { findNextProcessJourney } from "@/lib/processJourneyLinks";
import type { Flow } from "@/lib/types";

function makeFlow(overrides: Partial<Flow>): Flow {
  return {
    id: "flow",
    naam: "Procesreis",
    beschrijving: "",
    systemen: ["HubSpot"],
    automationIds: [],
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("findNextProcessJourney", () => {
  it("links to a saved process journey when a confirmed transition points outside the current journey", () => {
    const current = makeFlow({
      id: "current",
      naam: "Current journey",
      automationIds: ["hs-start", "gl-worker"],
    });
    const next = makeFlow({
      id: "next",
      naam: "Next journey",
      automationIds: ["hs-next", "gl-next"],
    });

    const result = findNextProcessJourney(current, [current, next], [
      { sourceId: "gl-worker", targetId: "hs-next" },
    ]);

    expect(result).toEqual({
      title: "Next journey",
      href: "/flows/next",
      reason: "Deze procesreis begint met een automation die door de huidige procesreis wordt geraakt.",
      confidence: "confirmed",
    });
  });

  it("does not invent a next journey when there is no confirmed outside transition", () => {
    const current = makeFlow({
      id: "current",
      automationIds: ["hs-start", "gl-worker"],
    });

    expect(findNextProcessJourney(current, [current], [])).toBeNull();
  });
});
