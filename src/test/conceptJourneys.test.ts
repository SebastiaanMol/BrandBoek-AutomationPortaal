import { describe, expect, it } from "vitest";
import { buildConceptJourneys } from "@/lib/conceptJourneys";
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
    fromCategorie: "Workflow",
    toCategorie: "Backend Script",
    fromSource: "hubspot",
    toSource: "gitlab",
    zekerheid: "webhook",
    redenering: "/backend/endpoint",
    confirmed: false,
    rejected: false,
    ...overrides,
  };
}

describe("buildConceptJourneys", () => {
  it("does not extend concept journeys with inferred GitLab backend links", () => {
    const journeys = buildConceptJourneys([
      makeSuggestie("hubspot", "gitlab-a", {
        fromNaam: "BTW 2 maanden geboekt",
        toNaam: "HubSpot Eigenschappen Automatisering",
        redenering: "/properties/btw/update_next_quarter_prev2m",
      }),
      makeSuggestie("gitlab-a", "gitlab-b", {
        fromNaam: "HubSpot Eigenschappen Automatisering",
        fromSource: "gitlab",
        toNaam: "Synchronisatie openstaand bedrag",
        toSource: "gitlab",
        zekerheid: "ai",
        redenering: "vervolgstap in backendblok",
      }),
    ]);

    expect(journeys).toHaveLength(1);
    expect(journeys[0].automationIds).toEqual(["hubspot", "gitlab-a"]);
    expect(journeys[0].gitlabWorker).toBe("HubSpot Eigenschappen Automatisering");
    expect(journeys[0].href).toBe("/flows/suggesties/hubspot__gitlab-a");
    expect(journeys[0].structureSummary).toContain("direct gekoppeld");
  });

  it("still renders a single HubSpot to GitLab webhook as one concept journey", () => {
    const journeys = buildConceptJourneys([
      makeSuggestie("hubspot", "gitlab", {
        fromNaam: "Name Change of Contact",
        toNaam: "Contact change endpoint (POST /operations/hubspot/contact/updating_dealname)",
        redenering: "/operations/hubspot/contact/updating_dealname",
      }),
    ]);

    expect(journeys).toHaveLength(1);
    expect(journeys[0].automationIds).toEqual(["hubspot", "gitlab"]);
    expect(journeys[0].gitlabWorker).toBe("Contact change endpoint");
    expect(journeys[0].confidenceLabel).toBe("Webhook");
  });

  it("renders a Zapier to GitLab webhook match as a concept journey", () => {
    const journeys = buildConceptJourneys([
      makeSuggestie("zapier-trustoo-utrecht", "gitlab-trustoo", {
        fromNaam: "Trustoo Leads - Utrecht",
        fromSource: "zapier",
        toNaam: "Leads trustoo (POST /sales/leads/hubspot/trustoo)",
        redenering: "Webhook-match: Zapier roept endpoint /sales/leads/hubspot/trustoo aan.",
      }),
    ]);

    expect(journeys).toHaveLength(1);
    expect(journeys[0].automationIds).toEqual(["zapier-trustoo-utrecht", "gitlab-trustoo"]);
    expect(journeys[0].sourceSystem).toBe("Zapier");
    expect(journeys[0].description).toContain("roept Zapier een backend automation aan");
    expect(journeys[0].endpoint).toBe("/sales/leads/hubspot/trustoo");
  });
});
