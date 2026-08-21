import { supabase } from "@/integrations/supabase/client";

export interface HubSpotOwnerTeam {
  id: string;
  name: string;
  primary: boolean;
}

export interface HubSpotOwner {
  id: string;
  firstName?: string;
  lastName?: string;
  userId?: string;
  userIdIncludingInactive?: string;
  archived: boolean;
  createdAt?: string;
  updatedAt?: string;
  teams: HubSpotOwnerTeam[];
}

export interface HubSpotOwnerLookupResult {
  owner: HubSpotOwner;
  fetchedAt: string;
}

export async function fetchHubSpotOwner(ownerId: string): Promise<HubSpotOwnerLookupResult> {
  const { data, error } = await supabase.functions.invoke("hubspot-owner-lookup", {
    body: { ownerId },
  });

  if (error) {
    throw await toReadableFunctionError(error);
  }

  return normalizeHubSpotOwnerLookupResult(data);
}

async function toReadableFunctionError(error: unknown): Promise<Error> {
  if (!error || typeof error !== "object") {
    return new Error("HubSpot owner ophalen is mislukt");
  }

  const maybeError = error as { context?: unknown };
  const context = maybeError.context;

  if (context && typeof context === "object") {
    const maybeContext = context as { error?: unknown; json?: unknown };
    if (typeof maybeContext.error === "string" && maybeContext.error.trim()) {
      return new Error(maybeContext.error);
    }

    if (typeof maybeContext.json === "function") {
      try {
        const errBody = await (maybeContext as { json: () => Promise<Record<string, unknown>> }).json();
        if (typeof errBody.error === "string" && errBody.error.trim()) {
          return new Error(errBody.error);
        }
      } catch (contextError) {
        return new Error("HubSpot owner ophalen is mislukt");
      }
    }
  }

  return new Error("HubSpot owner ophalen is mislukt");
}

function normalizeHubSpotOwnerLookupResult(data: unknown): HubSpotOwnerLookupResult {
  if (!data || typeof data !== "object") {
    throw new Error("HubSpot owner antwoord is ongeldig");
  }

  const response = data as { owner?: unknown; fetchedAt?: unknown };
  if (!response.owner || typeof response.owner !== "object") {
    throw new Error("HubSpot owner antwoord mist owner data");
  }

  const owner = response.owner as Partial<HubSpotOwner>;
  if (typeof owner.id !== "string" || !owner.id.trim()) {
    throw new Error("HubSpot owner antwoord mist owner id");
  }

  return {
    owner: {
      id: owner.id,
      firstName: optionalString(owner.firstName),
      lastName: optionalString(owner.lastName),
      userId: optionalString(owner.userId),
      userIdIncludingInactive: optionalString(owner.userIdIncludingInactive),
      archived: owner.archived === true,
      createdAt: optionalString(owner.createdAt),
      updatedAt: optionalString(owner.updatedAt),
      teams: Array.isArray(owner.teams)
        ? owner.teams.filter(isHubSpotOwnerTeam)
        : [],
    },
    fetchedAt: typeof response.fetchedAt === "string" && response.fetchedAt.trim()
      ? response.fetchedAt
      : new Date().toISOString(),
  };
}

function isHubSpotOwnerTeam(value: unknown): value is HubSpotOwnerTeam {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const team = value as Partial<HubSpotOwnerTeam>;
  return (
    typeof team.id === "string" &&
    team.id.trim().length > 0 &&
    typeof team.name === "string" &&
    team.name.trim().length > 0 &&
    typeof team.primary === "boolean"
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
