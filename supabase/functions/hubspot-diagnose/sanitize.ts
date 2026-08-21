export type HubSpotRecordType = "deal" | "contact" | "company";

export interface DiagnosisDealInput {
  id: string;
  roleHint: string;
}

export interface DiagnosisRequest {
  dealIds: DiagnosisDealInput[];
  ownerIds: string[];
  propertyNames: string[];
  expectedStageHints: string[];
}

export type DiagnosisValidation =
  | { ok: true; value: DiagnosisRequest }
  | { ok: false; error: string };

export interface SanitizedCrmObject {
  recordType: HubSpotRecordType;
  id: string;
  archived: boolean;
  properties: Record<string, string | undefined>;
  propertyHistory: Record<string, SanitizedPropertyHistoryEntry[]>;
  ownerProperties: Record<string, string>;
}

export interface SanitizedPropertyHistoryEntry {
  value?: string;
  timestamp?: string;
  sourceType?: string;
  sourceId?: string;
}

export interface OwnerReference {
  ownerId: string;
  recordType: HubSpotRecordType;
  recordId: string;
  propertyName: string;
}

export type OwnerLookup = "active" | "archived" | "missing";

export interface SanitizedOwner {
  id: string;
  lookup: OwnerLookup;
  found: boolean;
  archived?: boolean;
  firstName?: string;
  lastName?: string;
  teams: SanitizedOwnerTeam[];
}

export interface SanitizedOwnerTeam {
  id?: string;
  name?: string;
  primary?: boolean;
}

export interface DiagnosisSummaryInput {
  suspectedOwnerReferences: OwnerReference[];
  owners: SanitizedOwner[];
  warnings: string[];
}

const MAX_DEALS = 2;
const MAX_OWNERS = 3;
const MAX_PROPERTIES = 5;
const DIAGNOSTIC_PROPERTY_ALLOWLIST = new Set(["jaarrekeningen_klaar_om_ib_te_maken"]);
const TOKEN_LIKE_RE = /token|secret|password|authorization|cookie/i;

export function validateHubSpotDiagnosisRequest(input: unknown): DiagnosisValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Ongeldige HubSpot diagnose aanvraag" };
  }

  const record = input as Record<string, unknown>;
  if (!Array.isArray(record.dealIds) || record.dealIds.length === 0) {
    return { ok: false, error: "Minimaal een geldige HubSpot deal id is vereist" };
  }
  if (!Array.isArray(record.ownerIds) || record.ownerIds.length === 0) {
    return { ok: false, error: "Minimaal een geldige HubSpot owner id is vereist" };
  }
  if (!Array.isArray(record.propertyNames)) {
    return { ok: false, error: "Ongeldige HubSpot property lijst" };
  }
  if (record.dealIds.length > MAX_DEALS) {
    return { ok: false, error: `Maximaal ${MAX_DEALS} HubSpot deals toegestaan` };
  }
  if (record.ownerIds.length > MAX_OWNERS) {
    return { ok: false, error: `Maximaal ${MAX_OWNERS} HubSpot owners toegestaan` };
  }
  if (record.propertyNames.length > MAX_PROPERTIES) {
    return { ok: false, error: `Maximaal ${MAX_PROPERTIES} HubSpot properties toegestaan` };
  }

  const dealIds = record.dealIds.map(validateDealInput);
  if (dealIds.some((deal) => !deal)) {
    return { ok: false, error: "Ongeldige HubSpot deal id" };
  }

  const ownerIds = record.ownerIds.map(toCleanString);
  if (ownerIds.some((ownerId) => !isNumericId(ownerId))) {
    return { ok: false, error: "Ongeldige HubSpot owner id" };
  }

  const propertyNames = record.propertyNames.map(toCleanString);
  if (propertyNames.some((propertyName) => !isAllowedDiagnosticProperty(propertyName))) {
    return { ok: false, error: "Ongeldige HubSpot property naam" };
  }

  const expectedStageHints = Array.isArray(record.expectedStageHints)
    ? record.expectedStageHints.map(toCleanString).filter(Boolean).slice(0, 3)
    : [];

  return {
    ok: true,
    value: {
      dealIds: dealIds as DiagnosisDealInput[],
      ownerIds,
      propertyNames,
      expectedStageHints,
    },
  };
}

