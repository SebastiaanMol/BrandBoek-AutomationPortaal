import type { BrandyResponse } from "@/lib/brandy";
import type { HubSpotOwnerLookupResult } from "@/lib/storage/hubspotOwnerLookup";

const OWNER_ENDPOINT_RE = /\/crm\/v3\/owners\/(\d+)(?:\b|[/?#])/i;
const OWNER_WORD_RE = /\b(?:owner|eigenaar)\b/i;
const HUBSPOT_WORD_RE = /\bhubspot\b/i;
const OWNER_ID_RE = /\b(\d{3,32})\b/;
const OWNER_LOOKUP_INTENT_RE = /\b(?:zoek|lookup|haal|fetch|get|wie is|owner lookup|eigenaar lookup)\b/i;

export function parseHubSpotOwnerLookupQuestion(question: string): string | null {
  const value = question.trim();
  if (!value) return null;

  const endpointMatch = value.match(OWNER_ENDPOINT_RE);
  if (endpointMatch?.[1]) return endpointMatch[1];

  if (!HUBSPOT_WORD_RE.test(value) || !OWNER_WORD_RE.test(value) || !OWNER_LOOKUP_INTENT_RE.test(value)) return null;

  return value.match(OWNER_ID_RE)?.[1] ?? null;
}

export function buildHubSpotOwnerBrandyResponse(result: HubSpotOwnerLookupResult): BrandyResponse {
  const { owner, fetchedAt } = result;
  const displayName = [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim() || "Naam onbekend";
  const teams = owner.teams.map((team) => team.primary ? `${team.name} (primair)` : team.name).join(", ");
  const status = owner.archived ? "gearchiveerd" : "actief";
  const details = [
    `Naam: ${displayName}`,
    `Status: ${status}`,
    teams ? `Teams: ${teams}` : "Teams: geen teaminformatie",
    owner.userId ? `HubSpot userId: ${owner.userId}` : null,
    `Opgehaald: ${formatDutchDateTime(fetchedAt)}`,
  ].filter(Boolean);

  return {
    antwoord: `Ik heb HubSpot owner ${owner.id} opgehaald.\n\n${details.join("\n")}`,
    bronnen: ["HubSpot owners API"],
    entiteiten: [owner.id, displayName].filter((item): item is string => Boolean(item)),
    zekerheid: "hoog",
  };
}

function formatDutchDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}
