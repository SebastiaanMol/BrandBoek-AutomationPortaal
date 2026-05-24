import { describe, expect, it } from "vitest";
import {
  buildObservedPropagationEdge,
  correlateRuntimeEvent,
  deriveStateTransitionFromEvent,
  normalizeRuntimeTelemetryEvent,
} from "@/lib/runtimeTelemetry";
import { RuntimeEvent, RuntimeTrace } from "@/lib/runtimeObservability";

const trace: RuntimeTrace = {
  id: "trace-1",
  rootEventId: "event-root",
  startedAt: "2026-05-07T10:00:00.000Z",
  status: "running",
  rootHubspotObjectType: "deal",
  rootHubspotObjectId: "123",
  workflowGraphIds: ["wg-sales"],
  summary: "sales trace corr-1",
  confidenceScore: 0.8,
  metadata: { correlation_id: "corr-1" },
};

const rootEvent: RuntimeEvent = {
  id: "event-root",
  traceId: "trace-1",
  occurredAt: "2026-05-07T10:00:00.000Z",
  eventType: "webhook_received",
  sourceSystem: "hubspot",
  hubspotObjectType: "deal",
  hubspotObjectId: "123",
  correlationId: "corr-1",
  rawPayload: {},
  metadata: {},
};

describe("runtime telemetry", () => {
  it("normalizes HubSpot object data from payloads", () => {
    const normalized = normalizeRuntimeTelemetryEvent({
      sourceSystem: "hubspot",
      eventType: "hubspot_property_changed",
      rawPayload: {
        object: { type: "deal", id: "999" },
        propertyName: "dealstage",
        oldValue: "a",
        newValue: "b",
      },
    });

    expect(normalized.hubspotObjectType).toBe("deal");
    expect(normalized.hubspotObjectId).toBe("999");
    expect(normalized.propertyName).toBe("dealstage");
  });

  it("correlates events by explicit correlation id first", () => {
    const result = correlateRuntimeEvent(
      {
        sourceSystem: "gitlab",
        eventType: "worker_started",
        occurredAt: "2026-05-07T10:02:00.000Z",
        correlationId: "corr-1",
      },
      [{ trace, recentEvents: [rootEvent], score: 0, strategy: "new_trace", reasons: [] }],
    );

    expect(result.traceId).toBe("trace-1");
    expect(result.strategy).toBe("explicit_correlation_id");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0.95);
    expect(result.parentEventId).toBe("event-root");
  });

  it("correlates events by HubSpot object and time window when no correlation id exists", () => {
    const result = correlateRuntimeEvent(
      {
        sourceSystem: "hubspot",
        eventType: "hubspot_property_changed",
        occurredAt: "2026-05-07T10:05:00.000Z",
        hubspotObjectType: "deal",
        hubspotObjectId: "123",
        propertyName: "machtiging_actief",
      },
      [{ trace: { ...trace, metadata: {} }, recentEvents: [rootEvent], score: 0, strategy: "new_trace", reasons: [] }],
    );

    expect(result.traceId).toBe("trace-1");
    expect(result.strategy).toBe("hubspot_object_time_window");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0.45);
  });

  it("derives HubSpot state transitions from runtime events", () => {
    const transition = deriveStateTransitionFromEvent({
      ...rootEvent,
      eventType: "hubspot_stage_changed",
      propertyName: "dealstage",
      dealstageOld: "appointmentscheduled",
      dealstageNew: "qualifiedtobuy",
    });

    expect(transition?.transitionType).toBe("dealstage_change");
    expect(transition?.propertyName).toBe("dealstage");
    expect(transition?.dealstageNew).toBe("qualifiedtobuy");
  });

  it("builds observed propagation edge drafts between worker events", () => {
    const draft = buildObservedPropagationEdge({
      sourceEvent: {
        ...rootEvent,
        id: "event-a",
        workerId: "worker-a",
        signalId: "sig-a",
      },
      targetEvent: {
        ...rootEvent,
        id: "event-b",
        workerId: "worker-b",
        signalId: "sig-a",
      },
    });

    expect(draft?.sourceWorkerId).toBe("worker-a");
    expect(draft?.targetWorkerId).toBe("worker-b");
    expect(draft?.relationshipOrigin).toBe("observed_runtime_trace");
    expect(draft?.evidenceType).toBe("observed_trace");
  });
});
