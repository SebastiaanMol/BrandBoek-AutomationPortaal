import { getAutomationSourceQualityPresentation } from "./automationSourceQuality";
import type { FlowSuggestionAiResult } from "./flowSuggestionAi";
import type { FlowSuggestionGroup } from "./flowSuggestionGroups";
import { getExactWebhookProof, normalizeWebhookRoute } from "./webhookProof";
import type { Automatisering } from "./types";

export interface FlowSuggestionReviewMetric {
  label: string;
  value: string;
  detail: string;
  tone: "default" | "success" | "warning" | "danger";
}

export interface FlowSuggestionReviewTransition {
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  label: "100% webhook-match";
  sourcePath: string;
  targetPath: string;
  normalizedPath: string;
}

export interface FlowSuggestionReviewPresentation {
  title: string;
  summary: string;
  approvalState: {
    status: "ready" | "blocked";
    label: string;
    detail: string;
  };
  badges: string[];
  metrics: FlowSuggestionReviewMetric[];
  nodes: Array<{ id: string; label: string; sourceLabel: string; status: string }>;
  transitions: FlowSuggestionReviewTransition[];
  evidenceItems: Array<{
    title: string;
    description: string;
    tag: string;
    tone: "success" | "warning" | "danger";
  }>;
  reviewSteps: Array<{
    title: string;
    description: string;
    tag: string;
    tone: "success" | "warning";
  }>;
  aiSuggestions: Array<{
    label: string;
    description: string;
    tag: string;
    tone: "warning" | "danger";
  }>;
  sourceQualityMessages: Array<{
    automationId: string;
    label: string;
    description: string;
    tone: "warning" | "danger";
  }>;
}

interface BuildInput {
  group: FlowSuggestionGroup;
  automations: Automatisering[];
  endpointEvidence: string;
  aiResult: FlowSuggestionAiResult | null;
}

export function getFlowSuggestionReviewPresentation({
  group,
  automations,
  endpointEvidence,
  aiResult,
}: BuildInput): FlowSuggestionReviewPresentation {
  const autoMap = new Map(automations.map((automation) => [automation.id, automation]));
  const normalizedEndpointEvidence = normalizeWebhookRoute(endpointEvidence);
  const transitions = group.suggestions
    .map((suggestion) => {
      const proof = getExactWebhookProof(
        autoMap.get(suggestion.fromId),
        autoMap.get(suggestion.toId),
      );

      if (!proof) return null;
      if (normalizedEndpointEvidence && proof.normalizedPath !== normalizedEndpointEvidence) {
        return null;
      }

      return {
        fromId: suggestion.fromId,
        toId: suggestion.toId,
        fromLabel: suggestion.fromNaam,
        toLabel: suggestion.toNaam,
        label: "100% webhook-match" as const,
        sourcePath: proof.sourcePath,
        targetPath: proof.targetPath,
        normalizedPath: proof.normalizedPath,
      };
    })
    .filter((transition): transition is FlowSuggestionReviewTransition => Boolean(transition));

  const sourceQualityMessages = automations.flatMap((automation) => {
    const quality = getAutomationSourceQualityPresentation(automation);
    return quality.blockingFindings.map((finding) => ({
      automationId: automation.id,
      label: automation.naam,
      description: finding.message,
      tone: finding.severity === "critical" ? "danger" as const : "warning" as const,
    }));
  });

  const hasCriticalSourceBlocker = sourceQualityMessages.some(
    (message) => message.tone === "danger",
  );
  const allSuggestionsProven =
    group.suggestions.length > 0 && transitions.length === group.suggestions.length;
  const ready = allSuggestionsProven && !hasCriticalSourceBlocker;
  const aiSuggestions = buildAiSuggestions(aiResult);

  return {
    title: aiResult?.title || buildFallbackTitle(group),
    summary: aiResult?.summary || buildFallbackSummary(group, endpointEvidence),
    approvalState: ready
      ? {
          status: "ready",
          label: "Klaar voor review",
          detail: "Alle overgangen zijn exact via webhook/endpoint bewezen.",
        }
      : {
          status: "blocked",
          label: "Niet goedkeuringsklaar",
          detail: hasCriticalSourceBlocker
            ? "Een kritieke bronkwaliteit-blocker moet eerst worden opgelost."
            : "Een of meer overgangen missen exacte webhook-bewijsvoering.",
        },
    badges: [
      `${group.nodes.length} automations`,
      `${transitions.length} webhook-overgangen`,
      `${aiSuggestions.length} AI-voorstellen`,
    ],
    metrics: buildMetrics({
      ready,
      allSuggestionsProven,
      sourceQualityMessages,
      businessObject: aiResult?.businessObject ?? "",
      lastNodeLabel: group.nodes.at(-1)?.naam ?? "Onbekend",
    }),
    nodes: group.nodes.map((node) => ({
      id: node.id,
      label: node.naam,
      sourceLabel: sourceLabel(node.source),
      status: autoMap.get(node.id)?.status ?? "Onbekend",
    })),
    transitions,
    evidenceItems: transitions.map((transition) => ({
      title: `${transition.fromLabel} -> ${transition.toLabel}`,
      description: `Exacte webhook/endpoint match op ${transition.normalizedPath}.`,
      tag: "100% webhook-match",
      tone: "success",
    })),
    reviewSteps: buildReviewSteps(ready, Boolean(aiResult)),
    aiSuggestions,
    sourceQualityMessages,
  };
}

