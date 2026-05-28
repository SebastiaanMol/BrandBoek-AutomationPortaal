import type { Automatisering, Pipeline, ZapierProcessStepInfo } from "./types";

export type ZapierDetailTone = "neutral" | "good" | "warning" | "critical" | "info";
export type ZapierStepRole = "trigger" | "middleware" | "lookup" | "condition" | "action";

export interface ZapierDetailMetric {
  label: string;
  value: string;
  detail: string;
  tone?: ZapierDetailTone;
}

export interface ZapierDataflowNode {
  name: string;
  subtitle: string;
  role: ZapierStepRole;
  arrowLabel?: string;
}

export interface ZapierStepCard {
  index: number;
  appName: string;
  title: string;
  role: ZapierStepRole;
  summary: string;
  description: string;
  details: string[];
  params: Array<{ label: string; value: string }>;
  filter?: {
    condition: string;
    yesLabel: string;
    noLabel: string;
  };
  technicalDetail: string;
}

export interface ZapierFieldUsage {
  field: string;
  role: string;
  value: string;
  source: string;
}

export interface ZapierIssue {
  severity: "critical" | "gap" | "resolved" | "info";
  title: string;
  subtitle: string;
}

export interface ZapierAppUsage {
  name: string;
  role: string;
}

export interface ZapierAutomationDetailPresentation {
  summary: string;
  evidenceBadges: string[];
  metrics: ZapierDetailMetric[];
  dataflow: ZapierDataflowNode[];
  stepCards: ZapierStepCard[];
  fieldUsages: ZapierFieldUsage[];
  apps: ZapierAppUsage[];
  sourceMeta: Array<{ label: string; value: string }>;
  sourceData: {
    title: string;
    subtitle: string;
    rawAvailable: boolean;
  };
  issues: ZapierIssue[];
  meta: string[];
  headerMeta: string[];
  zapId: string;
  openInZapierUrl: string | null;
  rawData: unknown | null;
}

export interface ZapierAutomationDetailContext {
  allAutomations?: Automatisering[];
  pipelines?: Pipeline[];
}

type ZapierRawExport = {
  read_only?: boolean;
  node_count?: number;
  sanitized_nodes?: unknown;
};

type ZapierRawNode = {
  id?: string | number;
  title?: string | null;
  action?: string | null;
  params?: Record<string, unknown> | null;
  paused?: boolean | null;
  created_at?: string | null;
  last_changed?: string | null;
  selected_api?: string | null;
  parent_id?: string | number | null;
  account_id?: string | number | null;
  authentication_id?: string | number | null;
  customuser_id?: string | number | null;
  type_of?: string | null;
  root_id?: string | number | null;
  meta?: Record<string, unknown> | null;
};

type ZapierValueResolver = {
  resolveFieldValue: (field: string, value: string) => string;
};

export function getZapierAutomationDetailPresentation(
  automation: Automatisering,
  context: ZapierAutomationDetailContext = {},
): ZapierAutomationDetailPresentation {
  const zap = automation.importProposal?.zap;
  const rawExport = getZapierRawExport(automation);
  const rawNodes = getZapierRawNodes(rawExport?.sanitized_nodes);
  const processSteps = zap?.process?.steps ?? zap?.steps ?? [];
  const valueResolver = buildZapierValueResolver(automation, context);
  const stepCards = buildStepCards(processSteps, rawNodes, valueResolver);
  const sourceZapId = zap?.id || automation.externalId || stringFromUnknown(rawNodes[0]?.id);
  const zapId = sourceZapId || automation.id;
  const status = buildZapStatus(automation, zap?.status, rawNodes);
  const createdAt = firstNonEmpty(rawNodes.map((node) => node.created_at));
  const lastChanged = latestDate(rawNodes.map((node) => node.last_changed));
  const delay = findDelay(rawNodes, stepCards);
  const fieldUsages = buildFieldUsages(rawNodes, stepCards, valueResolver);
  const rootNode = findRootZapierNode(automation, rawNodes);
  const timezone = stringFromUnknown(rootNode?.meta?.timezone) || stringFromUnknown(rawNodes.find((node) => node.meta?.timezone)?.meta?.timezone);
  const stepCount = stepCards.length || rawExport?.node_count || 0;

  return {
    summary: buildSummary(automation, stepCards, rawNodes, delay, valueResolver),
    evidenceBadges: buildEvidenceBadges(stepCards, rawExport),
    metrics: [
      {
        label: "Status",
        value: status,
        detail: status === "Disabled"
          ? "Deze Zap staat uit volgens de opgeslagen Zapier-status."
          : status === "Enabled"
            ? "Zapier kan deze Zap uitvoeren."
            : "Status ontbreekt in de Zapier-brondata.",
        tone: status === "Enabled" ? "good" : status === "Disabled" ? "warning" : "info",
      },
      {
        label: "Stappen",
        value: String(stepCount),
        detail: buildStepTypesDetail(stepCards),
      },
      {
        label: "Delay",
        value: delay || "Geen delay",
        detail: delay ? "Wachtstap gevonden in Zapier-data." : "Geen bewezen Delay by Zapier-stap gevonden.",
        tone: delay ? "info" : "neutral",
      },
      {
        label: "Laatst gewijzigd",
        value: lastChanged ? formatDate(lastChanged) : "Onbekend",
        detail: lastChanged ? "Laatste wijziging in Zapier-data." : "Geen wijzigingsdatum in deze brondata.",
      },
    ],
    dataflow: buildDataflow(stepCards),
    stepCards,
    fieldUsages,
    apps: buildApps(stepCards),
    sourceMeta: buildSourceMeta(automation, zapId, rawExport, rawNodes),
    sourceData: {
      title: rawExport?.sanitized_nodes ? "Stored Zapier export" : "Zapier brondata beperkt",
      subtitle: rawExport?.sanitized_nodes
        ? "Deze pagina gebruikt de opgeslagen, gestripte Zapier-export. Het portaal past niets in Zapier aan."
        : "Er is geen volledige opgeslagen Zapier-export beschikbaar voor deze automation.",
      rawAvailable: Boolean(getZapierRawData(automation)),
    },
    issues: buildIssues(automation, status, fieldUsages, rawExport),
    meta: buildHeaderMeta(zapId, stepCount, createdAt, lastChanged),
    headerMeta: buildZapierHeaderMeta(zapId, createdAt, lastChanged, timezone),
    zapId,
    openInZapierUrl: buildZapierEditorUrl(sourceZapId),
    rawData: getZapierRawData(automation),
  };
}

