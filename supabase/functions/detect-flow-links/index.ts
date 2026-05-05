import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const GEMINI_TIMEOUT_MS = 30_000;
const DEFAULT_AI_BATCH_SIZE = 10;
const MAX_AI_BATCH_SIZE = 20;
const MAX_AI_AUTOMATIONS = 140;
const MAX_TEXT_FIELD_LENGTH = 140;

type DetectionMode = "meta" | "webhook" | "ai" | "all";

type DetectionPayload = {
  mode?: DetectionMode;
  offset?: number;
  limit?: number;
};

type Automation = {
  id: string;
  naam: string;
  categorie: string;
  doel: string;
  trigger_beschrijving: string;
  systemen: string[];
  stappen: string[];
  status: string;
  source: string | null;
  webhook_paths: string[];
  endpoints: string[];
};

type Suggestie = {
  from_id: string;
  to_id: string;
  confidence: number;
  reasoning: string;
};

type AiDetectionResult = {
  suggestions: Suggestie[];
  status: "ok" | "partial-json" | "skipped" | "missing-key" | "api-error" | "invalid-json" | "timeout-or-error";
  rawCount?: number;
  note?: string;
};

function endpointMatches(webhookPath: string, endpoint: string): boolean {
  return webhookPath.endsWith(endpoint);
}

function truncate(value: string | null | undefined, maxLength = MAX_TEXT_FIELD_LENGTH): string {
  const text = value ?? "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return [
      record.message,
      record.code,
      record.details,
      record.hint,
    ].filter(Boolean).join(" | ") || JSON.stringify(record);
  }
  return String(error ?? "Onbekende fout");
}

function clampBatchSize(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_AI_BATCH_SIZE;
  return Math.min(Math.floor(parsed), MAX_AI_BATCH_SIZE);
}

function parseMode(value: unknown): DetectionMode {
  return value === "meta" || value === "webhook" || value === "ai" || value === "all"
    ? value
    : "all";
}

function prioritizeForAi(autos: Automation[]): Automation[] {
  return [...autos]
    .sort((a, b) => {
      const aScore =
        (a.webhook_paths?.length ? 3 : 0) +
        (a.endpoints?.length ? 3 : 0) +
        (a.doel ? 1 : 0) +
        (a.trigger_beschrijving ? 1 : 0);
      const bScore =
        (b.webhook_paths?.length ? 3 : 0) +
        (b.endpoints?.length ? 3 : 0) +
        (b.doel ? 1 : 0) +
        (b.trigger_beschrijving ? 1 : 0);
      if (bScore !== aScore) return bScore - aScore;
      return a.naam.localeCompare(b.naam, "nl");
    })
    .slice(0, MAX_AI_AUTOMATIONS);
}

function addSuggestion(map: Map<string, Suggestie>, suggestion: Suggestie) {
  if (suggestion.from_id === suggestion.to_id) return;
  const key = `${suggestion.from_id}|${suggestion.to_id}`;
  if (!map.has(key)) map.set(key, suggestion);
}

function detectWebhookSuggestions(autos: Automation[]): Suggestie[] {
  const suggestions = new Map<string, Suggestie>();

  for (const source of autos) {
    if (!source.webhook_paths?.length) continue;
    for (const target of autos) {
      if (target.id === source.id || !target.endpoints?.length) continue;
      for (const webhookPath of source.webhook_paths) {
        for (const endpoint of target.endpoints) {
          if (endpointMatches(webhookPath, endpoint)) {
            addSuggestion(suggestions, {
              from_id: source.id,
              to_id: target.id,
              confidence: 1.0,
              reasoning: endpoint,
            });
          }
        }
      }
    }
  }

  return [...suggestions.values()];
}

