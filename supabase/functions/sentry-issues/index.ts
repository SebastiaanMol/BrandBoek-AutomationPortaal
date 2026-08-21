import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  buildSentryQuery,
  type SanitizedSentryIssue,
  sanitizeSentryIssue,
  validateSentryIssuesRequest,
} from "./sanitize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const request = await parseRequestBody(req);
    if (!request.ok) {
      console.warn("sentry-issues validation error:", request.error);
      return jsonResponse({ error: "Ongeldig Sentry issues verzoek" }, 400);
    }

    const { mode, automationId, limit } = request.value;

    const token = normalizeRequiredSecret(Deno.env.get("SENTRY_AUTH_TOKEN"));
    const org = normalizeRequiredSecret(Deno.env.get("SENTRY_ORG"));
    const project = normalizeRequiredSecret(Deno.env.get("SENTRY_PROJECT"));

    const { issues, limited } = await fetchSentryIssues({ token, org, project, mode, automationId, limit });

    return jsonResponse({
      mode,
      automationId,
      issues,
      limited,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("sentry-issues error:", error instanceof Error ? error.message : error);
    if (error instanceof SentryApiError) {
      return jsonResponse({ error: `Sentry API gaf status ${error.status}` }, 502);
    }
    return jsonResponse({ error: "Kon Sentry issues niet ophalen" }, 500);
  }
});

async function parseRequestBody(req: Request): Promise<ReturnType<typeof validateSentryIssuesRequest>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return { ok: false, error: "Malformed JSON" };
  }
  return validateSentryIssuesRequest(data);
}

async function fetchSentryIssues({
  token,
  org,
  project,
  mode,
  automationId,
  limit,
}: {
  token: string;
  org: string;
  project: string;
  mode: "overview" | "detail";
  automationId?: string;
  limit: number;
}): Promise<{ issues: SanitizedSentryIssue[]; limited: boolean }> {
  const url = new URL(`https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/issues/`);
  url.searchParams.set("query", buildSentryQuery(mode, automationId));
  url.searchParams.set("sort", "date");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("project", project);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new SentryApiError(response.status);
  }

  const data = await response.json();
  const upstreamIssues = Array.isArray(data) ? data : [];
  return {
    issues: upstreamIssues.slice(0, limit).map(sanitizeSentryIssue),
    limited: upstreamIssues.length >= limit,
  };
}

class SentryApiError extends Error {
  constructor(readonly status: number) {
    super(`Sentry issues request failed with status ${status}`);
  }
}

function normalizeRequiredSecret(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error("Missing Sentry configuration");
  return normalized;
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