export function isZapierAutomation(automation: Automatisering): boolean {
  return automation.source === "zapier" || automation.categorie === "Zapier Zap";
}

export function getZapierRawData(automation: Automatisering): unknown | null {
  const rawExport = getZapierRawExport(automation);
  if (rawExport && Object.keys(rawExport).length > 0) return rawExport;
  if (automation.importProposal?.zap) return automation.importProposal.zap;
  return automation.importProposal ?? null;
}

function buildStepCards(
  processSteps: ZapierProcessStepInfo[],
  rawNodes: ZapierRawNode[],
  valueResolver: ZapierValueResolver,
): ZapierStepCard[] {
  if (processSteps.length > 0) {
    return processSteps.map((step, index) => {
      const rawNode = rawNodes[index];
      const role = getStepRole(step.kind, rawNode);
      const rawAppName = appNameFromRawNode(rawNode);
      return {
        index: step.index || index + 1,
        appName: rawAppName || step.appName || "Zapier",
        title: buildPlainStepTitle(step.title, step.summary, rawNode, role, index + 1),
        role,
        summary: buildReadableStepSummary(step.summary, rawNode, role, valueResolver),
        description: buildStepDescription(step.summary, rawNode, role, valueResolver),
        details: uniqueNonEmpty([
          ...(step.details ?? []),
          rawNode?.selected_api ? `Zapier API: ${rawNode.selected_api}` : "",
        ]),
        params: buildParamPairs(rawNode?.params, valueResolver),
        filter: buildFilterHighlight(rawNode, valueResolver),
        technicalDetail: buildTechnicalDetail(rawNode, index + 1),
      };
    });
  }

  return rawNodes.map((node, index) => {
    const role = getStepRole("", node);
    return {
      index: index + 1,
      appName: appNameFromRawNode(node) || "Zapier",
      title: buildPlainStepTitle("", "", node, role, index + 1),
      role,
      summary: buildReadableStepSummary("", node, role, valueResolver),
      description: buildStepDescription("", node, role, valueResolver),
      details: node.selected_api ? [`Zapier API: ${node.selected_api}`] : [],
      params: buildParamPairs(node.params, valueResolver),
      filter: buildFilterHighlight(node, valueResolver),
      technicalDetail: buildTechnicalDetail(node, index + 1),
    };
  });
}

function buildSummary(
  automation: Automatisering,
  stepCards: ZapierStepCard[],
  rawNodes: ZapierRawNode[],
  delay: string,
  valueResolver: ZapierValueResolver,
): string {
  if (stepCards.length === 0) {
    return "Deze Zap doorloopt de bekende Zapier-stappen uit de opgeslagen brondata. De pagina toont alleen wat in Zapier is vastgelegd.";
  }

  const triggerStep = stepCards.find((step) => step.role === "trigger") ?? stepCards[0];
  const trigger = triggerStep?.title || triggerStep?.summary || automation.trigger;
  const condition = describeCondition(rawNodes, valueResolver);
  const finalAction = stepCards.slice().reverse().find((step) => step.role === "action") ?? stepCards[stepCards.length - 1];
  const finalActionLabel = finalAction.title || finalAction.summary;
  const triggerClause = buildTriggerClause(trigger);
  const continuationParts = [
    delay ? `Daarna wacht Zapier ${delay}` : "",
    condition ? `controleert Zapier of ${condition}` : "",
    finalActionLabel ? buildActionClause(finalActionLabel) : "",
  ].filter(Boolean);

  const continuation = continuationParts.join(", ").replace(", en ", " en ");
  return `${triggerClause}. ${continuation ? `${capitalizeFirst(continuation)}. ` : ""}De pagina beschrijft alleen deze individuele Zap.`;
}

