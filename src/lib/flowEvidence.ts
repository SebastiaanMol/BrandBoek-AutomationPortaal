import type { Automatisering } from "./types";
import type { FlowSuggestie } from "./storage/automationLinks";
import { parseGitLabExternalEndpoint } from "./automationFunnel";

export type FlowEvidenceLevel = "confirmed" | "hard" | "strong" | "weak" | "uncertain";

export interface FlowEvidence {
  level: FlowEvidenceLevel;
  label: string;
  score: number;
  reason: string;
}

export interface FlowEvidenceInput {
  from?: Automatisering;
  to?: Automatisering;
  source: "confirmed" | "manual" | "sequential" | "suggestion";
  suggestion?: Pick<FlowSuggestie, "zekerheid" | "redenering" | "confirmed">;
  label?: string;
}

export function evaluateFlowEvidence({
  from,
  to,
  source,
  suggestion,
  label,
}: FlowEvidenceInput): FlowEvidence {
  if (source === "confirmed" || suggestion?.confirmed) {
    return {
      level: "confirmed",
      label: "Bevestigd",
      score: 100,
      reason: "Deze overgang is bevestigd en opgeslagen als officiële koppeling.",
    };
  }

  if (source === "manual") {
    return {
      level: "confirmed",
      label: "Bevestigd",
      score: 95,
      reason: label
        ? `Deze overgang komt uit een handmatige koppeling: ${label}.`
        : "Deze overgang komt uit een bestaande handmatige koppeling.",
    };
  }

  if (suggestion?.zekerheid === "webhook") {
    return {
      level: "hard",
      label: "Hard bewijs",
      score: 90,
      reason: suggestion.redenering
        ? `Exacte webhook/endpoint match: ${suggestion.redenering}.`
        : "Deze overgang is gebaseerd op een exacte webhook/endpoint match.",
    };
  }

  const endpointEvidence = inferEndpointEvidence(from, to);
  if (endpointEvidence) return endpointEvidence;

  if (suggestion?.zekerheid === "ai") {
    return {
      level: suggestion.redenering ? "strong" : "weak",
      label: suggestion.redenering ? "Sterke match" : "Zwakke match",
      score: suggestion.redenering ? 70 : 45,
      reason: suggestion.redenering || "Deze overgang is voorgesteld zonder duidelijke technische match.",
    };
  }

  if (source === "sequential") {
    return {
      level: "uncertain",
      label: "Onzeker",
      score: 30,
      reason: "Deze overgang is alleen afgeleid uit de volgorde van automations in de flow.",
    };
  }

  return {
    level: "weak",
    label: "Zwakke match",
    score: 45,
    reason: "Deze overgang heeft nog geen hard bewijs of handmatige bevestiging.",
  };
}

export function evidenceFromSuggestion(suggestion: FlowSuggestie): FlowEvidence {
  return evaluateFlowEvidence({
    source: "suggestion",
    suggestion,
  });
}

function inferEndpointEvidence(from?: Automatisering, to?: Automatisering): FlowEvidence | null {
  if (!from || !to) return null;

  const fromEndpoints = from.endpoints ?? [];
  const toRoute = to.gitlabEndpoint?.endpoint ?? parseGitLabExternalEndpoint(to.externalId).endpoint;
  const fromRoute = from.gitlabEndpoint?.endpoint ?? parseGitLabExternalEndpoint(from.externalId).endpoint;
  const toEndpoints = to.endpoints ?? [];

  if (toRoute && fromEndpoints.some((endpoint) => endpoint.includes(toRoute) || toRoute.includes(endpoint))) {
    return {
      level: "hard",
      label: "Hard bewijs",
      score: 88,
      reason: `De eerste automation verwijst naar hetzelfde endpoint als de GitLab automation: ${toRoute}.`,
    };
  }

  if (fromRoute && toEndpoints.some((endpoint) => endpoint.includes(fromRoute) || fromRoute.includes(endpoint))) {
    return {
      level: "hard",
      label: "Hard bewijs",
      score: 88,
      reason: `De volgende automation verwijst naar hetzelfde endpoint als de GitLab automation: ${fromRoute}.`,
    };
  }

  const fromIsGitLab = from.source === "gitlab" || Boolean(from.gitlabFilePath);
  const toIsHubSpot = to.source === "hubspot" || to.systemen.includes("HubSpot");
  if (fromIsGitLab && toIsHubSpot) {
    return {
      level: "strong",
      label: "Sterke match",
      score: 68,
      reason: "GitLab schrijft of verwerkt HubSpot-state en de volgende automation draait in HubSpot. Controleer welke property/stage de volgende workflow triggert.",
    };
  }

  return null;
}
