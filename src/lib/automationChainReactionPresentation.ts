import { getBackendAutomationTrace } from "./backendAutomationTrace";
import { getAutomationDetailDisplayName } from "./automationDetailPresentation";
import { getGitLabAutomationMeaningPresentation } from "./gitlabAutomationMeaningPresentation";
import type { Automatisering, HubSpotWorkflowActionInfo, HubSpotWorkflowTriggerInfo } from "./types";
import { getExactWebhookProof, normalizeWebhookRoute, type ExactWebhookProof } from "./webhookProof";

export type AutomationChainReactionNodeTone =
  | "hubspot"
  | "gitlab"
  | "zapier"
  | "typeform"
  | "system"
  | "stop";

export type AutomationChainReactionEdgeLabel =
  | "100% webhook-match"
  | "100% HubSpot write -> trigger"
  | "bewijs stopt hier";

export interface AutomationChainReactionNode {
  id: string;
  title: string;
  subtitle: string;
  sourceLabel: string;
  tone: AutomationChainReactionNodeTone;
  href?: string;
  badges: string[];
}

export interface AutomationChainReactionEdge {
  id: string;
  fromId: string;
  toId: string;
  label: AutomationChainReactionEdgeLabel;
  description: string;
  evidence: string;
  tone: "good" | "warning" | "neutral";
}

export interface AutomationChainReactionGap {
  title: string;
  description: string;
  tag: string;
}

export interface AutomationChainReactionPresentation {
  title: string;
  subtitle: string;
  nodes: AutomationChainReactionNode[];
  edges: AutomationChainReactionEdge[];
  gaps: AutomationChainReactionGap[];
  hasChain: boolean;
}

export interface AutomationChainReactionInput {
  startAutomation: Automatisering;
  automations: Automatisering[];
  maxDepth?: number;
}

interface HubSpotWriteFact {
  id: string;
  propertyName: string;
  propertyValue: string | number | boolean;
  objectType?: string | null;
  actionLabel: string;
  sourceAutomationId: string;
}