function buildEvidenceBadges(stepCards: ZapierStepCard[], rawExport: ZapierRawExport | null): string[] {
  const badges: string[] = [];
  if (stepCards.some((step) => step.role === "trigger")) badges.push(`${stepCards.find((step) => step.role === "trigger")?.appName || "Zapier"} trigger`);
  if (stepCards.some((step) => step.role === "middleware")) badges.push("Delay");
  if (stepCards.some((step) => step.role === "condition")) badges.push("Filter check");
  if (stepCards.some((step) => step.appName.toLowerCase().includes("hubspot") && step.role === "action")) badges.push("HubSpot action");
  else if (stepCards.some((step) => step.role === "action")) badges.push("Zapier action");
  if (rawExport?.sanitized_nodes) badges.push("Zapier export");
  if (badges.length === 0) badges.push("Zapier");
  return badges;
}

function buildDataflow(stepCards: ZapierStepCard[]): ZapierDataflowNode[] {
  const nodes = stepCards.map((step, index) => ({
    name: dataflowName(step),
    subtitle: step.summary || step.title,
    role: step.role,
    arrowLabel: index < stepCards.length - 1 ? arrowLabel(stepCards[index + 1]) : undefined,
  }));

  if (nodes.length > 0) return nodes;
  return [{
    name: "Zapier trigger",
    subtitle: "Trigger ontbreekt in de huidige Zapier-data",
    role: "trigger",
  }];
}

function buildFieldUsages(
  rawNodes: ZapierRawNode[],
  stepCards: ZapierStepCard[],
  valueResolver: ZapierValueResolver,
): ZapierFieldUsage[] {
  const usages: ZapierFieldUsage[] = [];

  rawNodes.forEach((node, index) => {
    const params = node.params ?? {};
    const step = stepCards[index];
    const source = step?.title || humanizeAction(node.action) || `Zapier stap ${index + 1}`;
    const action = String(node.action ?? "").toLowerCase();
    const rolePrefix = step?.role === "trigger" ? "trigger" : action.includes("update") || action.includes("create") ? "write" : "parameter";

    Object.entries(params).forEach(([key, value]) => {
      if (key === "filter_criteria" && Array.isArray(value)) {
        value.forEach((criterion) => {
          if (!isRecord(criterion)) return;
          const field = fieldNameFromZapierKey(stringFromUnknown(criterion.key));
          const criterionValue = stringFromUnknown(criterion.value);
          if (field && criterionValue) {
            usages.push({ field, role: "condition", value: valueResolver.resolveFieldValue(field, criterionValue), source });
          }
        });
        return;
      }

      if (key === "properties_to_retrieve" && Array.isArray(value)) {
        value.map(stringFromUnknown).filter(Boolean).forEach((field) => {
          usages.push({ field, role: "read", value: field, source });
        });
        return;
      }

      const formattedValue = formatParamValue(value);
      if (!formattedValue) return;
      const templateField = fieldNameFromTemplate(formattedValue);
      if (templateField) {
        usages.push({ field: templateField, role: "lookup input", value: formattedValue, source });
        return;
      }
      usages.push({ field: key, role: rolePrefix, value: valueResolver.resolveFieldValue(key, formattedValue), source });
    });
  });

  return uniqueFieldUsages(usages).slice(0, 12);
}

function buildApps(stepCards: ZapierStepCard[]): ZapierAppUsage[] {
  const seen = new Map<string, Set<string>>();
  stepCards.forEach((step) => {
    const name = step.appName || "Zapier";
    if (!seen.has(name)) seen.set(name, new Set());
    seen.get(name)?.add(roleLabel(step.role));
  });
  return [...seen.entries()].map(([name, roles]) => ({
    name,
    role: [...roles].join(", "),
  }));
}

function buildSourceMeta(
  automation: Automatisering,
  zapId: string,
  rawExport: ZapierRawExport | null,
  rawNodes: ZapierRawNode[],
): Array<{ label: string; value: string }> {
  const rootNode = findRootZapierNode(automation, rawNodes) ?? rawNodes[0];
  return [
    { label: "Zap ID", value: zapId || "Niet beschikbaar" },
    { label: "Node count", value: String(rawExport?.node_count ?? rawNodes.length) },
    { label: "Read-only", value: automation.importProposal?.read_only || rawExport?.read_only ? "Ja" : "Onbekend" },
    rootNode?.account_id ? { label: "Account ID", value: String(rootNode.account_id) } : null,
    rootNode?.authentication_id ? { label: "Authentication ID", value: String(rootNode.authentication_id) } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));
}

