import { describe, expect, it } from "vitest";

import {
  extractHubSpotWebhookInfo,
  extractHubSpotWebhookPath,
  extractHubSpotWebhookPaths,
  extractHubSpotWebhookUrl,
} from "../../supabase/functions/_shared/hubspot-webhook-url";

describe("HubSpot webhook URL extraction", () => {
  it("extracts a native workflow webhook URL from the top-level action", () => {
    const action = {
      type: "WEBHOOK",
      url: "https://api.example.test/operations/hubspot/create_new_deal?token=secret",
      method: "post",
    };

    expect(extractHubSpotWebhookUrl(action)).toBe(
      "https://api.example.test/operations/hubspot/create_new_deal?token=secret",
    );
    expect(extractHubSpotWebhookPath(action)).toBe("/operations/hubspot/create_new_deal");
    expect(extractHubSpotWebhookInfo(action)).toMatchObject({
      method: "POST",
      path: "/operations/hubspot/create_new_deal",
    });
  });

  it("extracts nested webhook fields from HubSpot action payloads", () => {
    const action = {
      actionType: "WEBHOOK",
      fields: {
        webhook_url: "https://api.example.test/properties/ib/finished_webhook",
      },
    };

    expect(extractHubSpotWebhookUrl(action)).toBe(
      "https://api.example.test/properties/ib/finished_webhook",
    );
    expect(extractHubSpotWebhookPath(action)).toBe("/properties/ib/finished_webhook");
  });

  it("extracts webhook URLs from HubSpot name/value field arrays", () => {
    const action = {
      type: "WEBHOOK",
      fields: [
        { name: "irrelevant", value: "nope" },
        { name: "webhook_url", value: "https://api.example.test/hooks/from-field-array" },
      ],
    };

    expect(extractHubSpotWebhookPath(action)).toBe("/hooks/from-field-array");
  });

  it("extracts custom workflow action URLs when HubSpot exposes actionUrl", () => {
    const action = {
      type: "SINGLE_CONNECTION",
      actionTypeId: "123-456",
      fields: {
        actionUrl: "https://api.example.test/typeform/client-intake",
      },
    };

    expect(extractHubSpotWebhookUrl(action)).toBe(
      "https://api.example.test/typeform/client-intake",
    );
    expect(extractHubSpotWebhookPath(action)).toBe("/typeform/client-intake");
  });

  it("prefers custom actionUrl over a generic action URL on non-webhook actions", () => {
    const action = {
      type: "SINGLE_CONNECTION",
      url: "https://app.hubspot.com/workflows/6108551/platform/flow/123/edit",
      fields: {
        actionUrl: "https://api.example.test/operations/hubspot/customer-created",
      },
    };

    expect(extractHubSpotWebhookUrl(action)).toBe(
      "https://api.example.test/operations/hubspot/customer-created",
    );
    expect(extractHubSpotWebhookPath(action)).toBe("/operations/hubspot/customer-created");
  });

  it("supports path-only webhook values without keeping query secrets", () => {
    const action = {
      type: "WEBHOOK",
      webhookUrl: "/properties/ib/finished_webhook?token=secret",
    };

    expect(extractHubSpotWebhookPath(action)).toBe("/properties/ib/finished_webhook");
  });

  it("does not treat normal non-webhook action URLs as webhook handoffs", () => {
    const action = {
      type: "SEND_EMAIL",
      url: "https://app.hubspot.com/email/123",
    };

    expect(extractHubSpotWebhookUrl(action)).toBeNull();
    expect(extractHubSpotWebhookPath(action)).toBeNull();
  });

  it("returns unique webhook paths and skips root URLs", () => {
    const actions = [
      { type: "WEBHOOK", url: "https://api.example.test/" },
      { type: "WEBHOOK", url: "https://api.example.test/hooks/lead" },
      { type: "WEBHOOK", fields: { webhookUrl: "https://api.example.test/hooks/lead?x=1" } },
      { type: "WEBHOOK", fields: { webhook_url: "/hooks/deal" } },
    ];

    expect(extractHubSpotWebhookPaths(actions)).toEqual(["/hooks/lead", "/hooks/deal"]);
  });
});
