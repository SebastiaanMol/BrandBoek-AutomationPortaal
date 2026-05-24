import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  mapTypeformFormToAutomationPayload,
  type TypeformAutomationPayload,
  typeformReadOnlyHeaders,
} from "../_shared/typeform-readonly.ts";
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

const TYPEFORM_FORMS_URL = "https://api.typeform.com/forms?page_size=200";

class TypeformApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: integration, error: intError } = await db
      .from("integrations")
      .select("*")
      .eq("type", "typeform")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intError || !integration) {
      await recordSourceSyncFailure(db, "typeform", new Date().toISOString(), {
        status: "failed",
        errorMessage: "Geen Typeform-integratie gevonden.",
      });
      return jsonResponse({
        error: "Geen Typeform-integratie gevonden. Sla eerst een token op via Instellingen > Externe systemen.",
      }, 404);
    }

    const token = String(integration.token ?? "").trim();
    if (!token) {
      const errorMessage = "Typeform token ontbreekt. Sla een Personal Access Token op voordat je synchroniseert.";
      await recordSourceSyncFailure(db, "typeform", new Date().toISOString(), {
        status: "auth_failed",
        errorMessage,
      });
      return jsonResponse({ error: errorMessage }, 400);
    }

    let payloads: TypeformAutomationPayload[];
    const now = new Date().toISOString();
    try {
      payloads = await fetchTypeformAutomationPayloads(token, now);
    } catch (error) {
      const status = error instanceof TypeformApiError ? error.status : 500;
      const errorMessage = error instanceof Error ? error.message : "Typeform sync mislukt.";
      await recordSourceSyncFailure(db, "typeform", now, {
        status: status === 401 || status === 403 ? "auth_failed" : status === 429 ? "rate_limited" : "failed",
        errorMessage,
      });
      return jsonResponse({ error: errorMessage }, status);
    }

    let result: { inserted: number; updated: number; deactivated: number; total: number };
    try {
      const syncRunId = await startSourceSyncRun(db, "typeform", now);
      result = await recordPortalOwnedSync(db, {
        source: "typeform",
        payloads,
        syncRunId,
        now,
      });
    } catch (error) {
      const errorMessage = stringifyError(error);
      await recordSourceSyncFailure(db, "typeform", now, {
        status: "failed",
        errorMessage,
        itemsSeen: payloads.length,
      });
      return jsonResponse({ error: errorMessage }, 500);
    }

    return jsonResponse({ success: true, ...result });
  } catch (error) {
    console.error("typeform-sync error:", error);
    return jsonResponse({ error: stringifyError(error) }, 500);
  }
});

async function fetchTypeformAutomationPayloads(token: string, now: string): Promise<TypeformAutomationPayload[]> {
  const headers = typeformReadOnlyHeaders(token);
  const formsBody = await fetchTypeformJson(TYPEFORM_FORMS_URL, headers);
  const forms = Array.isArray(formsBody.items) ? formsBody.items : [];
  const payloads: TypeformAutomationPayload[] = [];

  for (const form of forms) {
    const formId = String(form?.id ?? "").trim();
    if (!formId) continue;

    const [detail, webhooksBody] = await Promise.all([
      fetchTypeformJson(`https://api.typeform.com/forms/${formId}`, headers).catch(() => form),
      fetchTypeformJson(`https://api.typeform.com/forms/${formId}/webhooks`, headers).catch(() => ({ items: [] })),
    ]);
    const webhooks = Array.isArray(webhooksBody.items) ? webhooksBody.items : [];

    payloads.push(mapTypeformFormToAutomationPayload({
      form,
      detail,
      webhooks,
    }, now));
  }

  return payloads;
}

async function fetchTypeformJson(
  url: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const errText = await response.text();
    const errorMessage = response.status === 401
      ? "Ongeldige Typeform token."
      : `Typeform API fout (${response.status}): ${errText.slice(0, 200)}`;
    throw new TypeformApiError(response.status, errorMessage);
  }
  return await response.json();
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Onbekende fout";
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