function buildIssues(
  automation: Automatisering,
  status: string,
  fieldUsages: ZapierFieldUsage[],
  rawExport: ZapierRawExport | null,
): ZapierIssue[] {
  const issues: ZapierIssue[] = (automation.sourceFindings ?? [])
    .filter((finding) => !finding.resolvedAt)
    .map((finding) => ({
      severity: finding.severity === "critical" ? "critical" : "gap",
      title: finding.message,
      subtitle: `Bronmelding: ${finding.type}`,
    }));

  if (status === "Disabled") {
    issues.push({
      severity: "gap",
      title: "Zap staat disabled",
      subtitle: "De opgeslagen Zapier-status geeft aan dat deze Zap uit staat.",
    });
  }

  if (fieldUsages.some((usage) => isHubSpotStageField(usage.field.toLowerCase()) && /^\d+$/.test(usage.value))) {
    issues.push({
      severity: "gap",
      title: "Stage labels ontbreken",
      subtitle: "Zapier levert hier vooral interne HubSpot IDs; menselijke stage labels zijn niet bewezen in deze brondata.",
    });
  }

  if (!automation.owner) {
    issues.push({
      severity: "gap",
      title: "Owner niet beschikbaar",
      subtitle: "De Zapier-export bevat IDs, maar geen betrouwbare menselijke eigenaar.",
    });
  }

  issues.push({
    severity: rawExport?.sanitized_nodes ? "gap" : "critical",
    title: "Live Zapier API niet beschikbaar",
    subtitle: rawExport?.sanitized_nodes
      ? "De pagina gebruikt opgeslagen Zapier-data; live refresh of user mapping is niet zichtbaar in deze detaildata."
      : "Er is geen volledige opgeslagen Zapier-export beschikbaar.",
  });

  if (issues.length === 1) {
    issues.push({
      severity: "resolved",
      title: "Zapier stappen beschikbaar",
      subtitle: "De belangrijkste step chain is uit de Zapier-data te tonen.",
    });
  }

  return issues;
}

function buildHeaderMeta(zapId: string, stepCount: number, createdAt: string, lastChanged: string): string[] {
  return [
    "Zapier Zap",
    zapId ? `Zap ID ${zapId}` : null,
    `${stepCount} ${stepCount === 1 ? "stap" : "stappen"}`,
    createdAt ? `Created ${formatHeaderDate(createdAt)}` : null,
    lastChanged ? `Updated ${formatHeaderDate(lastChanged)}` : null,
  ].filter((item): item is string => Boolean(item));
}

function buildZapierHeaderMeta(zapId: string, createdAt: string, lastChanged: string, timezone: string): string[] {
  return [
    zapId ? `Zap ID ${zapId}` : null,
    createdAt ? `Created ${formatDate(createdAt)}` : null,
    lastChanged ? `Last updated ${formatDate(lastChanged)}` : null,
    timezone ? `Timezone ${timezone}` : "Timezone onbekend",
  ].filter((item): item is string => Boolean(item));
}

function buildZapierEditorUrl(zapId: string): string | null {
  if (!zapId || /^unknown/i.test(zapId)) return null;
  return `https://zapier.com/app/editor/${encodeURIComponent(zapId)}`;
}

function getZapierRawExport(automation: Automatisering): ZapierRawExport | null {
  const raw = automation.importProposal?.zapier_export;
  if (!isRecord(raw)) return null;
  return raw as ZapierRawExport;
}

function getZapierRawNodes(value: unknown): ZapierRawNode[] {
  const nodes = Array.isArray(value)
    ? value.filter(isRecord)
    : isRecord(value)
      ? Object.values(value).filter(isRecord)
      : [];
  return sortRawNodes(nodes as ZapierRawNode[]);
}

function buildZapierValueResolver(
  automation: Automatisering,
  context: ZapierAutomationDetailContext,
): ZapierValueResolver {
  const pipelineLabels = new Map<string, string>();
  const stageLabels = new Map<string, string>();

  (context.pipelines ?? []).forEach((pipeline) => {
    addResolvedLabel(pipelineLabels, pipeline.pipelineId, pipeline.naam, true);
    pipeline.stages.forEach((stage) => addResolvedLabel(stageLabels, stage.stage_id, stage.label, true));
  });

  collectZapierAutomationsForInference(automation, context.allAutomations)
    .forEach((item) => inferZapierStageLabels(item, stageLabels));

  return {
    resolveFieldValue(field, value) {
      if (!value || value.includes("{{")) return value;
      const normalizedField = fieldNameFromZapierKey(field).toLowerCase();
      if (normalizedField === "pipeline") return pipelineLabels.get(value) ?? value;
      if (isHubSpotStageField(normalizedField)) return formatResolvedStageValue(stageLabels.get(value), value);
      return value;
    },
  };
}

function collectZapierAutomationsForInference(
  automation: Automatisering,
  allAutomations: Automatisering[] | undefined,
): Automatisering[] {
  if (!allAutomations?.length) return [];

  const byId = new Map<string, Automatisering>();
  [...allAutomations, automation].forEach((item) => {
    if (!isZapierAutomation(item)) return;
    byId.set(item.id, item);
  });
  return [...byId.values()];
}