export function getAutomationChainReactionPresentation({
  startAutomation,
  automations,
  maxDepth = 8,
}: AutomationChainReactionInput): AutomationChainReactionPresentation {
  const nodes = new Map<string, AutomationChainReactionNode>();
  const edges = new Map<string, AutomationChainReactionEdge>();
  const gaps = new Map<string, AutomationChainReactionGap>();
  const visited = new Set<string>();

  addAutomationNode(nodes, startAutomation);
  traceAutomation(startAutomation, 0);

  if (edges.size === 0 && gaps.size === 0) {
    addGap(gaps, "no-evidence", {
      title: "Hier stopt het bewijs",
      description: "Deze automation heeft geen bewezen uitgaande webhook en geen exacte HubSpot write-trigger-overgang in de beschikbare brondata.",
      tag: "Geen vervolgbewijs",
    });
  }

  return {
    title: "Kettingreactie vanaf deze automation",
    subtitle: "Deze kaart volgt alleen harde technische overdrachten vanaf deze automation. De officiele procesreis blijft apart en telt alleen webhook-matches.",
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    gaps: [...gaps.values()],
    hasChain: edges.size > 0,
  };

  function traceAutomation(automation: Automatisering, depth: number): void {
    if (depth >= maxDepth) {
      addGap(gaps, `depth:${automation.id}`, {
        title: "Hier stopt het bewijs",
        description: "De ketting is afgekapt om een lus of te lange technische keten te voorkomen.",
        tag: "Maximale diepte",
      });
      return;
    }

    if (visited.has(automation.id)) return;
    visited.add(automation.id);

    let foundFollowUp = false;

    for (const target of automations) {
      if (target.id === automation.id) continue;
      const proof = getExactWebhookProof(automation, target);
      if (!proof) continue;

      addAutomationNode(nodes, target);
      const evidence = getWebhookEvidence(automation, proof);
      addEdge(edges, {
        id: `webhook:${automation.id}->${target.id}:${proof.normalizedPath}`,
        fromId: automation.id,
        toId: target.id,
        label: "100% webhook-match",
        description: `${getDisplayName(automation)} roept exact dezelfde webhookroute aan als ${getDisplayName(target)} ontvangt.`,
        evidence,
        tone: "good",
      });
      foundFollowUp = true;
      traceAutomation(target, depth + 1);
    }

    const writes = collectExactHubSpotWrites(automation);
    for (const write of writes) {
      const writeNode = createHubSpotWriteNode(write);
      const matchingTargets = automations.filter((candidate) =>
        candidate.id !== automation.id && hasExactHubSpotTriggerMatch(candidate, write),
      );

      if (matchingTargets.length === 0) {
        nodes.set(writeNode.id, writeNode);
        addEdge(edges, {
          id: `stop:${automation.id}->${writeNode.id}`,
          fromId: automation.id,
          toId: writeNode.id,
          label: "bewijs stopt hier",
          description: `${getDisplayName(automation)} schrijft ${write.propertyName} = ${formatValue(write.propertyValue)} naar HubSpot, maar geen volgende workflow-trigger matcht exact op die waarde.`,
          evidence: `${write.propertyName} = ${formatValue(write.propertyValue)}`,
          tone: "warning",
        });
        addStopGap(gaps, automation.id, `Er is geen exacte volgende HubSpot workflow-trigger bewezen voor ${write.propertyName} = ${formatValue(write.propertyValue)}.`);
        continue;
      }

      nodes.set(writeNode.id, writeNode);
      addEdge(edges, {
        id: `write:${automation.id}->${writeNode.id}`,
        fromId: automation.id,
        toId: writeNode.id,
        label: "100% HubSpot write -> trigger",
        description: `${getDisplayName(automation)} schrijft exact ${write.propertyName} = ${formatValue(write.propertyValue)} naar HubSpot.`,
        evidence: `${write.propertyName} = ${formatValue(write.propertyValue)}`,
        tone: "good",
      });

      for (const target of matchingTargets) {
        addAutomationNode(nodes, target);
        addEdge(edges, {
          id: `write-trigger:${writeNode.id}->${target.id}`,
          fromId: writeNode.id,
          toId: target.id,
          label: "100% HubSpot write -> trigger",
          description: `${getDisplayName(target)} start exact op ${write.propertyName} = ${formatValue(write.propertyValue)}.`,
          evidence: `${write.propertyName} = ${formatValue(write.propertyValue)}`,
          tone: "good",
        });
        foundFollowUp = true;
        traceAutomation(target, depth + 1);
      }
    }

    if (writes.length === 0) {
      const backendEffect = getBackendHubSpotEffect(automation);
      if (backendEffect) {
        nodes.set(backendEffect.id, backendEffect);
        addEdge(edges, {
          id: `backend-stop:${automation.id}->${backendEffect.id}`,
          fromId: automation.id,
          toId: backendEffect.id,
          label: "bewijs stopt hier",
          description: backendEffect.subtitle,
          evidence: backendEffect.badges[0] ?? "GitLab bronanalyse",
          tone: "warning",
        });
        addStopGap(
          gaps,
          automation.id,
          "Deze backendstap wijzigt HubSpot, maar er is geen exacte volgende HubSpot workflow-trigger bewezen op property/dealstage plus waarde.",
        );
        foundFollowUp = true;
      }
    }

    if (!foundFollowUp && automation.id === startAutomation.id) {
      addGap(gaps, `start:${automation.id}`, {
        title: "Hier stopt het bewijs",
        description: "Vanaf deze automation is geen bewezen uitgaande webhook of exacte HubSpot write-trigger-overgang gevonden.",
        tag: "Geen vervolgbewijs",
      });
    }
  }
}

function addAutomationNode(nodes: Map<string, AutomationChainReactionNode>, automation: Automatisering): void {
  if (nodes.has(automation.id)) return;
  nodes.set(automation.id, {
    id: automation.id,
    title: getDisplayName(automation),
    subtitle: getAutomationSubtitle(automation),
    sourceLabel: getSourceLabel(automation),
    tone: getNodeTone(automation),
    href: `/automations/${automation.id}`,
    badges: getAutomationBadges(automation),
  });
}

