import { supabase } from "@/integrations/supabase/client";
import type { HubSpotDiagnosisRequest } from "@/lib/brandyHubspotDiagnosis";

export type HubSpotDiagnosisRecordType = "deal" | "contact" | "company";
export type HubSpotDiagnosisOwnerLookup = "active" | "archived" | "missing";

export interface HubSpotDiagnosisPropertyHistoryEntry {
  value?: string;
  timestamp?: string;
  sourceType?: string;
  sourceId?: string;
}

export interface HubSpotDiagnosisDealSummary {
  id?: string;
  roleHint?: string;
  fetchStatus?: string;
  archived?: boolean;
  dealstage?: string;
  ownerProperties: Record<string, string>;
  propertyValues: Record<string, string | undefined>;
  propertyHistory: Record<string, HubSpotDiagnosisPropertyHistoryEntry[]>;
  associationCounts?: {
    contacts: number;
    companies: number;
    deals: number;
  };
}

export interface HubSpotDiagnosisAssociatedRecordSummary {
  parentDealId?: string;
  recordType?: HubSpotDiagnosisRecordType;
  id?: string;
  fetchStatus?: string;
  archived?: boolean;
  ownerProperties: Record<string, string>;
  propertyValues: Record<string, string | undefined>;
}

export interface HubSpotDiagnosisOwnerTeam {
  id?: string;
  name?: string;
  primary?: boolean;
}

export interface HubSpotDiagnosisOwnerLookupSummary {
  id?: string;
  lookup?: HubSpotDiagnosisOwnerLookup;
  found: boolean;
  archived?: boolean;
  email?: string;
  firstName?: string;
  lastName?: string;
  teams: HubSpotDiagnosisOwnerTeam[];
}

export interface HubSpotDiagnosisOwnerReference {
  ownerId?: string;
  recordType?: HubSpotDiagnosisRecordType;
  recordId?: string;
  propertyName?: string;
}

export interface HubSpotDiagnosisResult {
  request?: HubSpotDiagnosisRequest;
  deals: HubSpotDiagnosisDealSummary[];
  associatedRecords: HubSpotDiagnosisAssociatedRecordSummary[];
  owners: HubSpotDiagnosisOwnerLookupSummary[];
  suspectedOwnerReferences: HubSpotDiagnosisOwnerReference[];
  warnings: string[];
  summaryLines: string[];
  fetchedAt: string;
}

export async function fetchHubSpotDiagnosis(
  request: HubSpotDiagnosisRequest,
): Promise<HubSpotDiagnosisResult> {
  const { data, error } = await supabase.functions.invoke("hubspot-diagnose", {
    body: request,
  });

  if (error) {
    throw await toReadableFunctionError(error);
  }

  return normalizeHubSpotDiagnosisResult(data);
}

const HUBSPOT_DIAGNOSIS_GENERIC_ERROR = "HubSpot diagnose ophalen is mislukt";

async function toReadableFunctionError(error: unknown): Promise<Error> {
  if (!error || typeof error !== "object") {
    return new Error(HUBSPOT_DIAGNOSIS_GENERIC_ERROR);
  }

  const maybeError = error as { context?: unknown };
  const context = maybeError.context;

  if (context && typeof context === "object") {
    const maybeContext = context as { json?: unknown };

    if (typeof maybeContext.json === "function") {
      try {
        const errBody = await (maybeContext as { json: () => Promise<unknown> }).json();
        if (isObjectLike(errBody)) {
          const edgeError = optionalString(errBody.error);
          if (edgeError) {
            return new Error(edgeError);
          }
        }
      } catch {
        return new Error(HUBSPOT_DIAGNOSIS_GENERIC_ERROR);
      }
    }
  }

  return new Error(HUBSPOT_DIAGNOSIS_GENERIC_ERROR);
}

function normalizeHubSpotDiagnosisResult(data: unknown): HubSpotDiagnosisResult {
  if (!isObjectLike(data)) {
    throw new Error("HubSpot diagnose antwoord is ongeldig");
  }

  const response = data as Record<string, unknown>;

  return {
    request: isObjectLike(response.request) ? response.request as HubSpotDiagnosisRequest : undefined,
    deals: normalizeArray(response.deals, normalizeDealSummary),
    associatedRecords: normalizeArray(response.associatedRecords, normalizeAssociatedRecordSummary),
    owners: normalizeArray(response.owners, normalizeOwnerLookupSummary),
    suspectedOwnerReferences: normalizeArray(
      response.suspectedOwnerReferences,
      normalizeOwnerReference,
    ),
    warnings: normalizeStringArray(response.warnings),
    summaryLines: normalizeStringArray(response.summaryLines),
    fetchedAt: normalizeFetchedAt(response.fetchedAt),
  };
}