function inferZapierStageLabels(automation: Automatisering, stageLabels: Map<string, string>): void {
  const title = getZapierAutomationTitle(automation);
  const transition = parseDealStageTransition(title);
  const mailTriggerLabel = parseMailTriggerStageLabel(title);
  if (!transition && !mailTriggerLabel) return;

  const rawNodes = getZapierRawNodes(getZapierRawExport(automation)?.sanitized_nodes);
  rawNodes.forEach((node) => {
    const params = node.params ?? {};
    const action = stringFromUnknown(node.action).toLowerCase();
    const stageId = stringFromUnknown(params.dealstage);

    if (transition && stageId) {
      if (isDealStageTriggerAction(action)) addResolvedLabel(stageLabels, stageId, transition.fromLabel);
      if (isDealStageWriteAction(action)) addResolvedLabel(stageLabels, stageId, transition.toLabel);
    }

    if (transition && Array.isArray(params.filter_criteria)) {
      params.filter_criteria.forEach((criterion) => {
        if (!isRecord(criterion)) return;
        const field = fieldNameFromZapierKey(stringFromUnknown(criterion.key)).toLowerCase();
        const value = stringFromUnknown(criterion.value);
        if (isHubSpotStageField(field) && value) addResolvedLabel(stageLabels, value, transition.fromLabel);
      });
    }

    if (mailTriggerLabel && stageId && isDealStageTriggerAction(action)) {
      addResolvedLabel(stageLabels, stageId, mailTriggerLabel);
    }
  });
}

function parseDealStageTransition(value: string): { fromLabel: string; toLabel: string } | null {
  const match = value.match(/deal\s*stage\s*update.*?:\s*(.+?)\s*->\s*(.+)$/i);
  if (!match) return null;
  const fromLabel = cleanHumanLabel(match[1]);
  const toLabel = cleanHumanLabel(match[2]);
  if (!fromLabel || !toLabel) return null;
  return { fromLabel, toLabel };
}

function parseMailTriggerStageLabel(value: string): string {
  const match = value.match(/^(.+?)\s+mail\s+naar\b/i);
  return match ? cleanHumanLabel(match[1]) : "";
}

function getZapierAutomationTitle(automation: Automatisering): string {
  return automation.importProposal?.zap?.title || automation.naam || "";
}

function isDealStageTriggerAction(action: string): boolean {
  return action.includes("updated_deal_stage") || action.includes("new_deal_stage");
}

function isDealStageWriteAction(action: string): boolean {
  return action.includes("update_crm_deal") || action.includes("update_deal");
}

function isHubSpotStageField(field: string): boolean {
  return field === "dealstage" || field.endsWith("stage") || field.includes("stage_");
}

function addResolvedLabel(
  labels: Map<string, string>,
  id: unknown,
  label: unknown,
  overwrite = false,
): void {
  const key = stringFromUnknown(id).trim();
  const value = cleanHumanLabel(stringFromUnknown(label));
  if (!key || !value || key === value) return;
  if (!overwrite && labels.has(key)) return;
  labels.set(key, value);
}

function formatResolvedStageValue(label: string | undefined, id: string): string {
  if (!label) return id;
  if (label.includes(`(${id})`)) return label;
  return `${label} (${id})`;
}

function resolveNodeParam(
  rawNode: ZapierRawNode | undefined,
  paramName: string,
  valueResolver: ZapierValueResolver,
): string {
  const rawValue = stringFromUnknown(rawNode?.params?.[paramName]);
  return rawValue ? valueResolver.resolveFieldValue(paramName, rawValue) : "";
}

function sortRawNodes(nodes: ZapierRawNode[]): ZapierRawNode[] {
  if (nodes.length <= 1) return nodes;
  const byId = new Map(nodes.map((node) => [String(node.id ?? ""), node]));
  const children = new Map<string, ZapierRawNode[]>();
  nodes.forEach((node) => {
    const parentId = node.parent_id == null ? "" : String(node.parent_id);
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId)?.push(node);
  });

  const sorted: ZapierRawNode[] = [];
  const visited = new Set<string>();
  const compareNode = (a: ZapierRawNode, b: ZapierRawNode) => Number(a.id ?? 0) - Number(b.id ?? 0);
  const visit = (node: ZapierRawNode) => {
    const id = String(node.id ?? "");
    if (!id || visited.has(id)) return;
    visited.add(id);
    sorted.push(node);
    (children.get(id) ?? []).sort(compareNode).forEach(visit);
  };

  const roots = nodes.filter((node) => node.parent_id == null || !byId.has(String(node.parent_id))).sort(compareNode);
  roots.forEach(visit);
  nodes.sort(compareNode).forEach(visit);
  return sorted;
}

function getStepRole(kind: string, rawNode: ZapierRawNode | undefined): ZapierStepRole {
  const raw = `${kind} ${rawNode?.action ?? ""} ${rawNode?.selected_api ?? ""} ${rawNode?.type_of ?? ""}`.toLowerCase();
  if (raw.includes("trigger") || raw.includes("updated_") || raw.includes("new_") || raw.includes("type_of read")) return "trigger";
  if (raw.includes("delay")) return "middleware";
  if (raw.includes("filter") || raw.includes("condition") || raw.includes("branch")) return "condition";
  if (raw.includes("lookup") || raw.includes("search") || raw.includes("get_") || raw.includes("find")) return "lookup";
  return "action";
}

