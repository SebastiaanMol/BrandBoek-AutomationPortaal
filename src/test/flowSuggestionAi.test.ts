import { describe, expect, it } from "vitest";
import {
  buildAcceptedFlowDescriptionFromAiResult,
  parseFlowSuggestionAiResult,
  sanitizeForPrompt,
} from "@/lib/flowSuggestionAi";

describe("flowSuggestionAi", () => {
  it("parses allowed descriptive AI fields", () => {
    const result = parseFlowSuggestionAiResult(
      JSON.stringify({
        title: "Lead intake verwerken",
        summary: "Een Typeform inzending wordt verwerkt en in HubSpot opgevolgd.",
        businessObject: "Lead",
        processSteps: [
          "Bezoeker vult het formulier in.",
          "Backend verwerkt de leadgegevens.",
        ],
        changeSummary: ["HubSpot wordt bijgewerkt met de leadstatus."],
        reviewNotes: ["Controleer of de eigenaar van de opvolging klopt."],
        aiSuggestions: [
          {
            label: "Lifecycle-fase",
            description: "Waarschijnlijk lead intake.",
            severity: "warning",
          },
        ],
        openQuestions: ["Wie is eigenaar van de opvolging?"],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected parse success");
    expect(result.value.title).toBe("Lead intake verwerken");
    expect(result.value.aiSuggestions[0]).toMatchObject({
      label: "Lifecycle-fase",
      tag: "AI-voorstel",
    });
  });

  it("ignores proof-sensitive fields and reports them", () => {
    const result = parseFlowSuggestionAiResult(
      JSON.stringify({
        title: "Procesreis",
        confirmedTransitions: [{ fromId: "a", toId: "b" }],
        approvalStatus: "approved",
        webhookEvidence: ["fake"],
        sourceAutomationId: "a",
        targetAutomationId: "b",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected parse success");
    expect(result.value.ignoredFields).toEqual([
      "confirmedTransitions",
      "approvalStatus",
      "webhookEvidence",
      "sourceAutomationId",
      "targetAutomationId",
    ]);
    expect(result.value.title).toBe("Procesreis");
  });

  it("returns a readable error for invalid JSON", () => {
    const result = parseFlowSuggestionAiResult("dit is geen json");

    expect(result).toEqual({
      ok: false,
      error: "Plak geldige JSON uit de AI-output.",
    });
  });

  it("redacts secrets before prompt generation", () => {
    const sanitized = sanitizeForPrompt({
      token: "secret-token",
      nested: {
        authorization: "Bearer x",
        safe: "visible",
      },
    });

    expect(sanitized).toEqual({
      token: "[REDACTED]",
      nested: {
        authorization: "[REDACTED]",
        safe: "visible",
      },
    });
  });

  it("redacts common auth and session keys before prompt generation", () => {
    const sanitized = sanitizeForPrompt({
      auth: "basic-secret",
      cookie: "session-cookie",
      session: "session-id",
      privateKey: "private-key",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      clientSecret: "client-secret",
      nested: {
        headers: {
          "x-auth-token": "header-token",
        },
      },
    });

    expect(sanitized).toEqual({
      auth: "[REDACTED]",
      cookie: "[REDACTED]",
      session: "[REDACTED]",
      privateKey: "[REDACTED]",
      accessToken: "[REDACTED]",
      refreshToken: "[REDACTED]",
      clientSecret: "[REDACTED]",
      nested: {
        headers: {
          "x-auth-token": "[REDACTED]",
        },
      },
    });
  });

  it("builds a flow description from accepted AI result without proof language", () => {
    const description = buildAcceptedFlowDescriptionFromAiResult({
      title: "Lead intake",
      summary: "Een formulierinzending wordt verwerkt.",
      businessObject: "Lead",
      processSteps: ["Formulier komt binnen.", "HubSpot wordt bijgewerkt."],
      changeSummary: ["Leadstatus verandert."],
      reviewNotes: ["Controleer eigenaar."],
      aiSuggestions: [
        {
          label: "Vervolg",
          description: "Mogelijke latere workflow.",
          severity: "warning",
          tag: "AI-voorstel",
        },
      ],
      openQuestions: ["Is er een vervolgworkflow?"],
      ignoredFields: [],
    });

    expect(description).toContain("Een formulierinzending wordt verwerkt.");
    expect(description).toContain("Processtappen");
    expect(description).toContain("AI-voorstellen, niet bewezen");
    expect(description).not.toContain("confirmedTransitions");
  });
});
