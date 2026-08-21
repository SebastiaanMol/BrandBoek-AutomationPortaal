import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildAssociationUrl,
  buildCrmObjectUrl,
  buildDealUrl,
  buildDiagnosisSummaryLines,
  buildOwnerUrl,
  extractAssociationIds,
  findOwnerReferences,
  sanitizeCrmObject,
  sanitizeOwner,
  validateHubSpotDiagnosisRequest,
  type HubSpotRecordType,
  type OwnerReference,
  type SanitizedCrmObject,
  type SanitizedOwner,
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

    const validation = validateHubSpotDiagnosisRequest(await req.json().catch(() => ({})));
    if (!validation.ok) {
      return json({ error: validation.error }, 400);
    }

    const deals = [];
    const associatedRecords = [];
    const suspectedOwnerReferences: OwnerReference[] = [];
    const warnings: string[] = [];
    const requestedOwnerIds = validation.value.ownerIds;

    for (const dealInput of validation.value.dealIds) {
      const dealResult = await getJson(token, buildDealUrl(dealInput.id, validation.value.propertyNames));
      if (!dealResult.ok) {
        const fetchStatus = dealResult.status === 404 ? "not_found" : "error";
        warnings.push(`Deal ${dealInput.id} kon niet worden opgehaald (${dealResult.status}).`);
        deals.push({
          id: dealInput.id,
          roleHint: dealInput.roleHint,
          fetchStatus,
          associationCounts: { contacts: 0, companies: 0, deals: 0 },
        });
        continue;
      }

      const deal = sanitizeCrmObject("deal", dealResult.data, validation.value.propertyNames);
      suspectedOwnerReferences.push(...findOwnerReferences(deal, requestedOwnerIds));
      const associationCounts = { contacts: 0, companies: 0, deals: 0 };

      for (const associationType of ["contacts", "companies", "deals"] as const) {
        const associationResult = await getJson(
          token,
          buildAssociationUrl("deals", dealInput.id, associationType),
        );
        if (!associationResult.ok) {
          warnings.push(`Associaties ${dealInput.id} naar ${associationType} konden niet worden opgehaald (${associationResult.status}).`);
          continue;
        }

        const associatedIds = extractAssociationIds(associationResult.data);
        associationCounts[associationType] = associatedIds.length;

        for (const associatedId of associatedIds.slice(0, 10)) {
          const recordType = toRecordType(associationType);
          const recordResult = await getJson(token, buildCrmObjectUrl(recordType, associatedId));
          if (!recordResult.ok) {
            warnings.push(`Geassocieerd ${recordType} ${associatedId} kon niet worden opgehaald (${recordResult.status}).`);
            associatedRecords.push({
              parentDealId: dealInput.id,
              recordType,
              id: associatedId,
              fetchStatus: recordResult.status === 404 ? "not_found" : "error",
            });
            continue;
          }

          const associatedRecord = sanitizeCrmObject(recordType, recordResult.data, validation.value.propertyNames);
          suspectedOwnerReferences.push(...findOwnerReferences(associatedRecord, requestedOwnerIds));
          associatedRecords.push({
            parentDealId: dealInput.id,
            fetchStatus: "ok",
            ...summarizeAssociatedRecord(associatedRecord),
          });
        }
      }

      deals.push({
        id: deal.id || dealInput.id,
        roleHint: dealInput.roleHint,
        fetchStatus: "ok",
        archived: deal.archived,
        dealstage: deal.properties.dealstage,
        ownerProperties: deal.ownerProperties,
        propertyValues: pickDiagnosticProperties(deal, validation.value.propertyNames),
        propertyHistory: deal.propertyHistory,
        associationCounts,
      });
    }

    const owners: SanitizedOwner[] = [];
    for (const ownerId of requestedOwnerIds) {
      const activeOwner = await getJson(token, buildOwnerUrl(ownerId, false));
      if (activeOwner.ok) {
        owners.push(sanitizeOwner(ownerId, activeOwner.data, "active"));
        continue;
      }

      const archivedOwner = await getJson(token, buildOwnerUrl(ownerId, true));
      if (archivedOwner.ok) {
        owners.push(sanitizeOwner(ownerId, archivedOwner.data, "archived"));
        continue;
      }

      warnings.push(`Owner ${ownerId} is niet gevonden in actieve of archived owners.`);
      owners.push(sanitizeOwner(ownerId, { id: ownerId }, "missing"));
    }

    const summaryLines = buildDiagnosisSummaryLines({
      suspectedOwnerReferences,
      owners,
      warnings,
    });

    return json({
      deals,
      associatedRecords,
      owners,
      suspectedOwnerReferences,
      warnings,
      summaryLines,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("hubspot-diagnose error:", error);
    return json({ error: "HubSpot diagnose is mislukt" }, 500);
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

async function getJson(token: string, url: URL | string): Promise<{ ok: true; status: number; data: unknown } | { ok: false; status: number }> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return { ok: false, status: response.status };
    }

    return { ok: true, status: response.status, data: await response.json().catch(() => ({})) };
  } catch {
    return { ok: false, status: 0 };
  }
}

function toRecordType(associationType: "contacts" | "companies" | "deals"): HubSpotRecordType {
  if (associationType === "companies") return "company";
  if (associationType === "contacts") return "contact";
  return "deal";
}

function summarizeAssociatedRecord(record: SanitizedCrmObject) {
  return {
    recordType: record.recordType,
    id: record.id,
    archived: record.archived,
    ownerProperties: record.ownerProperties,
    propertyValues: pickDiagnosticProperties(record, []),
  };
}

function pickDiagnosticProperties(record: SanitizedCrmObject, propertyNames: string[]): Record<string, string | undefined> {
  const propertyValues: Record<string, string | undefined> = {};
  for (const propertyName of propertyNames) {
    propertyValues[propertyName] = record.properties[propertyName];
  }
  return propertyValues;
}
