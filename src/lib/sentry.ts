import React from "react";
import * as Sentry from "@sentry/react";
import * as ReactRouter from "react-router-dom";
import type { Automatisering } from "@/lib/types";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
const sentryEnabled = Boolean(sentryDsn) && import.meta.env.PROD;
const filteredKeys = [/email/i, /token/i, /secret/i, /password/i, /authorization/i, /cookie/i];
function getReactRouterExport<T>(name: string): T | undefined {
  if (!Object.prototype.hasOwnProperty.call(ReactRouter, name)) return undefined;
  return (ReactRouter as Record<string, unknown>)[name] as T;
}

const useLocation = getReactRouterExport<typeof ReactRouter.useLocation>("useLocation");
const useNavigationType = getReactRouterExport<typeof ReactRouter.useNavigationType>("useNavigationType");
const createRoutesFromChildren =
  getReactRouterExport<typeof ReactRouter.createRoutesFromChildren>("createRoutesFromChildren");
const matchRoutes = getReactRouterExport<typeof ReactRouter.matchRoutes>("matchRoutes");
const baseCreateBrowserRouter =
  getReactRouterExport<typeof ReactRouter.createBrowserRouter>("createBrowserRouter");
const hasRouterTracing =
  typeof useLocation === "function" &&
  typeof useNavigationType === "function" &&
  typeof createRoutesFromChildren === "function" &&
  typeof matchRoutes === "function";
const routerIntegrations = sentryEnabled && hasRouterTracing
  ? [
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect: React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ]
  : [];

function parseRate(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

export function scrubSentryEvent<T extends { extra?: Record<string, unknown> }>(event: T): T {
  if (!event.extra) return event;

  return {
    ...event,
    extra: Object.fromEntries(
      Object.entries(event.extra).map(([key, value]) => [
        key,
        filteredKeys.some(pattern => pattern.test(key)) ? "[Filtered]" : value,
      ]),
    ),
  };
}

Sentry.init({
  dsn: sentryDsn,
  enabled: sentryEnabled,
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
  release: import.meta.env.VITE_SENTRY_RELEASE,
  sendDefaultPii: false,
  integrations: routerIntegrations,
  tracesSampleRate: parseRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.05),
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: parseRate(import.meta.env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE, 0.25),
  tracePropagationTargets: [/^\//, /^https:\/\/.*\.supabase\.co/i],
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
});

const createBrowserRouter = typeof baseCreateBrowserRouter === "function"
  ? baseCreateBrowserRouter
  : (() => {
      throw new Error("createBrowserRouter is unavailable");
    });

export const createInstrumentedBrowserRouter = Sentry.wrapCreateBrowserRouterV6(createBrowserRouter);

export type AutomationSentryAction =
  | "fetch"
  | "create"
  | "update"
  | "archive"
  | "verify"
  | "ai_extract"
  | "batch_save"
  | "import_approve"
  | "import_reject"
  | "sync_hubspot"
  | "sync_gitlab"
  | "sync_typeform"
  | "sync_zapier"
  | "process_link"
  | "flow_save";

type AutomationSentryInput =
  Pick<Automatisering, "id" | "naam"> &
  Partial<Pick<
    Automatisering,
    | "source"
    | "externalId"
    | "status"
    | "systemen"
    | "pipelineId"
    | "stageId"
    | "sourceFindings"
    | "webhookPaths"
  >>;

export function buildAutomationSentryContext(
  automation: AutomationSentryInput,
  action: AutomationSentryAction,
) {
  return {
    tags: {
      area: "automation",
      automation_action: action,
      automation_id: automation.id,
      automation_source: automation.source ?? "manual",
      automation_status: automation.status ?? "unknown",
    },
    contexts: {
      automation: {
        id: automation.id,
        name: automation.naam,
        source: automation.source ?? "manual",
        externalId: automation.externalId ?? null,
        status: automation.status ?? "unknown",
        systems: automation.systemen ?? [],
        pipelineId: automation.pipelineId ?? null,
        stageId: automation.stageId ?? null,
        sourceFindings: automation.sourceFindings?.length ?? 0,
        webhookPaths: automation.webhookPaths?.length ?? 0,
      },
    },
  };
}

export function captureAutomationException(
  error: unknown,
  automation: AutomationSentryInput,
  action: AutomationSentryAction,
  extra?: Record<string, unknown>,
) {
  const context = buildAutomationSentryContext(automation, action);
  Sentry.captureException(error, {
    ...context,
    extra,
  });
}

export { Sentry };