function buildStepTypesDetail(stepCards: ZapierStepCard[]): string {
  if (stepCards.length === 0) return "Geen Zapier-stappen bekend.";
  return uniqueNonEmpty(stepCards.map((step) => stepTypeLabel(step.role))).join(", ");
}

function stepTypeLabel(role: ZapierStepRole): string {
  if (role === "middleware") return "delay";
  if (role === "condition") return "filter";
  if (role === "action") return "actie";
  return role;
}

function buildPlainStepTitle(
  title: string,
  summary: string,
  rawNode: ZapierRawNode | undefined,
  role: ZapierStepRole,
  index: number,
): string {
  const raw = `${title} ${summary} ${rawNode?.action ?? ""} ${rawNode?.selected_api ?? ""}`.toLowerCase();
  const delay = role === "middleware" ? formatDelay(rawNode?.params?.delay_for_value, rawNode?.params?.delay_for_unit) : "";

  if (role === "trigger") {
    if (raw.includes("hubspot") && raw.includes("deal")) return "Start wanneer HubSpot dealstage verandert";
    if (raw.includes("typeform")) return "Start wanneer Typeform een nieuw formulier ontvangt";
    if (raw.includes("trustoo")) return "Start wanneer Trustoo een nieuwe lead doorgeeft";
    return "Start wanneer de bron een nieuw signaal geeft";
  }

  if (role === "middleware") return delay ? `Wacht ${delay}` : "Wacht tot de ingestelde tijd voorbij is";

  if (role === "lookup") {
    if (raw.includes("hubspot") && raw.includes("deal")) return "Haalt de HubSpot deal opnieuw op";
    if (raw.includes("hubspot") && raw.includes("contact")) return "Haalt HubSpot contactgegevens op";
    return "Haalt extra gegevens op voor de volgende stap";
  }

  if (role === "condition") return "Controleert of de deal nog aan de voorwaarde voldoet";

  if (raw.includes("webhook")) return "Stuurt gegevens door naar een webhook";
  if (raw.includes("email") || raw.includes("outlook")) return "Verstuurt een e-mail";
  if (raw.includes("asana") || raw.includes("create_task")) return "Maakt een taak aan";
  if (raw.includes("hubspot") && raw.includes("deal")) return "Werkt de HubSpot deal bij";
  if (raw.includes("hubspot")) return "Werkt HubSpot bij";

  return `Voert Zapier stap ${index} uit`;
}

function buildStepDescription(
  summary: string,
  rawNode: ZapierRawNode | undefined,
  role: ZapierStepRole,
  valueResolver: ZapierValueResolver,
): string {
  const targetStage = resolveNodeParam(rawNode, "dealstage", valueResolver);
  const rawStage = stringFromUnknown(rawNode?.params?.dealstage);

  if (role === "trigger") return "Deze stap start de Zap zodra de bron een relevante wijziging of nieuw record meldt.";
  if (role === "middleware") return "Deze wachttijd voorkomt dat de vervolgactie te vroeg wordt uitgevoerd.";
  if (role === "lookup") return "Zapier haalt de laatste beschikbare gegevens op voordat de volgende beslissing wordt genomen.";
  if (role === "condition") return "Alleen records die aan deze voorwaarde voldoen mogen verder in de Zap.";
  if (targetStage && targetStage !== rawStage) return `Deze stap zet de HubSpot-dealstage op ${targetStage}.`;

  const action = `${summary} ${rawNode?.action ?? ""}`.toLowerCase();
  if (action.includes("webhook")) return "Deze stap draagt de gegevens over aan een volgend systeem.";
  if (action.includes("email")) return "Deze stap verstuurt de communicatie die bij deze Zap hoort.";
  return "Deze stap voert de uiteindelijke wijziging of overdracht uit.";
}

function buildFilterHighlight(
  rawNode: ZapierRawNode | undefined,
  valueResolver: ZapierValueResolver,
): ZapierStepCard["filter"] {
  const criteria = rawNode?.params?.filter_criteria;
  if (!Array.isArray(criteria)) return undefined;
  const first = criteria.find(isRecord);
  if (!first) return undefined;

  const field = fieldNameFromZapierKey(stringFromUnknown(first.key));
  const value = stringFromUnknown(first.value);
  const match = stringFromUnknown(first.match);
  if (!field || !value) return undefined;

  return {
    condition: `${field} ${match === "iexact" ? "gelijk is aan" : match || "matcht"} ${valueResolver.resolveFieldValue(field, value)}`,
    yesLabel: "Verder",
    noLabel: "Stop",
  };
}

function buildTechnicalDetail(rawNode: ZapierRawNode | undefined, index: number): string {
  if (!rawNode) return `Zapier stap ${index}`;
  return uniqueNonEmpty([
    rawNode.id ? `node ${rawNode.id}` : `stap ${index}`,
    rawNode.selected_api ? String(rawNode.selected_api) : "",
    rawNode.action ? `action ${rawNode.action}` : "",
  ]).join(" · ");
}

