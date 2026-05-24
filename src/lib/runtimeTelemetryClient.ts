import { supabase } from "@/integrations/supabase/client";
import { RuntimeEvent } from "./runtimeObservability";
import { RuntimeTelemetryEventInput } from "./runtimeTelemetry";

type WorkerTelemetryBase = {
  workerId: string;
  correlationId?: string | null;
  traceId?: string | null;
  hubspotObjectType?: string | null;
  hubspotObjectId?: string | null;
  metadata?: Record<string, unknown>;
};

type StateTransitionTelemetry = {
  sourceSystem?: RuntimeEvent["sourceSystem"];
  correlationId?: string | null;
  traceId?: string | null;
  workerId?: string | null;
  signalId?: string | null;
  hubspotObjectType?: string | null;
  hubspotObjectId?: string | null;
  propertyName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  dealstageOld?: string | null;
  dealstageNew?: string | null;
  pipelineId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logWorkerStarted(input: WorkerTelemetryBase) {
  return sendRuntimeTelemetry({
    sourceSystem: "gitlab",
    eventType: "worker_started",
    ...input,
  });
}

export async function logWorkerFinished(input: WorkerTelemetryBase) {
  return sendRuntimeTelemetry({
    sourceSystem: "gitlab",
    eventType: "worker_finished",
    ...input,
  });
}

export async function logWorkerFailed(input: WorkerTelemetryBase & { error?: unknown }) {
  return sendRuntimeTelemetry({
    sourceSystem: "gitlab",
    eventType: "error",
    ...input,
    metadata: {
      ...(input.metadata ?? {}),
      error: input.error instanceof Error ? input.error.message : String(input.error ?? "unknown error"),
    },
  });
}

export async function logHubSpotStateTransition(input: StateTransitionTelemetry) {
  return sendRuntimeTelemetry({
    sourceSystem: input.sourceSystem ?? "hubspot",
    eventType: input.dealstageNew || input.dealstageOld ? "hubspot_stage_changed" : "hubspot_property_changed",
    ...input,
  });
}

export async function logRuntimeSignalEmission(input: RuntimeTelemetryEventInput) {
  return sendRuntimeTelemetry({
    sourceSystem: input.sourceSystem ?? "portal",
    eventType: input.eventType ?? "portal_action",
    ...input,
  });
}

export async function sendRuntimeTelemetry(input: RuntimeTelemetryEventInput) {
  try {
    const { data, error } = await supabase.functions.invoke("runtime-telemetry", {
      body: {
        event: input,
        processImmediately: false,
      },
    });
    if (error) {
      console.warn("Runtime telemetry ingest failed", error);
      return { ok: false, error };
    }
    return data;
  } catch (error) {
    console.warn("Runtime telemetry ingest failed", error);
    return { ok: false, error };
  }
}

export async function getRuntimeTelemetryHealth() {
  const { data, error } = await supabase.functions.invoke("runtime-telemetry", {
    body: { action: "health" },
  });
  if (error) throw error;
  return data;
}
