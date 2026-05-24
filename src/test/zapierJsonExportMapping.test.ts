import { describe, expect, it } from "vitest";
import {
  mapZapierExportToAutomationPayloads,
  sanitizeZapierValue,
} from "../../supabase/functions/_shared/zapier-readonly";

const exportedZap = {
  metadata: { version: "gdpr_v1" },
  zaps: [{
    id: 216329292,
    title: "Trustoo Leads - Rotterdam",
    status: "on",
    nodes: {
      "216329292": {
        id: 216329292,
        parent_id: null,
        root_id: null,
        type_of: "read",
        action: "lead",
        selected_api: "App187957CLIAPI@1.1.1",
        title: "Trustoo Leads - Rotterdam",
        params: {},
        meta: { timezone: "Europe/Amsterdam" },
      },
      "216329293": {
        id: 216329293,
        parent_id: 216329292,
        root_id: 216329292,
        type_of: "write",
        action: "post",
        selected_api: "WebHookCLIAPI@1.0.29",
        title: null,
        params: {
          url: "https://composed-month-production.up.railway.app/sales/leads/hubspot/trustoo",
          headers: { "X-API-Key": "secret-value" },
        },
        meta: { stepTitle: "POST in Webhooks by Zapier" },
      },
    },
  }],
};

const exportedEmailZap = {
  metadata: { version: "gdpr_v1" },
  zaps: [{
    id: 231364342,
    title: "Geen gehoor 1: Telefonische mail",
    status: "on",
    nodes: {
      "231364342": {
        id: 231364342,
        parent_id: null,
        root_id: null,
        type_of: "read",
        action: "updated_deal_stage",
        selected_api: "HubSpotCLIAPI@1.14.0",
        title: "Geen gehoor 1: Telefonische mail",
        params: { pipeline: "802700718", dealstage: "1180703134" },
        meta: { timezone: "Europe/Amsterdam", parammap: {} },
      },
      "231364343": {
        id: 231364343,
        parent_id: 231364342,
        root_id: 231364342,
        type_of: "search",
        action: "find_associations",
        selected_api: "HubSpotCLIAPI@1.14.0",
        params: {
          fromObjectType: "deal",
          toObjectType0: "contact",
          fromObjectId: "{{231364342__dealId}}",
        },
        meta: { parammap: {} },
      },
      "231365105": {
        id: 231365105,
        parent_id: 231364343,
        root_id: 231364342,
        type_of: "write",
        action: "get_contact_by_id",
        selected_api: "HubSpotCLIAPI@1.14.0",
        params: {
          id: "{{231364343__deal_to_contact}}",
          properties_to_retrieve: ["taal2"],
        },
        meta: { parammap: { properties_to_retrieve: ["Contact information: Voertaal"] } },
      },
      "350928057": {
        id: 350928057,
        parent_id: 231365105,
        root_id: 231364342,
        type_of: "write",
        action: "branch",
        selected_api: "BranchingAPI",
        params: {},
        meta: {},
      },
      "350928058": {
        id: 350928058,
        parent_id: 350928057,
        root_id: 231364342,
        type_of: "filter",
        action: "filter",
        selected_api: "BranchingAPI",
        title: "Nederlands",
        params: {
          filter_criteria: [{
            key: '{{=gives["231365105"]["taal2"]}}',
            value: "Nederlands",
            match: "iexact",
            action: "continue",
          }],
        },
        meta: { stepTitle: "Nederlands" },
      },
      "231365753": {
        id: 231365753,
        parent_id: 350928058,
        root_id: 231364342,
        type_of: "write",
        action: "send_email",
        selected_api: "MicrosoftOutlookCLIAPI@2.20.0",
        params: {
          sender: "hallo@brandboekhouders.nl",
          recipients: ["{{231365105__email}}"],
          subject: "Plan eenvoudig zelf je afspraak",
          body: '<a href="https://calendly.com/d/ckyy-sdg-g2y/introductie-gesprek">Plan</a><img src="https://example.com/logo.png">',
        },
        meta: {},
      },
      "350928059": {
        id: 350928059,
        parent_id: 350928057,
        root_id: 231364342,
        type_of: "filter",
        action: "filter",
        selected_api: "BranchingAPI",
        title: "Engels",
        params: {
          filter_criteria: [{
            key: '{{=gives["231365105"]["taal2"]}}',
            value: "Engels",
            match: "iexact",
            action: "continue",
          }],
        },
        meta: { stepTitle: "Engels" },
      },
      "350928060": {
        id: 350928060,
        parent_id: 350928059,
        root_id: 231364342,
        type_of: "write",
        action: "send_email",
        selected_api: "MicrosoftOutlookCLIAPI@2.20.0",
        params: {
          sender: "hallo@brandboekhouders.nl",
          recipients: ["{{231365105__email}}"],
          subject: "Easily schedule your appointment",
        },
        meta: {},
      },
    },
  }],
};