function findDelay(rawNodes: ZapierRawNode[], stepCards: ZapierStepCard[]): string {
  const rawDelay = rawNodes.find((node) => /delay/i.test(`${node.action ?? ""} ${node.selected_api ?? ""}`));
  const value = rawDelay?.params?.delay_for_value;
  const unit = rawDelay?.params?.delay_for_unit;
  if (value) return formatDelay(value, unit);

  const stepDelay = stepCards.find((step) => step.role === "middleware" && /delay|wacht/i.test(`${step.title} ${step.summary}`));
  const text = `${stepDelay?.title ?? ""} ${stepDelay?.summary ?? ""}`;
  const match = text.match(/(\d+)\s*(dag|dagen|day|days|uur|hour|hours|minute|minutes|minuten)/i);
  if (!match) return "";
  return formatDelay(match[1], match[2]);
}

function formatDelay(value: unknown, unit: unknown): string {
  const amount = stringFromUnknown(value);
  const normalizedUnit = stringFromUnknown(unit).toLowerCase();
  const unitLabel = normalizedUnit.startsWith("day") || normalizedUnit.startsWith("dag")
    ? amount === "1" ? "dag" : "dagen"
    : normalizedUnit.startsWith("hour") || normalizedUnit.startsWith("uur")
      ? amount === "1" ? "uur" : "uur"
      : normalizedUnit.startsWith("minute") || normalizedUnit.startsWith("min")
        ? amount === "1" ? "minuut" : "minuten"
        : normalizedUnit || "tijd";
  return [amount, unitLabel].filter(Boolean).join(" ");
}

function describeCondition(rawNodes: ZapierRawNode[], valueResolver: ZapierValueResolver): string {
  const filterNode = rawNodes.find((node) => Array.isArray(node.params?.filter_criteria));
  const criteria = filterNode?.params?.filter_criteria;
  if (!Array.isArray(criteria)) return "";
  const first = criteria.find(isRecord);
  if (!first) return "";
  const field = fieldNameFromZapierKey(stringFromUnknown(first.key));
  const value = stringFromUnknown(first.value);
  const match = stringFromUnknown(first.match);
  if (!field || !value) return "";
  return `${field} ${match === "iexact" ? "gelijk is aan" : match || "matcht"} ${valueResolver.resolveFieldValue(field, value)}`;
}

function dataflowName(step: ZapierStepCard): string {
  if (step.role === "trigger") return `${shortAppName(step.appName)} trigger`;
  if (step.role === "lookup") return `${shortAppName(step.appName)} lookup`;
  if (step.role === "condition") return "Filter by Zapier";
  if (step.role === "middleware") return "Delay by Zapier";
  return `${shortAppName(step.appName)} action`;
}

function arrowLabel(nextStep: ZapierStepCard): string {
  if (nextStep.role === "middleware") return "wait";
  if (nextStep.role === "lookup") return "lookup";
  if (nextStep.role === "condition") return "check";
  if (nextStep.role === "action") return "write";
  return "next";
}

function shortAppName(value: string): string {
  if (/hubspot/i.test(value)) return "HubSpot";
  if (/webhook/i.test(value)) return "Webhook";
  if (/delay/i.test(value)) return "Delay by Zapier";
  if (/filter/i.test(value)) return "Filter by Zapier";
  return value || "Zapier";
}

function roleLabel(role: ZapierStepRole): string {
  if (role === "trigger") return "trigger";
  if (role === "middleware") return "middleware";
  if (role === "lookup") return "read";
  if (role === "condition") return "condition";
  return "write/action";
}

function buildZapStatus(automation: Automatisering, zapStatus: string | undefined, rawNodes: ZapierRawNode[]): string {
  const rootNode = findRootZapierNode(automation, rawNodes);
  if (rootNode?.paused === true) return "Disabled";
  if (rootNode?.paused === false) return "Enabled";

  const normalizedZapStatus = normalizeZapStatus(zapStatus);
  if (normalizedZapStatus) return normalizedZapStatus;

  const normalizedAutomationStatus = normalizeZapStatus(automation.status);
  if (normalizedAutomationStatus && automation.importProposal?.zap) return normalizedAutomationStatus;

  return "Onbekend";
}

function findRootZapierNode(automation: Automatisering, rawNodes: ZapierRawNode[]): ZapierRawNode | undefined {
  return rawNodes.find((node) => String(node.id ?? "") === automation.externalId)
    ?? rawNodes.find((node) => node.parent_id == null || node.root_id == null)
    ?? rawNodes[0];
}

function normalizeZapStatus(value: string | undefined): string {
  if (!value) return "";
  if (/uitgeschakeld|paused|off|disabled|inactive|draft/i.test(value)) return "Disabled";
  if (/actief|active|on|enabled/i.test(value)) return "Enabled";
  return "";
}

