import type { Automatisering } from "./types";

const HUBSPOT_PORTAL_ID = "6108551";

export function isHubSpotAutomation(automation: Automatisering): boolean {
  return automation.source?.toLowerCase() === "hubspot" || automation.categorie === "HubSpot Workflow";
}

export function getHubSpotWorkflowSourceUrl(automation: Automatisering): string | null {
  if (!isHubSpotAutomation(automation)) return null;

  const workflowId = getHubSpotWorkflowId(automation);
  if (!workflowId) return null;

  return `https://app.hubspot.com/workflows/${HUBSPOT_PORTAL_ID}/platform/flow/${encodeURIComponent(workflowId)}/edit`;
}

function getHubSpotWorkflowId(automation: Automatisering): string | null {
  const workflowId = automation.hubspotWorkflow?.workflowId ?? automation.externalId;
  const normalizedWorkflowId = typeof workflowId === "string" ? workflowId.trim() : "";
  return normalizedWorkflowId || null;
}
