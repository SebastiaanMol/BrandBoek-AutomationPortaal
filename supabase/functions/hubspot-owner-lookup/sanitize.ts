export interface ValidHubSpotOwnerLookupRequest {
  ok: true;
  ownerId: string;
}

export interface InvalidHubSpotOwnerLookupRequest {
  ok: false;
  error: string;
}

export type HubSpotOwnerLookupValidation =
  | ValidHubSpotOwnerLookupRequest
  | InvalidHubSpotOwnerLookupRequest;

export interface SanitizedHubSpotOwnerTeam {
  id: string;
  name: string;
  primary: boolean;
}

export interface SanitizedHubSpotOwner {
  id: string;
  firstName?: string;
  lastName?: string;
  userId?: string;
  userIdIncludingInactive?: string;
  archived: boolean;
  createdAt?: string;
  updatedAt?: string;
  teams: SanitizedHubSpotOwnerTeam[];
}

export function validateHubSpotOwnerLookupRequest(input: unknown): HubSpotOwnerLookupValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Ongeldige HubSpot owner lookup aanvraag" };
  }

  const ownerId = String((input as { ownerId?: unknown }).ownerId ?? "").trim();
  if (!/^\d{1,32}$/.test(ownerId)) {
    return { ok: false, error: "Ongeldige HubSpot owner id" };
  }

  return { ok: true, ownerId };
}

export function buildHubSpotOwnerUrl(ownerId: string): string {
  const url = new URL(`https://api.hubapi.com/crm/v3/owners/${encodeURIComponent(ownerId)}`);
  url.searchParams.set("idProperty", "id");
  url.searchParams.set("archived", "false");
  return url.toString();
}

export function sanitizeHubSpotOwner(input: unknown): SanitizedHubSpotOwner {
  const record = asRecord(input);

  return {
    id: optionalString(record.id) ?? "",
    firstName: optionalString(record.firstName),
    lastName: optionalString(record.lastName),
    userId: optionalString(record.userId),
    userIdIncludingInactive: optionalString(record.userIdIncludingInactive),
    archived: record.archived === true,
    createdAt: optionalString(record.createdAt),
    updatedAt: optionalString(record.updatedAt),
    teams: Array.isArray(record.teams)
      ? record.teams.map(sanitizeHubSpotOwnerTeam).filter((team): team is SanitizedHubSpotOwnerTeam => Boolean(team))
      : [],
  };
}

function sanitizeHubSpotOwnerTeam(input: unknown): SanitizedHubSpotOwnerTeam | null {
  const record = asRecord(input);
  const id = optionalString(record.id);
  const name = optionalString(record.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    primary: record.primary === true,
  };
}

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
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
