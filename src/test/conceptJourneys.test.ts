import { describe, expect, it } from "vitest";
import { buildConceptJourneys } from "@/lib/conceptJourneys";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";

function makeSuggestie(
  fromId: string,
  toId: string,
  overrides: Partial<FlowSuggestie> & Record<string, unknown> = {},
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
    expect(journeys[0].structureSummary).toContain("directe webhook-overdracht");
  });

  it("extends concept journeys through downstream webhook matches without collapsing GitLab nodes", () => {
    const journeys = buildConceptJourneys([
      makeSuggestie("hubspot", "gitlab-a", {
        fromNaam: "Create client workflow",
        toNaam: "Create client endpoint (POST /clients/create)",
        redenering: "Webhook-match: HubSpot roept endpoint /clients/create aan.",
      }),
      makeSuggestie("gitlab-a", "gitlab-b", {
        fromNaam: "Create client endpoint",
        fromSource: "gitlab",
        toNaam: "Sync client to WeFact (POST /wefact/upsert-client)",
        toSource: "gitlab",
        zekerheid: "webhook",
        redenering: "Webhook-match: GitLab roept endpoint /wefact/upsert-client aan.",
      }),
    ]);

    expect(journeys).toHaveLength(1);
    expect(journeys[0].automationIds).toEqual(["hubspot", "gitlab-a", "gitlab-b"]);
    expect(journeys[0].automationCount).toBe(3);
    expect(journeys[0].transitionCount).toBe(2);
    expect(journeys[0].confidenceLabel).toBe("2x 100% webhook");
    expect(journeys[0].gitlabWorker).toBe("Sync client to WeFact");
    expect(journeys[0].description).not.toContain("backendblok");
    expect(journeys[0].href).toBe("/flows/suggesties/hubspot__gitlab-a__gitlab-b");
  });

  it("keeps Zapier in the middle of a webhook-proven graph", () => {
    const journeys = buildConceptJourneys([
      makeSuggestie("hubspot", "zapier", {
        fromNaam: "HubSpot deal workflow",
        toNaam: "Deal enrichment Zap",
        toCategorie: "Zapier Zap",
        toSource: "zapier",
        redenering: "Webhook-match: HubSpot roept endpoint /hooks/deal aan.",
      }),
      makeSuggestie("zapier", "gitlab", {
        fromNaam: "Deal enrichment Zap",
        fromCategorie: "Zapier Zap",
        fromSource: "zapier",
        toNaam: "Deal enrichment endpoint (POST /hooks/enrich-deal)",
        toSource: "gitlab",
        redenering: "Webhook-match: Zapier roept endpoint /hooks/enrich-deal aan.",
      }),
    ]);

    expect(journeys).toHaveLength(1);
    expect(journeys[0].automationIds).toEqual(["hubspot", "zapier", "gitlab"]);
    expect(journeys[0].automationCount).toBe(3);
    expect(journeys[0].transitionCount).toBe(2);
    expect(journeys[0].description).toContain("HubSpot");
    expect(journeys[0].description).toContain("Zapier");
  });

  it("supports branching webhook graphs as one concept journey", () => {
    const journeys = buildConceptJourneys([
      makeSuggestie("hubspot", "gitlab-a", {
        fromNaam: "Create new deal",
        toNaam: "New create deal",
        redenering: "Webhook-match: HubSpot roept endpoint /operations/hubspot/create_new_deal aan.",
      }),
      makeSuggestie("hubspot", "zapier", {
        fromNaam: "Create new deal",
        toNaam: "Notify sales Zap",
        toCategorie: "Zapier Zap",
        toSource: "zapier",
        redenering: "Webhook-match: HubSpot roept endpoint /hooks/notify-sales aan.",
      }),
      makeSuggestie("zapier", "gitlab-b", {
        fromNaam: "Notify sales Zap",
        fromCategorie: "Zapier Zap",
        fromSource: "zapier",
        toNaam: "Sales notification endpoint",
        toSource: "gitlab",
        redenering: "Webhook-match: Zapier roept endpoint /hooks/sales-notification aan.",
      }),
    ]);

    expect(journeys).toHaveLength(1);
    expect(journeys[0].automationIds).toEqual(["hubspot", "gitlab-a", "zapier", "gitlab-b"]);
    expect(journeys[0].automationCount).toBe(4);
    expect(journeys[0].transitionCount).toBe(3);
    expect(journeys[0].structureSummary).toContain("stuurt naar 2 automations");
  });

  it("does not merge independent start automations just because they share a receiver", () => {
    const journeys = buildConceptJourneys([
      makeSuggestie("hubspot-a", "gitlab-shared", {
        fromNaam: "Create new deal",
        toNaam: "HubSpot Operations API",
        redenering: "Webhook-match: HubSpot roept endpoint /operations/hubspot/create_new_deal aan.",
      }),
      makeSuggestie("hubspot-b", "gitlab-shared", {
        fromNaam: "Name Change of Contact",
        toNaam: "HubSpot Operations API",
        redenering: "Webhook-match: HubSpot roept endpoint /operations/hubspot/contact/updating_dealname aan.",
      }),
    ]);

    expect(journeys).toHaveLength(2);
    expect(journeys.map((journey) => journey.automationIds)).toEqual([
      ["hubspot-a", "gitlab-shared"],
      ["hubspot-b", "gitlab-shared"],
    ]);
  });

  it("prefers the active specific endpoint over an inactive generic GitLab file for the same webhook path", () => {
    const journeys = buildConceptJourneys([
      makeSuggestie("AUTO-HS-1699666192", "AUTO-044", {
        fromNaam: "Create new deal",
        fromSource: "hubspot",
        toNaam: "HubSpot Operations API",
        toSource: "gitlab",
        toStatus: "Uitgeschakeld",
        redenering: "Webhook-match: HubSpot roept endpoint /operations/hubspot/create_new_deal aan.",
      }),
      makeSuggestie("AUTO-HS-1699666192", "AUTO-GL-88cf40e9-9423-4911-858c-24070ea6299c", {
        fromNaam: "Create new deal",
        fromSource: "hubspot",
        toNaam: "New create deal (POST /operations/hubspot/create_new_deal)",
        toSource: "gitlab",
        toStatus: "Actief",
        redenering: "Webhook-match: HubSpot roept endpoint /operations/hubspot/create_new_deal aan.",
      }),
    ]);

    expect(journeys).toHaveLength(1);
    expect(journeys[0].automationIds).toEqual([
      "AUTO-HS-1699666192",
      "AUTO-GL-88cf40e9-9423-4911-858c-24070ea6299c",
    ]);
    expect(journeys[0].automationIds).not.toContain("AUTO-044");
    expect(journeys[0].automationCount).toBe(2);
    expect(journeys[0].transitionCount).toBe(1);
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
    expect(journeys[0].confidenceLabel).toBe("100% webhook");
    expect(journeys[0].automationCount).toBe(2);
    expect(journeys[0].transitionCount).toBe(1);
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
    expect(journeys[0].description).toContain("2 automations");
    expect(journeys[0].description).toContain("Zapier, GitLab");
    expect(journeys[0].endpoint).toBe("/sales/leads/hubspot/trustoo");
  });

  it("groups parallel Zapier starters when they call the same GitLab endpoint", () => {
    const journeys = buildConceptJourneys([
      makeSuggestie("zapier-trustoo-utrecht", "gitlab-trustoo", {
        fromNaam: "Trustoo Leads - Utrecht",
        fromSource: "zapier",
        toNaam: "Leads trustoo (POST /sales/leads/hubspot/trustoo)",
        redenering: "Webhook-match: Zapier roept endpoint /sales/leads/hubspot/trustoo aan.",
      }),
      makeSuggestie("zapier-trustoo-tilburg", "gitlab-trustoo", {
        fromNaam: "Trustoo Leads - Tilburg",
        fromSource: "zapier",
        toNaam: "Leads trustoo (POST /sales/leads/hubspot/trustoo)",
        redenering: "Webhook-match: Zapier roept endpoint /sales/leads/hubspot/trustoo aan.",
      }),
      makeSuggestie("zapier-trustoo-rotterdam", "gitlab-trustoo", {
        fromNaam: "Trustoo Leads - Rotterdam",
        fromSource: "zapier",
        toNaam: "Leads trustoo (POST /sales/leads/hubspot/trustoo)",
        redenering: "Webhook-match: Zapier roept endpoint /sales/leads/hubspot/trustoo aan.",
      }),
    ]);

    expect(journeys).toHaveLength(1);
    expect(journeys[0].automationIds).toEqual([
      "zapier-trustoo-utrecht",
      "zapier-trustoo-tilburg",
      "zapier-trustoo-rotterdam",
      "gitlab-trustoo",
    ]);
    expect(journeys[0].automationCount).toBe(4);
    expect(journeys[0].transitionCount).toBe(3);
    expect(journeys[0].title).toBe("3 parallelle starters -> Leads trustoo");
    expect(journeys[0].structureSummary).toContain("komen parallel samen bij Leads trustoo");
  });

  it("renders a Typeform to GitLab webhook match as a concept journey", () => {
    const journeys = buildConceptJourneys([
      makeSuggestie("typeform-intake", "gitlab-intake", {
        fromNaam: "Intakeformulier",
        fromSource: "typeform",
        toNaam: "Process intake (POST /forms/intake)",
        redenering: "Webhook-match: Typeform geeft formulierinzending door aan endpoint /forms/intake.",
      }),
    ]);

    expect(journeys).toHaveLength(1);
    expect(journeys[0].automationIds).toEqual(["typeform-intake", "gitlab-intake"]);
    expect(journeys[0].sourceSystem).toBe("Typeform");
    expect(journeys[0].confidenceLabel).toBe("100% webhook");
  });

  it("ignores AI and non-webhook suggestions", () => {
    const journeys = buildConceptJourneys([
      makeSuggestie("hubspot", "gitlab", {
        zekerheid: "ai",
        redenering: "Naam lijkt op elkaar.",
      }),
    ]);

    expect(journeys).toEqual([]);
  });
});