function extractSuggestionsFromText(content: string): { from: string; to: string; redenering: string }[] {
  const suggestions: { from: string; to: string; redenering: string }[] = [];
  const pattern =
    /"from"\s*:\s*"([^"]+)"[\s\S]*?"to"\s*:\s*"([^"]+)"[\s\S]*?"redenering"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  for (const match of content.matchAll(pattern)) {
    suggestions.push({
      from: match[1],
      to: match[2],
      redenering: match[3].replace(/\\"/g, '"'),
    });
  }
  return suggestions;
}

function normalizeAiSuggestions(
  rawSuggestions: { from: string; to: string; redenering: string }[],
  focusIds: Set<string>,
  validIds: Set<string>,
  webhookPairs: Set<string>,
): Suggestie[] {
  const suggestions = new Map<string, Suggestie>();

  for (const s of rawSuggestions) {
    const pairKey = `${s.from}|${s.to}`;
    if (
      s.from &&
      s.to &&
      focusIds.has(s.from) &&
      validIds.has(s.to) &&
      s.from !== s.to &&
      !webhookPairs.has(pairKey)
    ) {
      addSuggestion(suggestions, {
        from_id: s.from,
        to_id: s.to,
        confidence: 0.7,
        reasoning: s.redenering ?? "",
      });
    }
  }

  return [...suggestions.values()];
}

async function fetchAiSuggestions(
  focusAutos: Automation[],
  contextAutos: Automation[],
  webhookSuggestions: Suggestie[],
): Promise<AiDetectionResult> {
  if (focusAutos.length === 0 || contextAutos.length <= 1) {
    return { suggestions: [], status: "skipped" };
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    console.warn("detect-flow-links: GEMINI_API_KEY missing, skipping AI suggestions");
    return { suggestions: [], status: "missing-key" };
  }

  const webhookPairs = new Set(webhookSuggestions.map((s) => `${s.from_id}|${s.to_id}`));
  const focusIds = new Set(focusAutos.map((a) => a.id));
  const validIds = new Set(contextAutos.map((a) => a.id));
  const contextList = contextAutos
    .map(
      (a) =>
        `- id: "${a.id}", naam: "${truncate(a.naam, 80)}", categorie: "${a.categorie}", systemen: ${JSON.stringify((a.systemen ?? []).slice(0, 3))}`,
    )
    .join("\n");
  const focusList = focusAutos
    .map((a) => {
      const stappen = (a.stappen ?? []).slice(0, 5).map((stap, index) => `${index + 1}. ${truncate(stap, 120)}`).join(" | ");
      return [
        `- id: "${a.id}"`,
        `  naam: "${truncate(a.naam, 110)}"`,
        `  categorie: "${a.categorie}", status: "${a.status}", source: "${a.source ?? ""}"`,
        `  doel: "${truncate(a.doel, 180)}"`,
        `  trigger: "${truncate(a.trigger_beschrijving, 180)}"`,
        `  systemen: ${JSON.stringify((a.systemen ?? []).slice(0, 6))}`,
        `  stappen: "${stappen}"`,
        `  webhook_paths: ${JSON.stringify((a.webhook_paths ?? []).slice(0, 4))}`,
        `  endpoints: ${JSON.stringify((a.endpoints ?? []).slice(0, 4))}`,
      ].join("\n");
    })
    .join("\n\n");
  const webhookContext = webhookSuggestions.length > 0
    ? `\nAl gevonden via webhook-matching (niet opnieuw opgeven):\n${webhookSuggestions.map((s) => `- ${s.from_id} -> ${s.to_id} (${s.reasoning})`).join("\n")}\n`
    : "";

  const prompt = `Je analyseert automatiseringen en stelt directe flow-koppelingen voor.

Taak:
- Kijk alleen naar de focus automations als mogelijke bron ("from").
- Kies als "to" een automation uit de context die waarschijnlijk direct hierna komt of direct gevoed/getriggerd wordt.
- Geef per focus automation maximaal 1 directe koppel terug.
- Geef maximaal 5 suggesties totaal terug.
- Houd redenering kort: maximaal 8 woorden.
- Suggesties mogen waarschijnlijk zijn, maar niet alleen omdat systemen of categorie hetzelfde zijn.
- Goede signalen: namen die op elkaar aansluiten, output/input, webhook/endpoint, deal/contact/status/fase die door de volgende automation wordt gebruikt, opeenvolgende processtappen.
- Ketens zijn toegestaan als losse koppels: A->B en B->C.
- Gebruik exact de IDs uit de lijsten.

Focus automations: geef alleen suggesties waarbij "from" in deze lijst staat:
${focusList}
${webhookContext}
Alle automations als context:
${contextList}

Antwoord uitsluitend in dit JSON-formaat:
{"suggesties": [{"from": "id1", "to": "id2", "redenering": "korte Nederlandse toelichting"}]}`;

  const controller = new AbortController();
  let timeout: number | undefined;

  try {
    const geminiRequest = fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${geminiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "Je bent een technische assistent voor een Nederlands boekhoudkantoor. Antwoord alleen in het gevraagde JSON-formaat. Geen extra tekst.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          max_tokens: 4000,
        }),
      },
    );
    const timeoutPromise = new Promise<Response>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error(`Gemini timeout na ${GEMINI_TIMEOUT_MS}ms`));
      }, GEMINI_TIMEOUT_MS);
    });
    const res = await Promise.race([geminiRequest, timeoutPromise]);

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.warn(`detect-flow-links: Gemini API error ${res.status}, skipping AI suggestions`, errorText);
      return { suggestions: [], status: "api-error", note: `Gemini API ${res.status}` };
    }

    const geminiResult = await res.json();
    const content = geminiResult.choices?.[0]?.message?.content;
    if (!content) return { suggestions: [], status: "invalid-json", note: "Leeg Gemini antwoord" };

    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    let parsed: { suggesties: { from: string; to: string; redenering: string }[] };
    try {
      parsed = JSON.parse(cleaned) as {
        suggesties: { from: string; to: string; redenering: string }[];
      };
    } catch {
      console.warn("detect-flow-links: Gemini returned invalid JSON", cleaned.slice(0, 300));
      const recovered = normalizeAiSuggestions(
        extractSuggestionsFromText(cleaned),
        focusIds,
        validIds,
        webhookPairs,
      );
      return {
        suggestions: recovered,
        status: recovered.length > 0 ? "partial-json" : "invalid-json",
        rawCount: recovered.length,
        note: cleaned.slice(0, 160),
      };
    }
    const suggestions = normalizeAiSuggestions(parsed.suggesties ?? [], focusIds, validIds, webhookPairs);

    return {
      suggestions,
      status: "ok",
      rawCount: parsed.suggesties?.length ?? 0,
    };
  } catch (e) {
    console.warn("detect-flow-links: Gemini request failed or timed out, skipping AI suggestions", errorMessage(e));
    return { suggestions: [], status: "timeout-or-error", note: errorMessage(e) };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function replaceSuggestionsForSources(
  db: ReturnType<typeof createClient>,
  sourceIds: string[],
  suggestions: Suggestie[],
  options: { preserveWebhookSuggestions?: boolean } = {},
) {
  const uniqueSourceIds = [...new Set(sourceIds)].filter(Boolean);
  if (uniqueSourceIds.length === 0) return;

  let deleteQuery = db
    .from("automatisering_ai_flows")
    .delete()
    .eq("confirmed", false)
    .eq("rejected", false)
    .is("flow_id", null)
    .in("from_id", uniqueSourceIds);

  if (options.preserveWebhookSuggestions) {
    deleteQuery = deleteQuery.lt("confidence", 1);
  }

  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;

  if (suggestions.length === 0) return;

  const uniqueSuggestions = new Map<string, Suggestie>();
  for (const suggestion of suggestions) addSuggestion(uniqueSuggestions, suggestion);

  const { error: insertError } = await db.from("automatisering_ai_flows").insert(
    [...uniqueSuggestions.values()].map((s) => ({
      from_id: s.from_id,
      to_id: s.to_id,
      confidence: s.confidence,
      reasoning: s.reasoning,
      confirmed: false,
      rejected: false,
    })),
  );
  if (insertError) throw insertError;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const payload = (await req.json().catch(() => ({}))) as DetectionPayload;
    const mode = parseMode(payload.mode);
    const offset = Math.max(0, Math.floor(Number(payload.offset ?? 0)));
    const limit = clampBatchSize(payload.limit);
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows, error: fetchError } = await db
      .from("automatiseringen")
      .select("id, naam, categorie, doel, trigger_beschrijving, systemen, stappen, status, source, webhook_paths, endpoints")
      .or("source.is.null,import_status.is.null,import_status.eq.approved");
    if (fetchError) throw fetchError;

    const autos: Automation[] = rows ?? [];
    const aiAutos = prioritizeForAi(autos);

    if (mode === "meta") {
      return jsonResponse({
        mode,
        totalAutomations: autos.length,
        aiTotal: aiAutos.length,
        batchSize: limit,
        batches: Math.ceil(aiAutos.length / limit),
      });
    }

    const webhookSuggestions = detectWebhookSuggestions(autos);
    let savedWebhook = 0;
    let aiSuggestions: Suggestie[] = [];
    let aiStatus: AiDetectionResult["status"] | undefined;
    let aiRawCount: number | undefined;
    let aiNote: string | undefined;

    if (mode === "webhook" || mode === "all") {
      await replaceSuggestionsForSources(
        db,
        webhookSuggestions.map((s) => s.from_id),
        webhookSuggestions,
      );
      savedWebhook = webhookSuggestions.length;
    }

    if (mode === "ai" || mode === "all") {
      const focusAutos = mode === "all" ? aiAutos.slice(0, limit) : aiAutos.slice(offset, offset + limit);
      const aiResult = await fetchAiSuggestions(focusAutos, aiAutos, webhookSuggestions);
      aiSuggestions = aiResult.suggestions;
      aiStatus = aiResult.status;
      aiRawCount = aiResult.rawCount;
      aiNote = aiResult.note;

      if ((aiResult.status === "ok" || aiResult.status === "partial-json") && aiSuggestions.length > 0) {
        await replaceSuggestionsForSources(
          db,
          focusAutos.map((a) => a.id),
          aiSuggestions,
          { preserveWebhookSuggestions: true },
        );
      }
    }

    return jsonResponse({
      mode,
      totalAutomations: autos.length,
      aiTotal: aiAutos.length,
      offset,
      limit,
      processed: mode === "ai" ? Math.min(limit, Math.max(0, aiAutos.length - offset)) : undefined,
      webhook: savedWebhook,
      ai: aiSuggestions.length,
      aiStatus,
      aiRawCount,
      aiNote,
    });
  } catch (e) {
    const message = errorMessage(e);
    console.error("detect-flow-links error:", message, e);
    return jsonResponse({ error: message }, 500);
  }
});