function buildMetrics({
  ready,
  allSuggestionsProven,
  sourceQualityMessages,
  businessObject,
  lastNodeLabel,
}: {
  ready: boolean;
  allSuggestionsProven: boolean;
  sourceQualityMessages: FlowSuggestionReviewPresentation["sourceQualityMessages"];
  businessObject: string;
  lastNodeLabel: string;
}): FlowSuggestionReviewMetric[] {
  return [
    {
      label: "Bewijsstatus",
      value: ready ? "100%" : "Niet klaar",
      detail: allSuggestionsProven
        ? "Alle overgangen via exacte webhook-match"
        : "Er mist exacte webhook-bewijsvoering",
      tone: ready ? "success" : "danger",
    },
    {
      label: "Bronkwaliteit",
      value: sourceQualityMessages.length ? "Review" : "Goed",
      detail: sourceQualityMessages.length
        ? "Controleer bronkwaliteitmeldingen"
        : "Geen blocker voor deze keten",
      tone: sourceQualityMessages.some((message) => message.tone === "danger")
        ? "danger"
        : sourceQualityMessages.length
          ? "warning"
          : "success",
    },
    {
      label: "Businessobject",
      value: businessObject || "Nog niet verrijkt",
      detail: businessObject
        ? "Afkomstig uit AI-verrijking"
        : "Kan via AI-werkbank worden aangevuld",
      tone: "default",
    },
    {
      label: "Keten stopt bij",
      value: lastNodeLabel,
      detail: "Geen volgende bewezen webhook-match in dit voorstel",
      tone: "default",
    },
  ];
}

function buildReviewSteps(
  ready: boolean,
  hasAiResult: boolean,
): FlowSuggestionReviewPresentation["reviewSteps"] {
  return [
    {
      title: "Technisch bewijs controleren",
      description: "Elke overgang moet een exacte webhook- of endpointmatch hebben.",
      tag: ready ? "OK" : "Review",
      tone: ready ? "success" : "warning",
    },
    {
      title: "Businessverhaal lezen",
      description: "De samenvatting moet uitleggen wat het proces doet zonder bewijs te verzinnen.",
      tag: hasAiResult ? "AI" : "Basis",
      tone: "warning",
    },
    {
      title: "AI-voorstellen en gaps beoordelen",
      description: "AI-output blijft zichtbaar als voorstel of open vraag.",
      tag: "Review",
      tone: "warning",
    },
    {
      title: "Alleen bewezen procesreis goedkeuren",
      description: "Alleen de harde webhook-keten wordt opgeslagen als procesreis.",
      tag: ready ? "Opslaan" : "Geblokkeerd",
      tone: ready ? "success" : "warning",
    },
  ];
}

function buildAiSuggestions(
  aiResult: FlowSuggestionAiResult | null,
): FlowSuggestionReviewPresentation["aiSuggestions"] {
  return [
    ...(aiResult?.aiSuggestions ?? []).map((suggestion) => ({
      label: suggestion.label,
      description: suggestion.description,
      tag: suggestion.severity === "critical" ? "Review nodig" : "Niet bewezen",
      tone: suggestion.severity === "critical" ? "danger" as const : "warning" as const,
    })),
    ...(aiResult?.openQuestions ?? []).map((question) => ({
      label: "Open vraag",
      description: question,
      tag: "Review nodig",
      tone: "warning" as const,
    })),
  ];
}

function buildFallbackTitle(group: FlowSuggestionGroup): string {
  const first = group.nodes[0]?.naam ?? "Start";
  const last = group.nodes.at(-1)?.naam ?? "einde";
  return `${first} naar ${last}`;
}

function buildFallbackSummary(group: FlowSuggestionGroup, endpointEvidence: string): string {
  const endpointText = endpointEvidence
    ? ` De technische overdracht loopt via ${endpointEvidence}.`
    : "";
  return `Deze concept-procesreis verbindt ${group.nodes.length} automations via webhook-bewijs.${endpointText} AI kan het businessverhaal verrijken zonder extra bewijs te verzinnen.`;
}

function sourceLabel(source: string | null): string {
  if (source === "hubspot") return "HubSpot";
  if (source === "zapier") return "Zapier";
  if (source === "gitlab") return "GitLab";
  if (source === "typeform") return "Typeform";
  return "Automation";
}
