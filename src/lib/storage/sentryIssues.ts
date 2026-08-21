import { supabase } from "@/integrations/supabase/client";
import type { PortalSentryIssue } from "@/lib/sentryIssueMatching";

export type FetchSentryIssuesInput =
  | {
      mode: "overview";
      limit?: number;
    }
  | {
      mode: "detail";
      automationId: string;
      limit?: number;
    };

export interface FetchSentryIssuesResult {
  issues: PortalSentryIssue[];
  limited: boolean;
  fetchedAt: string;
}

export async function fetchSentryIssues(input: FetchSentryIssuesInput): Promise<FetchSentryIssuesResult> {
  const body = buildSentryIssuesBody(input);
  const { data, error } = await supabase.functions.invoke("sentry-issues", { body });

  if (error) {
    throw await toReadableFunctionError(error);
  }

  return normalizeSentryIssuesResponse(data);
}

function buildSentryIssuesBody(input: FetchSentryIssuesInput): Record<string, unknown> {
  if (input.mode === "detail") {
    return {
      mode: "detail",
      automationId: input.automationId,
      limit: input.limit ?? 25,
    };
  }

  return {
    mode: "overview",
    limit: input.limit ?? 100,
  };
}

async function toReadableFunctionError(error: unknown): Promise<Error> {
  if (!error || typeof error !== "object") {
    return new Error("Sentry issues ophalen is mislukt");
  }

  const maybeError = error as { message?: string; context?: unknown };
  const context = maybeError.context;

  if (context && typeof context === "object") {
    const maybeContext = context as { error?: unknown; json?: unknown };
    if (typeof maybeContext.error === "string" && maybeContext.error.trim()) {
      return new Error(maybeContext.error);
    }

    if (typeof maybeContext.json === "function") {
      try {
        const errBody = await (maybeContext as { json: () => Promise<Record<string, unknown>> }).json();
        if (typeof errBody.error === "string" && errBody.error.trim()) {
          return new Error(errBody.error);
        }
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message !== maybeError.message) {
          return contextError;
        }
      }
    }
  }

  return new Error(maybeError.message || "Sentry issues ophalen is mislukt");
}

function normalizeSentryIssuesResponse(data: unknown): FetchSentryIssuesResult {
  if (!data || typeof data !== "object") {
    return {
      issues: [],
      limited: false,
      fetchedAt: new Date().toISOString(),
    };
  }

  const response = data as Partial<FetchSentryIssuesResult>;

  return {
    issues: Array.isArray(response.issues) ? response.issues.filter(isPortalSentryIssue) : [],
    limited: response.limited === true,
    fetchedAt: typeof response.fetchedAt === "string" && response.fetchedAt.trim()
      ? response.fetchedAt
      : new Date().toISOString(),
  };
}

function isPortalSentryIssue(value: unknown): value is PortalSentryIssue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const issue = value as Partial<PortalSentryIssue>;
  return (
    typeof issue.id === "string" &&
    issue.id.trim().length > 0 &&
    typeof issue.title === "string" &&
    issue.title.trim().length > 0 &&
    typeof issue.status === "string" &&
    typeof issue.count === "number" &&
    Number.isFinite(issue.count) &&
    typeof issue.permalink === "string"
  );
}
