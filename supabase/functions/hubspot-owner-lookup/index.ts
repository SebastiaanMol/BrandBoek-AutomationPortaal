import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildHubSpotOwnerUrl,
  sanitizeHubSpotOwner,
  validateHubSpotOwnerLookupRequest,
} from "./sanitize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const validation = validateHubSpotOwnerLookupRequest(body);
    if (!validation.ok) {
      return json({ error: validation.error }, 400);
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: integration, error: integrationError } = await db
      .from("integrations")
      .select("token")
      .eq("type", "hubspot")
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const token = typeof integration?.token === "string" ? stripBearerPrefix(integration.token) : "";
    if (integrationError || !token) {
      return json(
        { error: "Geen HubSpot-integratie gevonden. Sla eerst een HubSpot token op via Instellingen." },
        404,
      );
    }

    const ownerId = validation.ownerId;
    const response = await fetch(buildHubSpotOwnerUrl(ownerId), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return json({ error: buildHubSpotError(response.status) }, response.status === 404 ? 404 : 502);
    }

    const owner = sanitizeHubSpotOwner(await response.json());
    if (!owner.id) {
      return json({ error: "HubSpot owner antwoord mist owner id" }, 502);
    }

    return json({
      owner,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("hubspot-owner-lookup error:", error);
    return json({ error: "HubSpot owner lookup is mislukt" }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function stripBearerPrefix(token: string): string {
  return token.replace(/^Bearer\s+/i, "").trim();
}

function buildHubSpotError(status: number): string {
  if (status === 401 || status === 403) {
    return "HubSpot token heeft geen toegang tot owners. Controleer de HubSpot-koppeling.";
  }
  if (status === 404) {
    return "HubSpot owner niet gevonden.";
  }
  return `HubSpot Owners API fout (${status})`;
}
