import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildZapierZapsUrl,
  getNextZapierPageUrl,
  mapZapierExportToAutomationPayloads,
  mapZapierZapToAutomationPayload,
  normalizeZapierApiResponse,
  type ZapierAutomationPayload,
  zapierReadOnlyHeaders,
} from "../_shared/zapier-readonly.ts";
import {
  recordPortalOwnedSync,
  recordSourceSyncFailure,
  startSourceSyncRun,
} from "../_shared/portal-owned-sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ZAPIER_READ_ONLY_ENDPOINT = "https://api.zapier.com/v2/zaps";
const MAX_ZAPIER_PAGES = 20;

class ZapierApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ZapierSyncRequest =
  | { mode: "api"; body: Record<string, unknown> | null }
  | { mode: "json_export"; body: Record<string, unknown> }
  | { error: string; status: number };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const syncRequest = await parseZapierSyncRequestBody(req);
    if ("error" in syncRequest) return jsonResponse({ error: syncRequest.error }, syncRequest.status);

    if (syncRequest.mode === "json_export") {
      const now = new Date().toISOString();
      const payloads = mapZapierExportToAutomationPayloads(syncRequest.body.export, now);
      if (payloads.length === 0) {
        await recordSourceSyncFailure(db, "zapier", now, {
          status: "failed",
          errorMessage: "Geen Zaps gevonden in Zapier JSON-export.",
        });
        return jsonResponse({ error: "Geen Zaps gevonden in Zapier JSON-export." }, 400);
      }

      const syncRunId = await startSourceSyncRun(db, "zapier", now);
      const result = await recordPortalOwnedSync(db, {
        source: "zapier",
        payloads,
        syncRunId,
        now,
      });

      return jsonResponse({ success: true, ...result });
    }

    const { data: integration, error: intError } = await db
      .from("integrations")
      .select("*")
      .eq("type", "zapier")
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intError || !integration) {
      await recordSourceSyncFailure(db, "zapier", new Date().toISOString(), {
        status: "failed",
        errorMessage: "Geen Zapier-integratie gevonden.",
      });
      return jsonResponse({
        error: "Geen Zapier-integratie gevonden. Sla eerst een Zapier OAuth/Bearer token op via Instellingen > Externe systemen.",
      }, 404);
    }

    const token = normalizeZapierToken(integration.token);
    if (!token) {
      const errorMessage = "Zapier token ontbreekt. Sla een Zapier OAuth/Bearer token op voordat je synchroniseert.";
      await recordSourceSyncFailure(db, "zapier", new Date().toISOString(), {
        status: "auth_failed",
        errorMessage,
      });
      return jsonResponse({ error: errorMessage }, 400);
    }

    let zaps: unknown[];
    try {
      zaps = await fetchAllZaps(token);
    } catch (error) {
      const status = error instanceof ZapierApiError ? error.status : 500;
      const errorMessage = error instanceof Error ? error.message : "Zapier sync mislukt.";
      await recordSourceSyncFailure(db, "zapier", new Date().toISOString(), {
        status: status === 401 || status === 403 ? "auth_failed" : status === 429 ? "rate_limited" : "failed",
        errorMessage,
      });
      return jsonResponse({ error: errorMessage }, status);
    }

    const now = new Date().toISOString();
    const payloads = zaps.map((zap) => mapZapierZapToAutomationPayload(zap, now));
    if (payloads.length === 0) {
      const errorMessage = "Zapier API gaf geen Zaps terug.";
      await recordSourceSyncFailure(db, "zapier", now, {
        status: "failed",
        errorMessage,
      });
      return jsonResponse({ error: errorMessage }, 502);
    }

    const syncRunId = await startSourceSyncRun(db, "zapier", now);
    const result = await recordPortalOwnedSync(db, {
      source: "zapier",
      payloads,
      syncRunId,
      now,
    });

    return jsonResponse({ success: true, ...result });
  } catch (error) {
    console.error("zapier-sync error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Onbekende fout" }, 500);
  }
});

async function fetchAllZaps(token: string): Promise<unknown[]> {
  let nextUrl: string | null = buildZapierZapsUrl();
  if (!nextUrl.startsWith(ZAPIER_READ_ONLY_ENDPOINT)) {
    throw new Error("Onverwachte Zapier read-only endpoint configuratie.");
  }

  const seenUrls = new Set<string>();
  const zaps: unknown[] = [];

  for (let page = 0; nextUrl && page < MAX_ZAPIER_PAGES; page++) {
    if (seenUrls.has(nextUrl)) break;
    seenUrls.add(nextUrl);

    const body = await fetchZapierPage(nextUrl, token);
    zaps.push(...normalizeZapierApiResponse(body));
    nextUrl = getNextZapierPageUrl(body);
  }

  return zaps;
}

async function fetchZapierPage(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: zapierReadOnlyHeaders(token),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const errorMessage = response.status === 401 || response.status === 403
      ? "Zapier read-only token is ongeldig of mist toegang tot Zaps."
      : `Zapier API fout (${response.status}): ${errorText.slice(0, 200)}`;
    throw new ZapierApiError(response.status, errorMessage);
  }

  return response.json();
}

async function parseZapierSyncRequestBody(req: Request): Promise<ZapierSyncRequest> {
  let text = "";

  try {
    text = await req.text();
  } catch {
    return { error: "Ongeldige JSON-body voor Zapier sync.", status: 400 };
  }

  if (!text.trim()) return { mode: "api", body: null };

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: "Ongeldige JSON-body voor Zapier sync.", status: 400 };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Zapier sync body moet een JSON-object zijn.", status: 400 };
  }

  const record = body as Record<string, unknown>;
  if (record.mode === "api") return { mode: "api", body: record };
  if (record.mode === "json_export") return { mode: "json_export", body: record };

  return { error: "Onbekende Zapier sync modus.", status: 400 };
}

function normalizeZapierToken(rawToken: unknown): string {
  if (typeof rawToken !== "string") return "";
  const trimmed = rawToken.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (typeof record.access_token === "string") return stripBearerPrefix(record.access_token);
      if (typeof record.token === "string") return stripBearerPrefix(record.token);
    }
  } catch {
    // Plain token strings are expected for this integration.
  }

  return stripBearerPrefix(trimmed);
}

function stripBearerPrefix(token: string): string {
  return token.replace(/^Bearer\s+/i, "").trim();
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
