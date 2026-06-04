import type { Automatisering } from "./types";
import { isGitLabSourceRecord, isSpecificGitLabEndpointAutomation } from "./gitlabAutomationIdentity";

export type AutomationRouteDirection = "outgoing" | "incoming";

export interface AutomationRoute {
  automationId: string;
  automationName: string;
  automationSource: string | null;
  automationStatus: string;
  direction: AutomationRouteDirection;
  routeType: string;
  method: string;
  path: string;
  normalizedPath: string;
  sourceField: string;
  detail: string;
  priority: number;
}

export interface AutomationWebhookProof {
  sourcePath: string;
  targetPath: string;
  normalizedPath: string;
  sourceField: string;
  targetField: string;
}

export interface AutomationWebhookGraphEdge {
  fromId: string;
  toId: string;
  proof: AutomationWebhookProof;
}

export function buildAutomationWebhookGraph(automations: Automatisering[]): AutomationWebhookGraphEdge[] {
  const allRoutes = automations.flatMap(collectAutomationRoutes);
  const outgoingRoutes = allRoutes.filter((route) => route.direction === "outgoing");
  const incomingRoutes = selectPreferredIncomingRoutes(
    allRoutes.filter((route) => route.direction === "incoming"),
  );
  const incomingByPath = groupByNormalizedPath(incomingRoutes);
  const edges: AutomationWebhookGraphEdge[] = [];
  const seen = new Set<string>();

  for (const outgoing of outgoingRoutes) {
    if (!outgoing.normalizedPath) continue;
    for (const incoming of incomingByPath.get(outgoing.normalizedPath) ?? []) {
      if (outgoing.automationId === incoming.automationId) continue;
      const key = `${outgoing.automationId}->${incoming.automationId}:${outgoing.normalizedPath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        fromId: outgoing.automationId,
        toId: incoming.automationId,
        proof: {
          sourcePath: outgoing.path,
          targetPath: incoming.path,
          normalizedPath: outgoing.normalizedPath,
          sourceField: outgoing.sourceField,
          targetField: incoming.sourceField,
        },
      });
    }
  }

  return edges;
}

export function collectAutomationRoutes(automation: Automatisering): AutomationRoute[] {
  return dedupeRoutes([
    ...collectOutgoingRoutes(automation),
    ...collectIncomingRoutes(automation),
  ]);
}

export function collectOutgoingRoutes(automation: Automatisering): AutomationRoute[] {
  const routes: AutomationRoute[] = [];
  const importProposal = automation.importProposal ?? {};
  const isLegacyGitLabFile = isLegacyGitLabFileAutomation(automation);
  const hasAuthoritativeTypeformWebhooks = (
    automation.source === "typeform" &&
    Array.isArray(importProposal.typeform?.webhooks)
  );

  if (!isLegacyGitLabFile && !hasAuthoritativeTypeformWebhooks) {
    for (const path of automation.webhookPaths ?? []) {
      addRoute(routes, automation, {
        direction: "outgoing",
        routeType: "Webhook",
        path,
        sourceField: "automation.webhookPaths",
        priority: 40,
      });
    }

    for (const path of arrayOfStrings(importProposal.webhookPaths)) {
      addRoute(routes, automation, {
        direction: "outgoing",
        routeType: "Webhook",
        path,
        sourceField: "import_proposal.webhookPaths",
        priority: 45,
      });
    }
  }

  if (!isLegacyGitLabFile) {
    for (const path of extractWebhookRoutesFromText([
      ...(automation.stappen ?? []),
      ...arrayOfStrings(importProposal.stappen),
      ...(automation.beschrijvingInSimpeleTaal ?? []),
      ...arrayOfStrings(importProposal.beschrijving_in_simpele_taal),
    ])) {
      addRoute(routes, automation, {
        direction: "outgoing",
        routeType: "Webhook/endpoint uit tekst",
        path,
        sourceField: "stappen/beschrijving",
        priority: 10,
      });
    }
  }

  collectHubSpotOutgoingRoutes(automation, routes);
  collectZapierOutgoingRoutes(automation, routes);
  collectTypeformOutgoingRoutes(automation, routes);

  return dedupeRoutes(routes);
}

export function collectIncomingRoutes(automation: Automatisering): AutomationRoute[] {
  if (isGitLabSourceRecord(automation) && !isSpecificGitLabEndpointAutomation(automation)) {
    return [];
  }

  const routes: AutomationRoute[] = [];
  const importProposal = automation.importProposal ?? {};
  const gitlabEndpoint = automation.gitlabEndpoint ?? importProposal.gitlab_endpoint;
  const legacyGitlabEndpoint = importProposal.gitlab?.endpoint;

  addRoute(routes, automation, {
    direction: "incoming",
    routeType: "GitLab/API endpoint",
    method: gitlabEndpoint?.method,
    path: gitlabEndpoint?.endpoint,
    sourceField: "gitlab_endpoint",
    detail: [gitlabEndpoint?.handler, gitlabEndpoint?.api_file].filter(Boolean).join(" | "),
    priority: 100,
  });

  addRoute(routes, automation, {
    direction: "incoming",
    routeType: "GitLab/API endpoint",
    method: legacyGitlabEndpoint?.method,
    path: legacyGitlabEndpoint?.path,
    sourceField: "import_proposal.gitlab.endpoint",
    detail: [legacyGitlabEndpoint?.handler, legacyGitlabEndpoint?.api_file].filter(Boolean).join(" | "),
    priority: 95,
  });

  for (const path of automation.endpoints ?? []) {
    addRoute(routes, automation, {
      direction: "incoming",
      routeType: "Endpoint",
      path,
      sourceField: "automatiseringen.endpoints",
      detail: automation.gitlabFilePath ?? automation.externalId ?? "",
      priority: 35,
    });
  }

  const externalPath = extractEndpointPathFromExternalId(automation.externalId);
  addRoute(routes, automation, {
    direction: "incoming",
    routeType: "Endpoint",
    path: externalPath,
    sourceField: "external_id",
    detail: automation.gitlabFilePath ?? "",
    priority: 20,
  });

  return dedupeRoutes(routes);
}

export function getExactWebhookProofBetween(
  from?: Automatisering,
  to?: Automatisering,
): AutomationWebhookProof | null {
  if (!from || !to) return null;
  const outgoingRoutes = collectOutgoingRoutes(from);
  const incomingRoutes = selectPreferredIncomingRoutes(collectIncomingRoutes(to));

  for (const outgoing of outgoingRoutes) {
    if (!outgoing.normalizedPath) continue;
    const incoming = incomingRoutes.find((route) => route.normalizedPath === outgoing.normalizedPath);
    if (!incoming) continue;
    return {
      sourcePath: outgoing.path,
      targetPath: incoming.path,
      normalizedPath: outgoing.normalizedPath,
      sourceField: outgoing.sourceField,
      targetField: incoming.sourceField,
    };
  }

  return null;
}

export function normalizeWebhookRoute(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  const withoutMethod = trimmed.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "");
  let route = withoutMethod;

  try {
    if (/^https?:\/\//i.test(withoutMethod)) {
      const url = new URL(withoutMethod);
      route = url.pathname;
    }
  } catch {
    route = withoutMethod.replace(/^https?:\/\/[^/]+/i, "");
  }

  return route
    .replace(/^https?:\/\/[^/]+/i, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/g, "")
    .trim()
    .toLowerCase();
}

export function selectPreferredIncomingRoutes(routes: AutomationRoute[]): AutomationRoute[] {
  const grouped = groupByNormalizedPath(routes);
  const preferred: AutomationRoute[] = [];

  for (const candidates of grouped.values()) {
    const maxScore = Math.max(...candidates.map(receiverScore));
    preferred.push(...candidates.filter((route) => receiverScore(route) === maxScore));
  }

  return preferred;
}

function collectHubSpotOutgoingRoutes(automation: Automatisering, routes: AutomationRoute[]): void {
  const workflow = automation.hubspotWorkflow ?? getHubSpotWorkflowFromImport(automation.importProposal?.hubspot_workflow);
  const actions = [
    ...(workflow?.actions ?? []),
    ...((workflow?.branches ?? []).flatMap((branch) => branch.actions ?? [])),
  ];

  for (const action of actions) {
    addRoute(routes, automation, {
      direction: "outgoing",
      routeType: "HubSpot webhook action",
      method: action.webhookMethod ?? undefined,
      path: action.webhookPath || action.webhookUrl,
      sourceField: "hubspot_workflow.actions",
      detail: action.label ?? action.type ?? "",
      priority: 100,
    });
  }
}

function getHubSpotWorkflowFromImport(value: unknown): Automatisering["hubspotWorkflow"] | undefined {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? value as Automatisering["hubspotWorkflow"]
    : undefined;
}

function collectZapierOutgoingRoutes(automation: Automatisering, routes: AutomationRoute[]): void {
  const zap = automation.importProposal?.zap;
  const process = zap?.process;

  for (const handoff of process?.webhookHandoffs ?? []) {
    addRoute(routes, automation, {
      direction: "outgoing",
      routeType: "Zapier webhook handoff",
      method: handoff.method,
      path: handoff.path,
      sourceField: "zap.process.webhookHandoffs",
      detail: handoff.host ? `Host: ${handoff.host}` : "",
      priority: 100,
    });
  }

  const steps = [
    ...(process?.steps ?? []),
    ...(zap?.steps ?? []),
  ];
  for (const step of steps) {
    for (const path of step.webhookPaths ?? []) {
      addRoute(routes, automation, {
        direction: "outgoing",
        routeType: "Zapier step webhook",
        path,
        sourceField: "zap.process.steps.webhookPaths",
        detail: [step.appName, step.title].filter(Boolean).join(" - "),
        priority: 80,
      });
    }
  }
}

function collectTypeformOutgoingRoutes(automation: Automatisering, routes: AutomationRoute[]): void {
  const typeform = automation.importProposal?.typeform;
  const webhooks = typeform?.webhooks ?? [];

  for (const webhook of webhooks) {
    if (webhook.enabled !== true) continue;
    addRoute(routes, automation, {
      direction: "outgoing",
      routeType: "Typeform webhook",
      method: "POST",
      path: webhook.path,
      sourceField: "typeform.webhooks",
      detail: [webhook.tag, webhook.host, ...(webhook.eventTypes ?? [])].filter(Boolean).join(" | "),
      priority: 100,
    });
  }

  for (const handoff of typeform?.process?.webhookHandoffs ?? []) {
    addRoute(routes, automation, {
      direction: "outgoing",
      routeType: "Typeform webhook handoff",
      method: handoff.method,
      path: handoff.path,
      sourceField: "typeform.process.webhookHandoffs",
      detail: handoff.host ? `Host: ${handoff.host}` : "",
      priority: webhooks.length > 0 ? 60 : 90,
    });
  }

  for (const step of typeform?.process?.steps ?? []) {
    for (const path of step.webhookPaths ?? []) {
      addRoute(routes, automation, {
        direction: "outgoing",
        routeType: "Typeform step webhook",
        path,
        sourceField: "typeform.process.steps.webhookPaths",
        detail: step.title,
        priority: webhooks.length > 0 ? 50 : 80,
      });
    }
  }
}

function addRoute(
  routes: AutomationRoute[],
  automation: Automatisering,
  input: {
    direction: AutomationRouteDirection;
    routeType: string;
    method?: string | null;
    path?: string | null;
    sourceField: string;
    detail?: string | null;
    priority: number;
  },
): void {
  const path = input.path?.trim() ?? "";
  const normalizedPath = normalizeWebhookRoute(path);
  if (!path || !normalizedPath) return;

  routes.push({
    automationId: automation.id,
    automationName: automation.naam,
    automationSource: automation.source ?? null,
    automationStatus: automation.status,
    direction: input.direction,
    routeType: input.routeType,
    method: (input.method ?? "").trim().toUpperCase(),
    path,
    normalizedPath,
    sourceField: input.sourceField,
    detail: input.detail ?? "",
    priority: input.priority,
  });
}

function dedupeRoutes(routes: AutomationRoute[]): AutomationRoute[] {
  const best = new Map<string, AutomationRoute>();

  for (const route of routes) {
    const key = [
      route.automationId,
      route.normalizedPath,
      route.direction,
      route.method,
    ].join("|");
    const existing = best.get(key);
    if (!existing || route.priority > existing.priority) {
      best.set(key, route);
    }
  }

  return [...best.values()].sort(compareRoutes);
}

function compareRoutes(left: AutomationRoute, right: AutomationRoute): number {
  const directionDelta = left.direction.localeCompare(right.direction);
  if (directionDelta !== 0) return directionDelta;
  const priorityDelta = right.priority - left.priority;
  if (priorityDelta !== 0) return priorityDelta;
  return left.normalizedPath.localeCompare(right.normalizedPath);
}

function receiverScore(route: AutomationRoute): number {
  return activeRank(route.automationStatus) * 1000 + route.priority;
}

function activeRank(status: string | undefined): number {
  if (status === "Actief" || status?.toLowerCase() === "active") return 2;
  if (status === "Uitgeschakeld" || status?.toLowerCase() === "disabled") return 0;
  return 1;
}

function groupByNormalizedPath(routes: AutomationRoute[]): Map<string, AutomationRoute[]> {
  const grouped = new Map<string, AutomationRoute[]>();
  for (const route of routes) {
    if (!route.normalizedPath) continue;
    const items = grouped.get(route.normalizedPath) ?? [];
    items.push(route);
    grouped.set(route.normalizedPath, items);
  }
  return grouped;
}

function extractWebhookRoutesFromText(values: string[]): string[] {
  return values.flatMap((value) => {
    const text = value.trim();
    if (!text) return [];
    if (!/(webhook|endpoint|\bGET\b|\bPOST\b|\bPUT\b|\bPATCH\b|\bDELETE\b)/i.test(text)) return [];

    const urls = text.match(/https?:\/\/[^\s'"<>]+/gi) ?? [];
    if (urls.length > 0) return urls.map(cleanRouteCandidate);

    return (text.match(/\/[a-z0-9][a-z0-9/_{}.-]+/gi) ?? []).map(cleanRouteCandidate);
  });
}

function cleanRouteCandidate(value: string): string {
  return value.trim().replace(/[.,;:)\]}]+$/g, "");
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function extractEndpointPathFromExternalId(externalId: string | undefined): string {
  if (!externalId?.includes("::")) return "";
  const possiblePath = externalId.split("::").at(-1)?.trim() ?? "";
  return possiblePath.startsWith("/") ? possiblePath : "";
}

function isLegacyGitLabFileAutomation(automation: Automatisering): boolean {
  return automation.source === "gitlab" && Boolean(automation.gitlabFilePath || automation.externalId) && !automation.gitlabEndpoint;
}