function addEdge(edges: Map<string, AutomationChainReactionEdge>, edge: AutomationChainReactionEdge): void {
  edges.set(edge.id, edge);
}

function addGap(gaps: Map<string, AutomationChainReactionGap>, key: string, gap: AutomationChainReactionGap): void {
  gaps.set(key, gap);
}

function addStopGap(gaps: Map<string, AutomationChainReactionGap>, automationId: string, description: string): void {
  addGap(gaps, `stop:${automationId}`, {
    title: "Hier stopt het bewijs",
    description,
    tag: "Brondata nodig",
  });
}

function collectExactHubSpotWrites(automation: Automatisering): HubSpotWriteFact[] {
  const objectType = automation.hubspotWorkflow?.objectType;
  const actions = [
    ...(automation.hubspotWorkflow?.actions ?? []),
    ...((automation.hubspotWorkflow?.branches ?? []).flatMap((branch) => branch.actions ?? [])),
  ];

  return actions
    .map((action, index) => actionToWriteFact(action, index, automation.id, objectType))
    .filter((write): write is HubSpotWriteFact => Boolean(write));
}

function actionToWriteFact(
  action: HubSpotWorkflowActionInfo,
  index: number,
  automationId: string,
  objectType?: string | null,
): HubSpotWriteFact | null {
  const propertyName = action.propertyName?.trim();
  const propertyValue = action.propertyValue;
  if (!propertyName) return null;
  if (propertyValue === null || propertyValue === undefined || propertyValue === "") return null;

  return {
    id: `${automationId}:${propertyName}:${String(propertyValue)}:${action.index ?? index}`,
    propertyName,
    propertyValue,
    objectType,
    actionLabel: action.label || action.type || "HubSpot update",
    sourceAutomationId: automationId,
  };
}

function hasExactHubSpotTriggerMatch(automation: Automatisering, write: HubSpotWriteFact): boolean {
  if (!isHubSpotAutomation(automation)) return false;
  return (automation.hubspotWorkflow?.triggers ?? []).some((trigger) => triggerMatchesWrite(trigger, write));
}

function triggerMatchesWrite(trigger: HubSpotWorkflowTriggerInfo, write: HubSpotWriteFact): boolean {
  const triggerProperty = trigger.property?.trim().toLowerCase();
  if (!triggerProperty || triggerProperty !== write.propertyName.toLowerCase()) return false;
  const triggerValues = collectTriggerValues(trigger);
  return triggerValues.some((value) => normalizeComparableValue(value) === normalizeComparableValue(write.propertyValue));
}

function collectTriggerValues(trigger: HubSpotWorkflowTriggerInfo): Array<string | number | boolean> {
  const values: Array<string | number | boolean> = [];
  const directValue = trigger.value;
  if (directValue !== null && directValue !== undefined && directValue !== "") values.push(directValue);

  const raw = trigger as unknown as Record<string, unknown>;
  collectPrimitiveValues(raw.operator, values);
  collectPrimitiveValues(raw.values, values);
  collectPrimitiveValues(raw.criteria, values);
  return uniqueComparableValues(values);
}

function collectPrimitiveValues(value: unknown, output: Array<string | number | boolean>): void {
  if (value === null || value === undefined || value === "") return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectPrimitiveValues(item, output));
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    collectPrimitiveValues(record.value, output);
    collectPrimitiveValues(record.values, output);
  }
}