function normalizeDealSummary(value: unknown): HubSpotDiagnosisDealSummary | null {
  if (!isObjectLike(value)) return null;

  const record = value as Record<string, unknown>;
  return {
    id: optionalString(record.id),
    roleHint: optionalString(record.roleHint),
    fetchStatus: optionalString(record.fetchStatus),
    archived: optionalBoolean(record.archived),
    dealstage: optionalString(record.dealstage),
    ownerProperties: normalizeStringRecord(record.ownerProperties),
    propertyValues: normalizeOptionalStringRecord(record.propertyValues),
    propertyHistory: normalizePropertyHistory(record.propertyHistory),
    associationCounts: normalizeAssociationCounts(record.associationCounts),
  };
}

function normalizeAssociatedRecordSummary(value: unknown): HubSpotDiagnosisAssociatedRecordSummary | null {
  if (!isObjectLike(value)) return null;

  const record = value as Record<string, unknown>;
  return {
    parentDealId: optionalString(record.parentDealId),
    recordType: normalizeRecordType(record.recordType),
    id: optionalString(record.id),
    fetchStatus: optionalString(record.fetchStatus),
    archived: optionalBoolean(record.archived),
    ownerProperties: normalizeStringRecord(record.ownerProperties),
    propertyValues: normalizeOptionalStringRecord(record.propertyValues),
  };
}

function normalizeOwnerLookupSummary(value: unknown): HubSpotDiagnosisOwnerLookupSummary | null {
  if (!isObjectLike(value)) return null;

  const record = value as Record<string, unknown>;
  return {
    id: optionalString(record.id),
    lookup: normalizeOwnerLookup(record.lookup),
    found: record.found === true,
    archived: optionalBoolean(record.archived),
    email: optionalString(record.email),
    firstName: optionalString(record.firstName),
    lastName: optionalString(record.lastName),
    teams: normalizeArray(record.teams, normalizeOwnerTeam),
  };
}

function normalizeOwnerTeam(value: unknown): HubSpotDiagnosisOwnerTeam | null {
  if (!isObjectLike(value)) return null;

  const record = value as Record<string, unknown>;
  return {
    id: optionalString(record.id),
    name: optionalString(record.name),
    primary: optionalBoolean(record.primary),
  };
}

function normalizeOwnerReference(value: unknown): HubSpotDiagnosisOwnerReference | null {
  if (!isObjectLike(value)) return null;

  const record = value as Record<string, unknown>;
  return {
    ownerId: optionalString(record.ownerId),
    recordType: normalizeRecordType(record.recordType),
    recordId: optionalString(record.recordId),
    propertyName: optionalString(record.propertyName),
  };
}

function normalizePropertyHistory(value: unknown): Record<string, HubSpotDiagnosisPropertyHistoryEntry[]> {
  if (!isObjectLike(value)) return {};

  const history: Record<string, HubSpotDiagnosisPropertyHistoryEntry[]> = {};
  for (const [key, entries] of Object.entries(value as Record<string, unknown>)) {
    const cleanKey = optionalString(key);
    if (!cleanKey) continue;

    history[cleanKey] = normalizeArray(entries, normalizePropertyHistoryEntry);
  }
  return history;
}

function normalizePropertyHistoryEntry(value: unknown): HubSpotDiagnosisPropertyHistoryEntry | null {
  if (!isObjectLike(value)) return null;

  const record = value as Record<string, unknown>;
  return {
    value: optionalString(record.value),
    timestamp: optionalString(record.timestamp),
    sourceType: optionalString(record.sourceType),
    sourceId: optionalString(record.sourceId),
  };
}

function normalizeAssociationCounts(value: unknown): HubSpotDiagnosisDealSummary["associationCounts"] {
  if (!isObjectLike(value)) return undefined;

  const record = value as Record<string, unknown>;
  return {
    contacts: normalizeCount(record.contacts),
    companies: normalizeCount(record.companies),
    deals: normalizeCount(record.deals),
  };
}

function normalizeArray<T>(value: unknown, normalize: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalize).filter((item): item is T => item !== null);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(optionalString).filter((item): item is string => Boolean(item));
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isObjectLike(value)) return {};

  const record: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const cleanKey = optionalString(key);
    const cleanValue = optionalString(rawValue);
    if (cleanKey && cleanValue) record[cleanKey] = cleanValue;
  }
  return record;
}

function normalizeOptionalStringRecord(value: unknown): Record<string, string | undefined> {
  if (!isObjectLike(value)) return {};

  const record: Record<string, string | undefined> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const cleanKey = optionalString(key);
    if (cleanKey) record[cleanKey] = optionalString(rawValue);
  }
  return record;
}

function normalizeFetchedAt(value: unknown): string {
  const fetchedAt = optionalString(value);
  if (!fetchedAt) return new Date().toISOString();

  const timestamp = Date.parse(fetchedAt);
  return Number.isNaN(timestamp) ? new Date().toISOString() : fetchedAt;
}

function normalizeRecordType(value: unknown): HubSpotDiagnosisRecordType | undefined {
  return value === "deal" || value === "contact" || value === "company" ? value : undefined;
}

function normalizeOwnerLookup(value: unknown): HubSpotDiagnosisOwnerLookup | undefined {
  return value === "active" || value === "archived" || value === "missing" ? value : undefined;
}

function normalizeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
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

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
