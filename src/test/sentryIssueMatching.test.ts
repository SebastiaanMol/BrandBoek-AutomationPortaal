import { describe, expect, it } from "vitest";
import {
  buildSentryIssueSummary,
  matchSentryIssuesToAutomations,
  type PortalSentryIssue,
} from "@/lib/sentryIssueMatching";
import type { Automatisering } from "@/lib/types";

function makeAutomation(overrides: Partial<Automatisering> = {}): Automatisering {
  const automation = {
    id: "AUTO-1",
    naam: "BTW aangifte webhook",
    categorie: "Backend Script",
    doel: "",
    trigger: "",
    systemen: ["Backend"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  } satisfies Automatisering;

  return automation;
}

function makeIssue(overrides: Partial<PortalSentryIssue> = {}): PortalSentryIssue {
  return {
    id: "123",
    shortId: "AUTOMATIONS-1",
    title: "Unhandled error",
    culprit: "",
    level: "error",
    status: "unresolved",
    count: 3,
    firstSeen: "2026-06-17T10:00:00.000Z",
    lastSeen: "2026-06-18T10:00:00.000Z",
    permalink: "https://brand-boekhouders.sentry.io/issues/123/",
    metadataText: "",
    tags: {},
    ...overrides,
  };
}

describe("sentry issue matching", () => {
  it("matches exact automation_id tags", () => {
    const automation = makeAutomation({ id: "AUTO-BTW" });
    const issue = makeIssue({ tags: { automation_id: "AUTO-BTW" } });

    const result = matchSentryIssuesToAutomations([issue], [automation]);

    expect(result.byAutomationId["AUTO-BTW"][0]).toMatchObject({
      issueId: "123",
      confidence: "exact",
      reason: "automation_id tag",
    });
    expect(result.unmatched).toEqual([]);
  });

  it("matches strong source identifiers from issue searchable fields", () => {
    const automation = makeAutomation({
      id: "AUTO-ZAP",
      externalId: "235361233",
      importProposal: { zap: { id: "235361233", title: "Zap" } },
    });
    const issue = makeIssue({
      title: "Zap failed",
      metadataText: "request for zap_id=235361233 failed",
    });

    const result = matchSentryIssuesToAutomations([issue], [automation]);

    expect(result.byAutomationId["AUTO-ZAP"][0]).toMatchObject({
      confidence: "strong",
      reason: "source identifier",
    });
  });

  it("ranks stronger source identifier matches ahead of earlier input order", () => {
    const broadAutomation = makeAutomation({
      id: "AUTO-BROAD",
      externalId: "tf-form",
    });
    const specificAutomation = makeAutomation({
      id: "AUTO-SPECIFIC",
      importProposal: { typeform: { form: { id: "tf-form-abc123" } } },
    });
    const issue = makeIssue({
      title: "Typeform submit failed",
      metadataText: "handler received form id tf-form-abc123",
    });

    const result = matchSentryIssuesToAutomations([issue], [broadAutomation, specificAutomation]);

    expect(result.byAutomationId["AUTO-BROAD"]).toEqual([]);
    expect(result.byAutomationId["AUTO-SPECIFIC"][0]).toMatchObject({
      issueId: "123",
      confidence: "strong",
      reason: "source identifier",
    });
  });

  it("does not match opaque numeric identifiers embedded inside longer tokens", () => {
    const automation = makeAutomation({
      id: "AUTO-ZAP",
      externalId: "1234",
      importProposal: { zap: { id: "1234" } },
    });
    const issue = makeIssue({ metadataText: "zap_id=912345 failed" });

    const result = matchSentryIssuesToAutomations([issue], [automation]);

    expect(result.byAutomationId["AUTO-ZAP"]).toEqual([]);
    expect(result.unmatched).toEqual([issue]);
  });

  it("matches stable identifiers from HubSpot, Typeform, GitLab and webhook metadata", () => {
    const automations = [
      makeAutomation({
        id: "HUBSPOT-AUTO",
        hubspotWorkflow: {
          workflowId: "87654321",
          name: "Workflow",
          triggers: [],
          actions: [],
        },
      }),
      makeAutomation({
        id: "TYPEFORM-AUTO",
        importProposal: { typeform: { form: { id: "tf-form-abc123" } } },
      }),
      makeAutomation({
        id: "GITLAB-AUTO",
        gitlabFilePath: "gitlabtest/app/API/operations.py",
        gitlabEndpoint: {
          endpoint: "/operations/hubspot/contact/updating_dealname",
          handler: "contact_change_endpoint",
        },
      }),
      makeAutomation({
        id: "WEBHOOK-AUTO",
        webhookPaths: ["/typeform/onboarding"],
      }),
    ];
    const issues = [
      makeIssue({ id: "hubspot", title: "workflow 87654321 failed" }),
      makeIssue({ id: "typeform", culprit: "submit tf-form-abc123" }),
      makeIssue({ id: "gitlab", metadataText: "contact_change_endpoint raised" }),
      makeIssue({ id: "webhook", tags: { request_path: "/typeform/onboarding" } }),
    ];

    const result = matchSentryIssuesToAutomations(issues, automations);

    expect(result.byAutomationId["HUBSPOT-AUTO"][0]).toMatchObject({ issueId: "hubspot", confidence: "strong" });
    expect(result.byAutomationId["TYPEFORM-AUTO"][0]).toMatchObject({ issueId: "typeform", confidence: "strong" });
    expect(result.byAutomationId["GITLAB-AUTO"][0]).toMatchObject({ issueId: "gitlab", confidence: "strong" });
    expect(result.byAutomationId["WEBHOOK-AUTO"][0]).toMatchObject({ issueId: "webhook", confidence: "strong" });
  });

  it("matches Sentry issues to GitLab automations by runtime call graph functions and files", () => {
    const automation = makeAutomation({
      id: "GITLAB-DEALNAME",
      gitlabEndpoint: {
        endpoint: "/operations/hubspot/contact/updating_dealname",
        handler: "contact_change_endpoint",
        calls: [
          {
            depth: 1,
            kind: "await_call",
            from: "app.API.operations::_contact_change_task",
            to: "app.service.operations.deal_updates::contact_change",
            file: "app/service/operations/deal_updates.py",
          },
        ],
      },
    });
    const issue = makeIssue({
      id: "sentry-dealname",
      title: 'TypeError: can only concatenate str (not "NoneType") to str',
      culprit: "/operations/hubspot/contact/updating_dealname",
      metadataText:
        'TypeError can only concatenate str (not "NoneType") to str app/service/operations/deal_updates.py contact_change',
    });

    const result = matchSentryIssuesToAutomations([issue], [automation]);

    expect(result.byAutomationId["GITLAB-DEALNAME"][0]).toMatchObject({
      issueId: "sentry-dealname",
      confidence: "strong",
      reason: "source identifier",
    });
    expect(result.unmatched).toEqual([]);
  });

  it("matches GitLab external endpoint ids against Sentry culprit paths", () => {
    const automation = makeAutomation({
      id: "GITLAB-EXTERNAL-ENDPOINT",
      externalId: "app/API/operations.py::POST /operations/hubspot/contact/updating_dealname",
      gitlabFilePath: "app/API/operations.py",
      source: "gitlab",
    });
    const issue = makeIssue({
      id: "sentry-external-endpoint",
      culprit: "/operations/hubspot/contact/updating_dealname",
      metadataText: "app/service/operations/deal_updates.py contact_change",
    });

    const result = matchSentryIssuesToAutomations([issue], [automation]);

    expect(result.byAutomationId["GITLAB-EXTERNAL-ENDPOINT"][0]).toMatchObject({
      issueId: "sentry-external-endpoint",
      confidence: "strong",
      reason: "source identifier",
    });
  });

  it("ignores source identifiers shorter than four characters", () => {
    const automation = makeAutomation({
      id: "ABC",
      naam: "Long descriptive automation name",
      externalId: "123",
      importProposal: { zap: { id: "999" } },
    });
    const issue = makeIssue({ title: "ABC 123 999 failed" });

    const result = matchSentryIssuesToAutomations([issue], [automation]);

    expect(result.byAutomationId["ABC"]).toEqual([]);
    expect(result.unmatched).toEqual([issue]);
  });

  it("keeps text-only matches possible", () => {
    const automation = makeAutomation({ id: "AUTO-BTW", naam: "BTW aangifte webhook" });
    const issue = makeIssue({ title: "BTW aangifte webhook failed" });

    const result = matchSentryIssuesToAutomations([issue], [automation]);

    expect(result.byAutomationId["AUTO-BTW"][0]).toMatchObject({
      confidence: "possible",
      reason: "automation name",
    });
  });

  it("does not attach low confidence issues", () => {
    const automation = makeAutomation({ id: "AUTO-BTW", naam: "BTW aangifte webhook" });
    const issue = makeIssue({ title: "Unrelated timeout" });

    const result = matchSentryIssuesToAutomations([issue], [automation]);

    expect(result.byAutomationId["AUTO-BTW"]).toEqual([]);
    expect(result.unmatched[0].id).toBe("123");
  });

  it("builds overview summaries from exact and strong matches only", () => {
    const summary = buildSentryIssueSummary([
      { issueId: "1", confidence: "exact", reason: "automation_id tag", issue: makeIssue({ id: "1", count: 2 }) },
      { issueId: "2", confidence: "strong", reason: "source identifier", issue: makeIssue({ id: "2", count: 5 }) },
      { issueId: "3", confidence: "possible", reason: "automation name", issue: makeIssue({ id: "3", count: 9 }) },
    ]);

    expect(summary).toEqual({
      linkedIssueCount: 2,
      possibleIssueCount: 1,
      eventCount: 7,
      latestSeen: "2026-06-18T10:00:00.000Z",
    });
  });

  it("uses chronological lastSeen ordering while preserving the original latest string", () => {
    const summary = buildSentryIssueSummary([
      {
        issueId: "1",
        confidence: "strong",
        reason: "source identifier",
        issue: makeIssue({ id: "1", lastSeen: "2026-06-18T22:30:00-02:00" }),
      },
      {
        issueId: "2",
        confidence: "strong",
        reason: "source identifier",
        issue: makeIssue({ id: "2", lastSeen: "2026-06-19T00:00:00+02:00" }),
      },
    ]);

    expect(summary.latestSeen).toBe("2026-06-18T22:30:00-02:00");
  });
});