function appNameFromRawNode(node: ZapierRawNode | undefined): string {
  const selectedApi = node?.selected_api ?? "";
  if (/HubSpot/i.test(selectedApi)) return "HubSpot";
  if (/Delay/i.test(selectedApi)) return "Delay by Zapier";
  if (/Filter/i.test(selectedApi)) return "Filter by Zapier";
  if (/Webhook/i.test(selectedApi)) return "Webhooks by Zapier";
  if (/Formatter/i.test(selectedApi)) return "Formatter by Zapier";
  return "";
}

function summarizeRawNode(node: ZapierRawNode | undefined, role: ZapierStepRole): string {
  if (!node) return "Zapier voert deze stap uit.";
  const action = humanizeAction(node.action);
  if (role === "trigger") return `${appNameFromRawNode(node) || "Zapier"} start bij ${action}.`;
  if (role === "middleware") return `Zapier voert ${action} uit.`;
  if (role === "condition") return `Zapier controleert een voorwaarde.`;
  if (role === "lookup") return `Zapier haalt data op via ${action}.`;
  return `Zapier voert ${action} uit.`;
}

function buildReadableStepSummary(
  fallbackSummary: string,
  rawNode: ZapierRawNode | undefined,
  role: ZapierStepRole,
  valueResolver: ZapierValueResolver,
): string {
  const stageLabel = resolveNodeParam(rawNode, "dealstage", valueResolver);
  const rawStage = stringFromUnknown(rawNode?.params?.dealstage);

  if (role === "action" && stageLabel && stageLabel !== rawStage) {
    return `Zapier zet de HubSpot-dealstage op ${stageLabel}.`;
  }

  if (role === "condition") {
    const condition = buildFilterHighlight(rawNode, valueResolver)?.condition;
    if (condition) return `Zapier controleert of ${condition}.`;
  }

  return fallbackSummary || summarizeRawNode(rawNode, role);
}

function buildParamPairs(
  params: Record<string, unknown> | null | undefined,
  valueResolver: ZapierValueResolver,
): Array<{ label: string; value: string }> {
  if (!params) return [];
  return Object.entries(params)
    .map(([label, value]) => ({ label, value: valueResolver.resolveFieldValue(label, formatParamValue(value)) }))
    .filter((item) => item.value)
    .slice(0, 6);
}

function formatParamValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item !== "object")) return value.map(String).join(", ");
    return value.map((item) => isRecord(item) ? Object.entries(item).map(([key, val]) => `${key}: ${formatParamValue(val)}`).join(", ") : String(item)).join(" | ");
  }
  if (isRecord(value)) {
    return Object.entries(value).map(([key, val]) => `${key}: ${formatParamValue(val)}`).join(", ");
  }
  return String(value);
}

function humanizeAction(value: unknown): string {
  const text = stringFromUnknown(value);
  if (!text) return "";
  return text.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function fieldNameFromTemplate(value: string): string {
  const match = value.match(/__([^}_]+)}}/);
  return match?.[1] ?? "";
}

function fieldNameFromZapierKey(value: string): string {
  if (!value) return "";
  return value.includes("__") ? value.split("__").pop() ?? value : value;
}

function uniqueFieldUsages(values: ZapierFieldUsage[]): ZapierFieldUsage[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.field}|${value.role}|${value.value}|${value.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return false;
    seen.add(trimmed);
    return true;
  });
}

function firstNonEmpty(values: Array<string | null | undefined>): string {
  return values.find((value): value is string => Boolean(value)) ?? "";
}

function latestDate(values: Array<string | null | undefined>): string {
  const dates = values
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((item) => !Number.isNaN(item.time))
    .sort((a, b) => b.time - a.time);
  return dates[0]?.value ?? "";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "onbekend";
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatHeaderDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function cleanSentence(value: string): string {
  return value.trim().replace(/[.]+$/g, "");
}

function cleanHumanLabel(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.]+$/g, "")
    .replace(/^[^A-Za-z0-9]+/, "")
    .trim();
}

function buildTriggerClause(value: string): string {
  const trigger = cleanSentence(value);
  if (/^start wanneer/i.test(trigger)) return `Deze Zap start wanneer ${trigger.replace(/^start wanneer\s*/i, "")}`;
  return `Deze Zap start wanneer ${trigger}`;
}

function buildActionClause(value: string): string {
  const action = cleanSentence(value);
  const lowerAction = lowercaseFirst(action);
  if (/^stuurt/i.test(action)) return `stuurt daarna${action.replace(/^stuurt\s*/i, " ")}`;
  if (/^werkt/i.test(action)) return `werkt daarna${action.replace(/^werkt\s*/i, " ")}`;
  if (/^verstuurt/i.test(action)) return `verstuurt daarna${action.replace(/^verstuurt\s*/i, " ")}`;
  if (/^maakt/i.test(action)) return `maakt daarna${action.replace(/^maakt\s*/i, " ")}`;
  if (/^voert/i.test(action)) return `voert daarna ${lowerAction.replace(/^voert\s*/i, "")}`;
  return `voert daarna uit: ${lowerAction}`;
}

function lowercaseFirst(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function capitalizeFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function stringFromUnknown(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