function uniqueComparableValues(values: Array<string | number | boolean>): Array<string | number | boolean> {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizeComparableValue(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function normalizeComparableValue(value: string | number | boolean): string {
  return String(value).trim().toLowerCase();
}

function createHubSpotWriteNode(write: HubSpotWriteFact): AutomationChainReactionNode {
  return {
    id: `write:${write.sourceAutomationId}:${write.propertyName}:${normalizeComparableValue(write.propertyValue)}`,
    title: `HubSpot ${write.propertyName}`,
    subtitle: `HubSpot wordt bijgewerkt naar ${write.propertyName} = ${formatValue(write.propertyValue)}.`,
    sourceLabel: "HubSpot update",
    tone: "hubspot",
    badges: [write.actionLabel, `${write.propertyName} = ${formatValue(write.propertyValue)}`],
  };
}

function getBackendHubSpotEffect(automation: Automatisering): AutomationChainReactionNode | null {
  if (!isGitLabAutomation(automation)) return null;

  const trace = getBackendAutomationTrace(automation);
  if (trace?.id === "create_new_deal") {
    return {
      id: `write:${automation.id}:hubspot-vervolgdeals`,
      title: "HubSpot vervolgdeals",
      subtitle: "Backend maakt of werkt HubSpot vervolgdeals bij. Daarna is nog geen exacte volgende HubSpot workflow-trigger bewezen.",
      sourceLabel: "HubSpot update",
      tone: "hubspot",
      badges: ["GitLab trace: create_new_deal"],
    };
  }

  const meaning = getGitLabAutomationMeaningPresentation(automation);
  const firstWrite = meaning.pastAan[0];
  if (!firstWrite) return null;

  return {
    id: `write:${automation.id}:hubspot-update`,
    title: "HubSpot wordt bijgewerkt",
    subtitle: `${firstWrite.label}. Daarna is nog geen exacte volgende HubSpot workflow-trigger bewezen.`,
    sourceLabel: "HubSpot update",
    tone: "hubspot",
    badges: [firstWrite.evidence[0]?.label ?? "GitLab bronanalyse"],
  };
}

function getWebhookEvidence(automation: Automatisering, proof: ExactWebhookProof): string {
  const normalized = proof.normalizedPath;
  const candidates = collectDisplayWebhookCandidates(automation);
  const fullUrl = candidates.find((candidate) =>
    /^https?:\/\//i.test(candidate) && normalizeWebhookRoute(candidate) === normalized,
  );
  if (fullUrl) return fullUrl;
  const candidate = candidates.find((item) => normalizeWebhookRoute(item) === normalized);
  return candidate ?? proof.sourcePath;
}

function collectDisplayWebhookCandidates(automation: Automatisering): string[] {
  const candidates: string[] = [];

  for (const action of automation.hubspotWorkflow?.actions ?? []) {
    if (action.webhookUrl) candidates.push(action.webhookUrl);
    if (action.webhookPath) candidates.push(action.webhookPath);
  }

  for (const branch of automation.hubspotWorkflow?.branches ?? []) {
    for (const action of branch.actions ?? []) {
      if (action.webhookUrl) candidates.push(action.webhookUrl);
      if (action.webhookPath) candidates.push(action.webhookPath);
    }
  }

  candidates.push(...extractWebhookCandidatesFromText([
    ...(automation.stappen ?? []),
    ...stringArrayFromUnknown(automation.importProposal?.stappen),
    ...(automation.beschrijvingInSimpeleTaal ?? []),
    ...(automation.importProposal?.beschrijving_in_simpele_taal ?? []),
  ]));
  candidates.push(...(automation.webhookPaths ?? []));
  candidates.push(...((automation.importProposal?.webhookPaths ?? []) as string[]));

  for (const handoff of automation.importProposal?.zap?.process?.webhookHandoffs ?? []) {
    candidates.push(joinHostPath(handoff.host, handoff.path));
    candidates.push(handoff.path);
  }
  for (const step of automation.importProposal?.zap?.process?.steps ?? []) {
    candidates.push(...(step.webhookPaths ?? []));
  }
  for (const step of automation.importProposal?.zap?.steps ?? []) {
    candidates.push(...(step.webhookPaths ?? []));
  }

  for (const webhook of automation.importProposal?.typeform?.webhooks ?? []) {
    candidates.push(joinHostPath(webhook.host, webhook.path));
    if (webhook.path) candidates.push(webhook.path);
  }
  for (const handoff of automation.importProposal?.typeform?.process?.webhookHandoffs ?? []) {
    candidates.push(joinHostPath(handoff.host, handoff.path));
    candidates.push(handoff.path);
  }
  for (const step of automation.importProposal?.typeform?.process?.steps ?? []) {
    candidates.push(...(step.webhookPaths ?? []));
  }

  return uniqueStrings(candidates.filter(Boolean));
}

function joinHostPath(host?: string, path?: string): string {
  if (!host || !path) return path ?? "";
  const normalizedHost = /^https?:\/\//i.test(host) ? host : `https://${host}`;
  return `${normalizedHost.replace(/\/+$/g, "")}/${path.replace(/^\/+/g, "")}`;
}

function getDisplayName(automation: Automatisering): string {
  return automation.hubspotWorkflow?.name
    || automation.importProposal?.zap?.title
    || automation.importProposal?.typeform?.form?.title
    || getAutomationDetailDisplayName(automation);
}

function getAutomationSubtitle(automation: Automatisering): string {
  if (isHubSpotAutomation(automation)) {
    const trigger = automation.hubspotWorkflow?.triggers?.[0]?.label;
    return trigger ? `Start: ${trigger}` : "HubSpot workflow";
  }
  if (isGitLabAutomation(automation)) {
    const endpoint = [automation.gitlabEndpoint?.method, automation.gitlabEndpoint?.endpoint].filter(Boolean).join(" ");
    return endpoint || automation.gitlabEndpoint?.handler || "Backend/API stap";
  }
  if (automation.source === "zapier" || automation.categorie === "Zapier Zap") {
    return automation.importProposal?.zap?.process?.trigger || "Zapier Zap";
  }
  if (automation.source === "typeform" || automation.categorie === "Typeform") {
    return automation.importProposal?.typeform?.form?.title || "Typeform formulier";
  }
  return automation.doel || automation.categorie;
}

function getAutomationBadges(automation: Automatisering): string[] {
  const badges = [getSourceLabel(automation)];
  if (automation.status) badges.push(automation.status);
  if (automation.gitlabEndpoint?.endpoint) badges.push(automation.gitlabEndpoint.endpoint);
  if (automation.hubspotWorkflow?.workflowId) badges.push(`Workflow ${automation.hubspotWorkflow.workflowId}`);
  return badges.slice(0, 3);
}

function getSourceLabel(automation: Automatisering): string {
  const source = String(automation.source || "").toLowerCase();
  if (source === "hubspot" || automation.categorie === "HubSpot Workflow") return "HubSpot";
  if (source === "gitlab" || automation.categorie === "Backend Script") return "GitLab/API";
  if (source === "zapier" || automation.categorie === "Zapier Zap") return "Zapier";
  if (source === "typeform" || automation.categorie === "Typeform") return "Typeform";
  return automation.systemen[0] || "Automation";
}

function getNodeTone(automation: Automatisering): AutomationChainReactionNodeTone {
  const source = String(automation.source || "").toLowerCase();
  if (source === "hubspot" || automation.categorie === "HubSpot Workflow") return "hubspot";
  if (source === "gitlab" || automation.categorie === "Backend Script") return "gitlab";
  if (source === "zapier" || automation.categorie === "Zapier Zap") return "zapier";
  if (source === "typeform" || automation.categorie === "Typeform") return "typeform";
  return "system";
}

function isHubSpotAutomation(automation: Automatisering): boolean {
  return automation.source === "hubspot" || automation.categorie === "HubSpot Workflow" || Boolean(automation.hubspotWorkflow);
}

function isGitLabAutomation(automation: Automatisering): boolean {
  return automation.source === "gitlab" || automation.categorie === "Backend Script" || Boolean(automation.gitlabEndpoint);
}

function formatValue(value: string | number | boolean): string {
  return typeof value === "boolean" ? (value ? "true" : "false") : String(value);
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
}

function extractWebhookCandidatesFromText(values: string[]): string[] {
  return values.flatMap((value) => {
    const text = value.trim();
    if (!text) return [];
    if (!/(webhook|endpoint|\bGET\b|\bPOST\b|\bPUT\b|\bPATCH\b|\bDELETE\b)/i.test(text)) return [];
    const urls = text.match(/https?:\/\/[^\s'"<>]+/gi) ?? [];
    if (urls.length > 0) return urls.map(cleanRouteCandidate);
    return (text.match(/\/[a-z0-9][a-z0-9/_-]+/gi) ?? []).map(cleanRouteCandidate);
  });
}

function cleanRouteCandidate(value: string): string {
  return value.trim().replace(/[.,;:)\]}]+$/g, "");
}

function stringArrayFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
