import { sanitizeForPrompt } from "./flowSuggestionAi";
import type { FlowSuggestionGroup } from "./flowSuggestionGroups";
import type { Automatisering } from "./types";

interface BuildFlowSuggestionAiPromptInput {
  group: FlowSuggestionGroup;
  automations: Automatisering[];
  endpointEvidence: string;
}

export function buildFlowSuggestionAiPrompt({
  group,
  automations,
  endpointEvidence,
}: BuildFlowSuggestionAiPromptInput): string {
  const payload = sanitizeForPrompt({
    task: "Verrijk deze concept-procesreis voor menselijke review.",
    guardrails: [
      "Je mag geen webhook-bewijs verzinnen",
      "Proof-sensitive fields zoals confirmedTransitions, webhookEvidence, approvalStatus, sourceAutomationId en targetAutomationId mogen niet worden ingevuld of aangepast.",
      "Return only valid JSON. Geen markdown, geen code fences, geen toelichting buiten JSON.",
      "Markeer onzekerheid uitsluitend als suggesties of openQuestions.",
      "Gebruik gewone Nederlandse tekst voor procesowners.",
    ],
    expectedJsonShape: {
      title: "string",
      summary: "string",
      businessObject: "string",
      processSteps: ["string"],
      changeSummary: ["string"],
      reviewNotes: ["string"],
      aiSuggestions: [
        {
          label: "string",
          description: "string",
          severity: "info|warning|critical",
          tag: "AI-voorstel|Niet bewezen|Review nodig",
        },
      ],
      openQuestions: ["string"],
    },
    conceptJourney: {
      groupId: group.id,
      structureType: group.structureType,
      structureSummary: group.structureSummary,
      normalizedEndpoint: normalizeEndpointEvidence(endpointEvidence),
      nodes: group.nodes,
      webhookSuggestions: group.suggestions.map((suggestion) => ({
        fromId: suggestion.fromId,
        toId: suggestion.toId,
        from: suggestion.fromNaam,
        to: suggestion.toNaam,
        source: suggestion.fromSource,
        targetSource: suggestion.toSource,
        reason: suggestion.redenering,
        zekerheid: suggestion.zekerheid,
      })),
    },
    automations: automations.map((automation) => ({
      id: automation.id,
      naam: automation.naam,
      source: automation.source,
      categorie: automation.categorie,
      status: automation.status,
      doel: automation.doel,
      trigger: automation.trigger,
      systemen: automation.systemen,
      webhookPaths: automation.webhookPaths,
      hubspotWorkflow: automation.hubspotWorkflow,
      gitlabEndpoint: automation.gitlabEndpoint,
      importProposal: automation.importProposal,
      sourceFindings: automation.sourceFindings,
    })),
  });

  return [
    "Analyseer onderstaande procesreis-kandidaat en geef uitsluitend geldige JSON terug.",
    "Je mag geen webhook-bewijs verzinnen. Gebruik confirmedTransitions en andere proof-sensitive fields alleen als verboden voorbeelden, niet als output.",
    "Return only valid JSON. Markeer onzekerheid als suggesties of open vragen.",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");
}

function normalizeEndpointEvidence(endpointEvidence: string): string {
  const trimmed = endpointEvidence.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
