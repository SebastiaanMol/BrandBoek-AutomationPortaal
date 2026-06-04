import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConceptJourneyReviewList } from "@/components/flows/ConceptJourneyReviewList";
import { buildConceptJourneys } from "@/lib/conceptJourneys";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import type { Automatisering } from "@/lib/types";

function makeSuggestion(fromId: string, fromNaam: string): FlowSuggestie {
  return {
    fromId,
    toId: "gitlab-trustoo",
    fromNaam,
    toNaam: "Leads trustoo (POST /sales/leads/hubspot/trustoo)",
    fromCategorie: "Zapier Zap",
    toCategorie: "Backend Script",
    fromSource: "zapier",
    toSource: "gitlab",
    zekerheid: "webhook",
    redenering: "Webhook-match: Zapier roept endpoint /sales/leads/hubspot/trustoo aan.",
    confirmed: false,
    rejected: false,
  };
}

function makeGenericSuggestion(
  fromId: string,
  toId: string,
  overrides: Partial<FlowSuggestie>,
): FlowSuggestie {
  return {
    fromId,
    toId,
    fromNaam: fromId,
    toNaam: toId,
    fromCategorie: "HubSpot Workflow",
    toCategorie: "Backend Script",
    fromSource: "hubspot",
    toSource: "gitlab",
    zekerheid: "webhook",
    redenering: "Webhook-match: bron roept endpoint /endpoint aan.",
    confirmed: false,
    rejected: false,
    ...overrides,
  };
}

function makeAutomation(id: string, naam: string, source: Automatisering["source"]): Automatisering {
  return {
    id,
    naam,
    categorie: source === "zapier" ? "Zapier Zap" : "Backend Script",
    doel: "",
    trigger: "",
    systemen: [],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-29T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    source,
  };
}

describe("ConceptJourneyReviewList", () => {
  it("renders same-endpoint fan-in as parallel first-step starters", () => {
    const journeys = buildConceptJourneys([
      makeSuggestion("zapier-trustoo-utrecht", "Trustoo Leads - Utrecht"),
      makeSuggestion("zapier-trustoo-tilburg", "Trustoo Leads - Tilburg"),
      makeSuggestion("zapier-trustoo-rotterdam", "Trustoo Leads - Rotterdam"),
    ]);
    const automationMap = new Map<string, Automatisering>([
      ["zapier-trustoo-utrecht", makeAutomation("zapier-trustoo-utrecht", "Trustoo Leads - Utrecht", "zapier")],
      ["zapier-trustoo-tilburg", makeAutomation("zapier-trustoo-tilburg", "Trustoo Leads - Tilburg", "zapier")],
      ["zapier-trustoo-rotterdam", makeAutomation("zapier-trustoo-rotterdam", "Trustoo Leads - Rotterdam", "zapier")],
      ["gitlab-trustoo", makeAutomation("gitlab-trustoo", "Leads trustoo (POST /sales/leads/hubspot/trustoo)", "gitlab")],
    ]);

    render(
      <ConceptJourneyReviewList
        journeys={journeys}
        automationMap={automationMap}
        onOpenJourney={vi.fn()}
      />,
    );

    const card = screen.getByRole("article", { name: /3 parallelle starters/i });
    within(card).getByText("Parallelle starters");
    within(card).getByText("Trustoo Leads - Utrecht");
    within(card).getByText("Trustoo Leads - Tilburg");
    within(card).getByText("Trustoo Leads - Rotterdam");
    within(card).getByText("Leads trustoo");
    within(card).getByText("zelfde endpoint");
  });

  it("renders same-start fan-out as one start automation with multiple backend targets", () => {
    const journeys = buildConceptJourneys([
      makeGenericSuggestion("hubspot-correct-stage", "gitlab-prereqs", {
        fromNaam: "Correct Stage IB",
        toNaam: "Ib prereqs webhook",
        redenering: "Webhook-match: HubSpot roept endpoint /properties/ib/prereqs_webhook aan.",
      }),
      makeGenericSuggestion("hubspot-correct-stage", "gitlab-route", {
        fromNaam: "Correct Stage IB",
        toNaam: "Ib route after typeform and machtiging",
        redenering: "Webhook-match: HubSpot roept endpoint /properties/ib/route_after_typeform aan.",
      }),
    ]);
    const automationMap = new Map<string, Automatisering>([
      ["hubspot-correct-stage", makeAutomation("hubspot-correct-stage", "Correct Stage IB", "hubspot")],
      ["gitlab-prereqs", makeAutomation("gitlab-prereqs", "Ib prereqs webhook", "gitlab")],
      ["gitlab-route", makeAutomation("gitlab-route", "Ib route after typeform and machtiging", "gitlab")],
    ]);

    render(
      <ConceptJourneyReviewList
        journeys={journeys}
        automationMap={automationMap}
        onOpenJourney={vi.fn()}
      />,
    );

    const card = screen.getByRole("article", { name: /Correct Stage IB/i });
    within(card).getByText("Een startautomation");
    within(card).getByText("Meerdere bewezen vervolgen");
    expect(within(card).getAllByText("Correct Stage IB")).toHaveLength(1);
    within(card).getByText("Ib prereqs webhook");
    within(card).getByText("Ib route after typeform and machtiging");
    within(card).getByText("2 endpoints");
  });
});
