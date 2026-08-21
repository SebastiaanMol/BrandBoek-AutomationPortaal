import type { BrandyResponse } from "@/lib/brandy";
import type {
  HubSpotDiagnosisOwnerLookupSummary,
  HubSpotDiagnosisOwnerReference,
  HubSpotDiagnosisResult,
} from "@/lib/storage/hubspotDiagnosis";

const MAX_DEALS = 2;
const MAX_OWNERS = 3;
const MAX_PROPERTIES = 5;

const DEAL_RE = /\b((?:IB|Jaarrekening)\s+deal|deal)(?:\s+ID)?\s+(\d{3,32})\b/gi;
const OWNER_RE = /\b(?:owner|eigenaar)(?:\s+ID)?\s+(\d{3,32})\b/gi;
const PROPERTY_RE = /\b(?:property|properties|eigenschap)\s+([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/gi;
const STAGE_RE = /\bstage\s+([^.\n\r]+)/gi;
const DEAL_CONTEXT_RE = /\bdeal\b/i;
const OWNER_CONTEXT_RE = /\b(?:owner|eigenaar)\b/i;
const DIAGNOSIS_INTENT_RE = /\b(?:diagnose|diagnosticeer|onderzoek|check|controleer|fout|error|kapot|mislukt|waarom|issue|api|owner api|owners api|archived|gearchiveerd)\b/i;

export interface HubSpotDiagnosisDealInput {
  id: string;
  roleHint: "IB deal" | "Jaarrekening deal" | "deal";
}

export interface HubSpotDiagnosisRequest {
  dealIds: HubSpotDiagnosisDealInput[];
  ownerIds: string[];
  propertyNames: string[];
  expectedStageHints: string[];
}

export function parseHubSpotDiagnosisQuestion(question: string): HubSpotDiagnosisRequest | null {
  const value = question.trim();
  if (!value || !DEAL_CONTEXT_RE.test(value) || !OWNER_CONTEXT_RE.test(value) || !DIAGNOSIS_INTENT_RE.test(value)) return null;

  const dealIds = collectMatches(value, DEAL_RE, (match) => ({
    id: match[2],
    roleHint: normalizeRoleHint(match[1]),
  }), MAX_DEALS, (deal) => deal.id, mergeDealInput);
  const ownerIds = collectMatches(value, OWNER_RE, (match) => match[1], MAX_OWNERS, normalizeEntityKey);
  const propertyNames = collectMatches(
    value,
    PROPERTY_RE,
    (match) => match[1],
    MAX_PROPERTIES,
    normalizeEntityKey
  );
  const expectedStageHints = collectMatches(value, STAGE_RE, (match) => cleanHint(match[1]), MAX_PROPERTIES);

  if (dealIds.length === 0 || ownerIds.length === 0) return null;

  return {
    dealIds,
    ownerIds,
    propertyNames,
    expectedStageHints,
  };
}

export function buildHubSpotDiagnosisBrandyResponse(result: HubSpotDiagnosisResult): BrandyResponse {
  const request = result.request;
  const summaryLines = result.summaryLines.map(sanitizeSensitiveText);
  const ownerLines = result.owners.map(formatOwnerLookup).filter(Boolean);
  const ownerReferenceLines = result.suspectedOwnerReferences.map(formatOwnerReference).filter(Boolean);
  const warningLines = result.warnings.map(sanitizeSensitiveText);
  const fetchedAt = result.fetchedAt ? formatDutchDateTime(result.fetchedAt) : undefined;

  const sections = [
    "Ik heb de HubSpot diagnose uitgevoerd.",
    summaryLines.length > 0 ? ["Samenvatting:", ...summaryLines.map((line) => `- ${line}`)].join("\n") : null,
    ownerReferenceLines.length > 0
      ? ["Verdachte owner-verwijzingen:", ...ownerReferenceLines.map((line) => `- ${line}`)].join("\n")
      : null,
    ownerLines.length > 0 ? ["Owner checks:", ...ownerLines.map((line) => `- ${line}`)].join("\n") : null,
    warningLines.length > 0 ? ["Waarschuwingen:", ...warningLines.map((line) => `- ${line}`)].join("\n") : null,
    fetchedAt ? `Opgehaald: ${fetchedAt}` : null,
  ].filter((section): section is string => Boolean(section));

  return {
    antwoord: sections.join("\n\n"),
    bronnen: buildDiagnosisSources(result),
    entiteiten: buildDiagnosisEntities(result),
    zekerheid: hasRealEvidence(result) && result.warnings.length === 0 ? "hoog" : "gemiddeld",
    diagnose_modus: true,
  };
}

function buildDiagnosisEntities(result: HubSpotDiagnosisResult): string[] {
  const request = result.request;
  const entities = [
    ...(request?.dealIds.map((deal) => `deal ${deal.id}`) ?? []),
    ...(request?.ownerIds.map((ownerId) => `owner ${ownerId}`) ?? []),
    ...(request?.propertyNames.map((propertyName) => `property ${propertyName}`) ?? []),
    ...result.deals.map((deal) => deal.id ? `deal ${deal.id}` : null),
    ...result.owners.map((owner) => owner.id ? `owner ${owner.id}` : null),
    ...result.suspectedOwnerReferences.map((reference) => reference.ownerId ? `owner ${reference.ownerId}` : null),
  ].filter((entity): entity is string => Boolean(entity));

  return Array.from(new Set(entities));
}

function buildDiagnosisSources(result: HubSpotDiagnosisResult): string[] {
  const sources = ["HubSpot diagnose"];
  if (result.deals.length > 0 || result.associatedRecords.length > 0) sources.push("HubSpot CRM API");
  if (result.owners.length > 0) sources.push("HubSpot owners API");
  return sources;
}

function hasRealEvidence(result: HubSpotDiagnosisResult): boolean {
  return (
    result.summaryLines.length > 0 ||
    result.deals.length > 0 ||
    result.associatedRecords.length > 0 ||
    result.owners.length > 0 ||
    result.suspectedOwnerReferences.length > 0
  );
}

function formatOwnerLookup(owner: HubSpotDiagnosisOwnerLookupSummary): string | null {
  if (!owner.id) return null;

  const name = [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim();
  const lookup = owner.lookup ? lookupLabel(owner.lookup) : owner.found ? "gevonden" : "niet gevonden";
  const archiveStatus = owner.archived ? "gearchiveerd" : "actief";
  const teams = owner.teams
    .map((team) => {
      if (!team.name) return null;
      return team.primary ? `${team.name} (primair)` : team.name;
    })
    .filter(Boolean)
    .join(", ");

  return [
    `Owner ${owner.id}`,
    name || null,
    lookup,
    owner.found ? archiveStatus : null,
    teams ? `teams: ${teams}` : null,
  ].filter(Boolean).join(": ");
}

function lookupLabel(value: NonNullable<HubSpotDiagnosisOwnerLookupSummary["lookup"]>): string {
  if (value === "active") return "actieve lookup";
  if (value === "archived") return "gearchiveerde lookup";
  return "niet gevonden";
}

function formatOwnerReference(reference: HubSpotDiagnosisOwnerReference): string | null {
  if (!reference.ownerId) return null;

  const record = [reference.recordType, reference.recordId].filter(Boolean).join(" ");
  const property = reference.propertyName ? ` via ${reference.propertyName}` : "";
  return `${record || "Record"}${property} verwijst naar owner ${reference.ownerId}.`;
}

function sanitizeSensitiveText(value: string): string {
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[e-mail verborgen]");
}

function formatDutchDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function collectMatches<T>(
  value: string,
  pattern: RegExp,
  map: (match: RegExpExecArray) => T,
  limit: number,
  keyForItem?: (item: T) => string,
  mergeItem?: (current: T, next: T) => T
): T[] {
  pattern.lastIndex = 0;
  const items: T[] = [];
  const indexesByKey = new Map<string, number>();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    const item = map(match);

    if (!keyForItem) {
      if (items.length < limit) items.push(item);
      continue;
    }

    const key = keyForItem(item);
    const existingIndex = indexesByKey.get(key);
    if (existingIndex !== undefined) {
      items[existingIndex] = mergeItem ? mergeItem(items[existingIndex], item) : items[existingIndex];
      continue;
    }

    if (items.length < limit) {
      indexesByKey.set(key, items.length);
      items.push(item);
    }
  }

  return items;
}

function mergeDealInput(
  current: HubSpotDiagnosisDealInput,
  next: HubSpotDiagnosisDealInput
): HubSpotDiagnosisDealInput {
  if (current.roleHint === "deal" && next.roleHint !== "deal") return next;
  return current;
}

function normalizeEntityKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeRoleHint(value: string): HubSpotDiagnosisDealInput["roleHint"] {
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  if (normalized === "ib deal") return "IB deal";
  if (normalized === "jaarrekening deal") return "Jaarrekening deal";
  return "deal";
}

function cleanHint(value: string): string {
  return value.trim().replace(/[,:;]+$/g, "");
}
