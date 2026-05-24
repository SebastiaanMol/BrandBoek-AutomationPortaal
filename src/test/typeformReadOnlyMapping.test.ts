import { describe, expect, it } from "vitest";
import {
  mapTypeformFormToAutomationPayload,
  normalizeTypeformWebhookUrl,
  typeformReadOnlyHeaders,
} from "../../supabase/functions/_shared/typeform-readonly";

describe("Typeform read-only mapping", () => {
  it("maps a form with details and active webhooks into a rich automation payload", () => {
    const payload = mapTypeformFormToAutomationPayload({
      form: {
        id: "abc123",
        title: "IB aanvullende informatie",
        _links: { display: "https://brandboekhouders.typeform.com/to/abc123" },
      },
      detail: {
        id: "abc123",
        title: "IB aanvullende informatie",
        hidden: ["deal_id", "contact_id"],
        fields: [
          { id: "field-1", ref: "ib_jaar", title: "Voor welk jaar is de IB?", type: "number" },
          {
            id: "field-2",
            ref: "machtiging",
            title: "Is de machtiging actief?",
            type: "multiple_choice",
            properties: {
              choices: [
                { id: "yes", label: "Ja" },
                { id: "no", label: "Nee" },
              ],
            },
          },
        ],
      },
      webhooks: [
        {
          tag: "brand-backend",
          enabled: true,
          event_types: { form_response: true },
          url: "https://automation.brandboekhouders.nl/typeform/onboarding",
          secret: "never-store-me",
          verify_ssl: true,
        },
        {
          tag: "disabled-hook",
          enabled: false,
          event_types: { form_response: true },
          url: "https://automation.brandboekhouders.nl/disabled",
          secret: "also-secret",
        },
      ],
    }, "2026-05-21T10:00:00.000Z");

    expect(payload.source).toBe("typeform");
    expect(payload.categorie).toBe("Typeform");
    expect(payload.status).toBe("Actief");
    expect(payload.systemen).toEqual(["Typeform", "Backend"]);
    expect(payload.webhook_paths).toEqual(["/typeform/onboarding"]);
    expect(payload.import_proposal.webhookPaths).toEqual(["/typeform/onboarding"]);
    expect(payload.import_proposal.read_only).toBe(true);
    expect(payload.import_proposal.typeform.form.fields).toEqual([
      { id: "field-1", ref: "ib_jaar", title: "Voor welk jaar is de IB?", type: "number" },
      {
        id: "field-2",
        ref: "machtiging",
        title: "Is de machtiging actief?",
        type: "multiple_choice",
        choices: ["Ja", "Nee"],
      },
    ]);
    expect(payload.import_proposal.typeform.form.hidden_fields).toEqual(["deal_id", "contact_id"]);
    expect(payload.import_proposal.typeform.webhooks).toEqual([
      {
        tag: "brand-backend",
        enabled: true,
        eventTypes: ["form_response"],
        path: "/typeform/onboarding",
        host: "automation.brandboekhouders.nl",
      },
      {
        tag: "disabled-hook",
        enabled: false,
        eventTypes: ["form_response"],
        path: "/disabled",
        host: "automation.brandboekhouders.nl",
      },
    ]);
    expect(payload.doel).toContain("read-only");
    expect(payload.doel).not.toMatch(/POST|endpoint|handler|\/typeform\/onboarding/i);
    expect(JSON.stringify(payload)).not.toContain("never-store-me");
    expect(JSON.stringify(payload)).not.toContain("also-secret");
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("responses");
  });

  it("marks forms without active webhooks as a read-only form automation without process handoff", () => {
    const payload = mapTypeformFormToAutomationPayload({
      form: { id: "nohook", title: "Los formulier" },
      detail: { id: "nohook", title: "Los formulier", fields: [] },
      webhooks: [],
    }, "2026-05-21T10:00:00.000Z");

    expect(payload.status).toBe("Actief");
    expect(payload.webhook_paths).toEqual([]);
    expect(payload.trigger_beschrijving).toContain("Typeform formulier");
    expect(payload.import_proposal.typeform.process.webhookHandoffs).toEqual([]);
  });

  it("normalizes webhook URLs to safe host and path evidence", () => {
    expect(normalizeTypeformWebhookUrl("https://example.test/api/typeform/onboarding?token=secret")).toEqual({
      host: "example.test",
      path: "/api/typeform/onboarding",
    });
    expect(normalizeTypeformWebhookUrl("/relative/path?x=1")).toEqual({
      path: "/relative/path",
    });
  });

  it("uses bearer auth for Typeform read-only requests", () => {
    expect(typeformReadOnlyHeaders("tfp_token")).toEqual({
      Accept: "application/json",
      Authorization: "Bearer tfp_token",
    });
  });
});
