import type { Automatisering } from "./types";

export function isGitLabSourceRecord(automation: Automatisering): boolean {
  const source = automation.source?.toLowerCase();
  return source === "gitlab" || Boolean(
    automation.gitlabEndpoint ||
    automation.gitlabFilePath ||
    automation.importProposal?.gitlab_endpoint ||
    automation.importProposal?.gitlab?.endpoint,
  );
}

export function isSpecificGitLabEndpointAutomation(automation: Automatisering): boolean {
  if (!isGitLabSourceRecord(automation)) return false;

  const gitlabEndpoint = automation.gitlabEndpoint ?? automation.importProposal?.gitlab_endpoint;
  const importedEndpoint = automation.importProposal?.gitlab?.endpoint;
  const fallbackEndpoint = automation.source?.toLowerCase() === "gitlab" &&
    !automation.gitlabFilePath &&
    !automation.externalId &&
    (automation.endpoints ?? []).some((endpoint) => endpoint.trim());

  return Boolean(
    gitlabEndpoint?.endpoint?.trim() ||
    importedEndpoint?.path?.trim() ||
    fallbackEndpoint,
  );
}
