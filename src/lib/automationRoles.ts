import type { Automatisering } from "./types";

export function automationRuntimeRoleLabel(automation?: Pick<Automatisering, "source" | "categorie"> | null): string {
  const source = automation?.source?.toLowerCase();
  if (source === "gitlab") return "Backend worker";
  if (source === "hubspot") return "HubSpot workflow";
  if (source === "zapier") return "Zapier automation";
  if (source === "typeform") return "Typeform trigger";
  if (automation?.categorie === "Backend Script") return "Backend worker";
  if (automation?.categorie === "HubSpot Workflow") return "HubSpot workflow";
  return "Automation";
}

export function sourceRuntimeRoleLabel(source?: string | null, categorie?: string | null): string {
  const normalized = source?.toLowerCase();
  if (normalized === "gitlab") return "Backend worker";
  if (normalized === "hubspot") return "HubSpot workflow";
  if (normalized === "zapier") return "Zapier automation";
  if (normalized === "typeform") return "Typeform trigger";
  if (categorie === "Backend Script") return "Backend worker";
  if (categorie === "HubSpot Workflow") return "HubSpot workflow";
  return "Automation";
}