describe("Zapier JSON export mapping", () => {
  it("maps each exported Zap to a separate read-only automation payload", () => {
    const payloads = mapZapierExportToAutomationPayloads(exportedZap, "2026-05-19T10:00:00.000Z");

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      source: "zapier",
      categorie: "Zapier Zap",
      external_id: "216329292",
      naam: "Trustoo Leads - Rotterdam",
      status: "Actief",
    });
    expect(payloads[0].systemen).toEqual(["Zapier", "Trustoo", "Webhooks by Zapier"]);
    expect(payloads[0].webhook_paths).toEqual(["/sales/leads/hubspot/trustoo"]);
    expect(payloads[0].import_proposal.read_only).toBe(true);
  });

  it("does not expose secrets in mapped payloads", () => {
    const [payload] = mapZapierExportToAutomationPayloads(exportedZap, "2026-05-19T10:00:00.000Z");
    const text = JSON.stringify(payload);

    expect(text).not.toContain("secret-value");
    expect(text).toContain("\"X-API-Key\":\"[redacted]\"");
  });

  it("keeps raw CLI/API names out of main user-facing fields", () => {
    const [payload] = mapZapierExportToAutomationPayloads(exportedZap, "2026-05-19T10:00:00.000Z");
    const visibleText = [payload.doel, payload.trigger_beschrijving, ...payload.stappen].join("\n");

    expect(visibleText).not.toMatch(/CLIAPI@/);
    expect(visibleText).not.toContain("POST");
    expect(visibleText).toContain("Webhooks by Zapier");
  });

  it("extracts rich process details from HubSpot-triggered email Zaps", () => {
    const [payload] = mapZapierExportToAutomationPayloads(exportedEmailZap, "2026-05-19T10:00:00.000Z");

    expect(payload.trigger_beschrijving).toContain("HubSpot-dealfase");
    expect(payload.doel).toContain("stuurt daarna een Outlook-mail");
    expect(payload.webhook_paths).toEqual([]);
    expect(payload.stappen).toEqual([
      "1. Start wanneer een HubSpot-deal deze Zap activeert: Geen gehoor 1: Telefonische mail.",
      "2. Zoekt het gekoppelde contact bij de HubSpot-deal.",
      "3. Haalt contactgegevens op: Contact information: Voertaal.",
      "4. Splitst de Zap in meerdere paden.",
      "5. Gaat door via pad \"Nederlands\" wanneer taal2 gelijk is aan Nederlands.",
      "6. Stuurt Outlook-mail \"Plan eenvoudig zelf je afspraak\".",
      "7. Gaat door via pad \"Engels\" wanneer taal2 gelijk is aan Engels.",
      "8. Stuurt Outlook-mail \"Easily schedule your appointment\".",
    ]);
    expect(payload.import_proposal.zap.process).toMatchObject({
      trigger: "Start wanneer een HubSpot-deal deze Zap activeert: Geen gehoor 1: Telefonische mail.",
      outcome: "Zapier stuurt 2 Outlook-mails, afhankelijk van de voorwaarden in de Zap.",
      conditions: [
        'Gaat door via pad "Nederlands" wanneer taal2 gelijk is aan Nederlands.',
        'Gaat door via pad "Engels" wanneer taal2 gelijk is aan Engels.',
      ],
      emails: [
        { subject: "Plan eenvoudig zelf je afspraak" },
        { subject: "Easily schedule your appointment" },
      ],
    });
  });

  it("describes Trustoo webhook Zaps as lead handoffs instead of empty automations", () => {
    const [payload] = mapZapierExportToAutomationPayloads(exportedZap, "2026-05-19T10:00:00.000Z");

    expect(payload.doel).toContain("Trustoo-lead");
    expect(payload.trigger_beschrijving).toBe("Zapier trigger: nieuwe lead vanuit Trustoo");
    expect(payload.stappen).toEqual([
      "1. Ontvangt een nieuwe lead vanuit Trustoo.",
      "2. Geeft gegevens door aan de backend via /sales/leads/hubspot/trustoo.",
    ]);
    expect(payload.import_proposal.zap.process).toMatchObject({
      trigger: "Ontvangt een nieuwe lead vanuit Trustoo.",
      outcome: "Zapier geeft gegevens door aan de backend via /sales/leads/hubspot/trustoo.",
      webhookHandoffs: [{ method: "POST", path: "/sales/leads/hubspot/trustoo" }],
    });
  });

  it("recursively redacts sensitive keys", () => {
    expect(sanitizeZapierValue({
      token: "abc",
      headers: { Authorization: "Bearer secret", safe: "ok" },
      nested: { password: "def", safe: "ok" },
      list: [{ Authorization: "Bearer secret", "X-API-Key": "api-secret" }],
      auth: "oauth-secret",
      secret: "shh",
      api_key: "api-key-secret",
      apiKey: "camel-api-key-secret",
      apikey: "flat-api-key-secret",
      private_key: "private-key-secret",
      privateKey: "camel-private-key-secret",
      cookie: "cookie-secret",
      session: "session-secret",
      access_token: "access-secret",
      refresh_token: "refresh-secret",
      client_secret: "client-secret",
    })).toEqual({
      token: "[redacted]",
      headers: { Authorization: "[redacted]", safe: "ok" },
      nested: { password: "[redacted]", safe: "ok" },
      list: [{ Authorization: "[redacted]", "X-API-Key": "[redacted]" }],
      auth: "[redacted]",
      secret: "[redacted]",
      api_key: "[redacted]",
      apiKey: "[redacted]",
      apikey: "[redacted]",
      private_key: "[redacted]",
      privateKey: "[redacted]",
      cookie: "[redacted]",
      session: "[redacted]",
      access_token: "[redacted]",
      refresh_token: "[redacted]",
      client_secret: "[redacted]",
    });
  });
});