export function buildDealUrl(dealId: string, propertyNames: string[]): URL {
  const url = new URL(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(dealId)}`);
  const selectedProperties = propertyNames.filter(isAllowedDiagnosticProperty);
  const properties = uniqueStrings(["dealstage", "hubspot_owner_id", ...selectedProperties]);
  url.searchParams.set("properties", properties.join(","));
  if (selectedProperties.length > 0) {
    url.searchParams.set("propertiesWithHistory", selectedProperties.join(","));
  }
  url.searchParams.set("archived", "false");
  return url;
}

export function buildCrmObjectUrl(recordType: HubSpotRecordType, id: string): URL {
  const pluralType = recordType === "company" ? "companies" : `${recordType}s`;
  const url = new URL(`https://api.hubapi.com/crm/v3/objects/${pluralType}/${encodeURIComponent(id)}`);
  url.searchParams.set("properties", "hubspot_owner_id");
  url.searchParams.set("archived", "false");
  return url;
}

export function buildAssociationUrl(
  fromType: "deals" | "contacts" | "companies",
  fromId: string,
  toType: "deals" | "contacts" | "companies",
): string {
  return `https://api.hubapi.com/crm/v4/objects/${fromType}/${encodeURIComponent(fromId)}/associations/${toType}`;
}

export function buildOwnerUrl(ownerId: string, archived: boolean): string {
  const url = new URL(`https://api.hubapi.com/crm/v3/owners/${encodeURIComponent(ownerId)}`);
  url.searchParams.set("idProperty", "id");
  url.searchParams.set("archived", archived ? "true" : "false");
  return url.toString();
}

export function sanitizeCrmObject(
  recordType: HubSpotRecordType,
  input: unknown,
  propertyNames: string[],
): SanitizedCrmObject {
  const record = asRecord(input);
  const rawProperties = asRecord(record.properties);
  const rawHistory = asRecord(record.propertiesWithHistory);
  const safeProperties: Record<string, string | undefined> = {
    dealstage: optionalString(rawProperties.dealstage),
    hubspot_owner_id: optionalString(rawProperties.hubspot_owner_id),
  };

  for (const [key, value] of Object.entries(rawProperties)) {
    if (isOwnerReferenceProperty(key, value)) {
      safeProperties[key] = optionalString(value);
    }
  }

  for (const propertyName of propertyNames) {
    if (isAllowedDiagnosticProperty(propertyName)) {
      safeProperties[propertyName] = optionalString(rawProperties[propertyName]);
    }
  }

  const propertyHistory: Record<string, SanitizedPropertyHistoryEntry[]> = {};
  for (const propertyName of propertyNames) {
    if (!isAllowedDiagnosticProperty(propertyName)) continue;
    const entries = rawHistory[propertyName];
    propertyHistory[propertyName] = Array.isArray(entries)
      ? entries.map(sanitizeHistoryEntry).filter((entry) => Object.keys(entry).length > 0)
      : [];
  }

  const ownerProperties = Object.fromEntries(
    Object.entries(safeProperties).filter(
      ([key, value]) => isOwnerReferenceProperty(key, value),
    ),
  ) as Record<string, string>;

  return {
    recordType,
    id: optionalString(record.id) ?? "",
    archived: record.archived === true,
    properties: safeProperties,
    propertyHistory,
    ownerProperties,
  };
}

export function findOwnerReferences(record: SanitizedCrmObject, ownerIds: string[]): OwnerReference[] {
  const ownerIdSet = new Set(ownerIds);
  return Object.entries(record.ownerProperties)
    .filter(([, value]) => ownerIdSet.has(value))
    .map(([propertyName, ownerId]) => ({
      ownerId,
      recordType: record.recordType,
      recordId: record.id,
      propertyName,
    }));
}

export function sanitizeOwner(ownerId: string, input: unknown, lookup: OwnerLookup): SanitizedOwner {
  const record = asRecord(input);
  const ownerRecord = asRecord(record.owner);
  const source = Object.keys(ownerRecord).length > 0 ? ownerRecord : record;
  const teams = Array.isArray(source.teams) ? source.teams.map(sanitizeOwnerTeam) : [];

  return {
    id: optionalString(source.id) ?? ownerId,
    lookup,
    found: lookup !== "missing",
    archived: lookup === "missing" ? undefined : source.archived === true || lookup === "archived",
    firstName: optionalString(source.firstName),
    lastName: optionalString(source.lastName),
    teams,
  };
}

export function extractAssociationIds(input: unknown): string[] {
  const record = asRecord(input);
  const results = Array.isArray(record.results) ? record.results : [];
  const ids = results
    .map((result) => {
      const association = asRecord(result);
      const to = asRecord(association.to);
      return optionalString(association.toObjectId) ?? optionalString(to.objectId) ?? optionalString(association.id);
    })
    .filter((id): id is string => Boolean(id));
  return uniqueStrings(ids);
}

export function buildDiagnosisSummaryLines(input: DiagnosisSummaryInput): string[] {
  const lines: string[] = [];

  for (const reference of input.suspectedOwnerReferences) {
    lines.push(
      `Gevonden: owner ${reference.ownerId} staat op ${reference.recordType} ${reference.recordId} via ${reference.propertyName}.`,
    );
  }

  for (const owner of input.owners) {
    if (owner.found && owner.lookup === "archived") {
      lines.push(`Waarschijnlijk: owner ${owner.id} is alleen als archived owner gevonden.`);
    }
    if (!owner.found || owner.lookup === "missing") {
      lines.push(`Niet gevonden: owner ${owner.id} is niet gevonden in actieve of archived owners.`);
    }
  }

  for (const warning of input.warnings) {
    lines.push(`Niet gecontroleerd: ${warning}`);
  }

  return uniqueStrings(lines);
}

function validateDealInput(input: unknown): DiagnosisDealInput | null {
  const record = asRecord(input);
  const id = toCleanString(record.id);
  if (!isNumericId(id)) return null;

  return {
    id,
    roleHint: toCleanString(record.roleHint) || "deal",
  };
}

function sanitizeHistoryEntry(input: unknown): SanitizedPropertyHistoryEntry {
  const record = asRecord(input);
  return {
    value: optionalString(record.value),
    timestamp: optionalString(record.timestamp),
    sourceType: optionalString(record.sourceType),
    sourceId: optionalString(record.sourceId),
  };
}

function sanitizeOwnerTeam(input: unknown): SanitizedOwnerTeam {
  const record = asRecord(input);
  const team: SanitizedOwnerTeam = {
    id: optionalString(record.id),
    name: optionalString(record.name),
  };
  if (typeof record.primary === "boolean") {
    team.primary = record.primary;
  }
  return team;
}

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function toCleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function isNumericId(value: string): boolean {
  return /^\d{1,32}$/.test(value);
}

function isPropertyName(value: string): boolean {
  return /^[a-z][a-z0-9_]{2,80}$/.test(value);
}

function isAllowedDiagnosticProperty(value: string): boolean {
  return isPropertyName(value) && isSafePropertyKey(value) && DIAGNOSTIC_PROPERTY_ALLOWLIST.has(value);
}

function isSafePropertyKey(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]{1,100}$/.test(value) && !TOKEN_LIKE_RE.test(value);
}

function isOwnerReferenceProperty(key: string, value: unknown): boolean {
  if (!isSafePropertyKey(key)) return false;
  if (/^user_/i.test(key)) return false;
  const ownerId = optionalString(value);
  if (!ownerId || !isNumericId(ownerId)) return false;
  if (key === "hubspot_owner_id") return true;
  return /(?:^|_)(?:owner|eigenaar)(?:_[a-z0-9]+)*_id$/i.test(key);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
