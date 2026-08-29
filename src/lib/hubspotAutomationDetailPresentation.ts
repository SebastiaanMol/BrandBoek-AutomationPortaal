import type { Automatisering, HubSpotWorkflowActionInfo, HubSpotWorkflowTriggerInfo } from "./types";

export type HubSpotDetailTone = "neutral" | "good" | "warning" | "critical" | "info";

export interface HubSpotDetailMetric {
  label: string;
  value: string;
  detail: string;
  tone?: HubSpotDetailTone;
}

export interface HubSpotDataflowNode {
  name: string;
  subtitle: string;
  role: "source" | "orchestrator" | "destination";
  arrowLabel?: string;
}

export interface HubSpotConditionItem {
  kind: "if" | "and" | "re";
  title: string;
  subtitle: string;
  badge?: string;
}

export interface HubSpotWebhookAction {
  method: string;
  title: string;
  path: string;
  url?: string;
  authLabel?: string;
}

export interface HubSpotActionDetail {
  title: string;
  subtitle: string;
  badge: string;
}

export interface HubSpotPropertyUsage {
  property: string;
  rule: string;
  value: string;
}

export interface HubSpotObjectSource {
  objectTypeId: string;
  title: string;
  subtitle: string;
}

export interface HubSpotIssue {
  severity: "critical" | "gap" | "resolved" | "info";
  title: string;
  subtitle: string;
}

// De "boekhouders-lens" kaart: wat een niet-technische lezer nodig heeft om een
// automation te begrijpen, vóór alle technische onderbouwing eronder. Elk veld is
// optioneel — een lege waarde betekent dat we het (nog) niet betrouwbaar weten,
// en dan tonen we die regel gewoon niet, in plaats van iets te verzinnen.
export interface HubSpotWhatHappensPresentation {
  when?: string;
  background?: string;
  visibleInHubspot?: { status: "yes" | "no"; detail?: string };
  why?: string;
}

export interface HubSpotAutomationDetailPresentation {
  summary: string;
  triggerMoment?: string;
  whatHappens: HubSpotWhatHappensPresentation;
  systemTags: string[];
  evidenceBadges: string[];
  metrics: HubSpotDetailMetric[];
  dataflow: HubSpotDataflowNode[];
  conditions: HubSpotConditionItem[];
  reEnrollmentRules: HubSpotConditionItem[];
  webhookActions: HubSpotWebhookAction[];
  actionDetails: HubSpotActionDetail[];
  properties: HubSpotPropertyUsage[];
  objectSources: HubSpotObjectSource[];
  fieldMappingAvailability: {
    status: "not_available";
    title: string;
    subtitle: string;
  };
  issues: HubSpotIssue[];
  meta: Array<{ label: string; value: string }>;
}

type RawWorkflowExtras = {
  id?: string;
  revisionId?: string;
  isEnabled?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: { id?: string | null; email?: string | null; label?: string | null } | null;
  updatedBy?: { id?: string | null; email?: string | null; label?: string | null } | null;
  dataSources?: Array<{
    objectTypeId?: string;
    associationTypeId?: number | string;
    associationCategory?: string;
    sortBy?: { property?: string; order?: string };
    type?: string;
  }>;
  enrollmentCriteria?: {
    reEnrollmentTriggersFilterBranches?: unknown[];
  };
};

export function getHubSpotAutomationDetailPresentation(automation: Automatisering): HubSpotAutomationDetailPresentation {
  const workflow = automation.hubspotWorkflow;
  const rawWorkflow = (workflow ?? automation.importProposal?.hubspot_workflow ?? {}) as RawWorkflowExtras;
  const workflowName = workflow?.name || automation.naam;
  const objectLabel = formatObjectType(workflow?.objectType || automation.importProposal?.standard?.source);
  const triggers = workflow?.triggers ?? [];
  const actions = workflow?.actions ?? [];
  const webhookActions = buildWebhookActions(actions, automation.webhookPaths);
  const hasWebhook = webhookActions.length > 0;
  const actionDetails = buildActionDetails(actions, webhookActions);
  const conditions = buildConditions(triggers, automation.trigger);
  const reEnrollmentRules = buildReEnrollmentRules(workflow?.shouldReEnroll, triggers, rawWorkflow);
  const conditionCount = triggers.length || conditions.filter((condition) => condition.kind !== "re").length;

  return {
    summary: buildSummary(automation, workflowName, objectLabel, hasWebhook),
    triggerMoment: automation.aiEnrichment?.trigger_moment?.trim() || undefined,
    whatHappens: buildWhatHappens(automation),
    systemTags: (automation.aiEnrichment?.systems ?? []).filter((system) => Boolean(system?.trim())),
    evidenceBadges: buildEvidenceBadges(triggers, actions, workflow?.shouldReEnroll, automation),
    metrics: [
      {
        label: "Workflow state",
        value: isEnabled(automation, rawWorkflow) ? "Enabled" : "Disabled",
        detail: isEnabled(automation, rawWorkflow) ? "HubSpot mag records enrollen." : "Deze workflow staat niet actief.",
        tone: isEnabled(automation, rawWorkflow) ? "good" : "warning",
      },
      {
        label: "Actions",
        value: String(actions.length),
        detail: actions.length === 1 ? "Een workflowactie bekend." : `${actions.length} workflowacties bekend.`,
      },
      {
        label: "Conditions",
        value: String(conditionCount),
        detail: conditionCount > 0 ? "Startvoorwaarden uit HubSpot-data." : "Geen startvoorwaarden gevonden.",
      },
      buildRuntimeMetric(automation),
    ],
    dataflow: buildDataflow(objectLabel, workflowName, hasWebhook, automation.aiEnrichment?.data_flow),
    conditions,
    reEnrollmentRules,
    webhookActions,
    actionDetails,
    properties: buildPropertyUsage(triggers),
    objectSources: buildObjectSources(rawWorkflow),
    fieldMappingAvailability: {
      status: "not_available",
      title: "Field mappings niet beschikbaar in HubSpot workflowdata",
      subtitle: "Deze workflow toont voorwaarden en acties. Welke velden een backend endpoint leest of schrijft staat niet betrouwbaar in deze HubSpot workflowdata.",
    },
    issues: buildIssues(automation, hasWebhook),
    meta: buildMeta(automation, workflow, rawWorkflow, objectLabel),
  };
}

function buildSummary(
  automation: Automatisering,
  workflowName: string,
  objectLabel: string,
  hasWebhook: boolean,
): string {
  // Eerste keus: de rijke, per-automation gegenereerde uitleg ("aiEnrichment"). Dit is
  // specifieke, mensleesbare tekst (bv. welke stap wat doet en wat het eindresultaat is),
  // in tegenstelling tot de generieke status-zin die HubSpot-import altijd meegeeft.
  const enrichment = automation.aiEnrichment;
  const enrichedDescription = enrichment?.description?.trim();
  if (
    enrichedDescription
    && !containsTechnicalText(enrichedDescription)
    && !isGenericStatusDescription(enrichedDescription, automation.naam)
  ) {
    const endResult = enrichment?.end_result?.trim();
    if (endResult && !enrichedDescription.includes(endResult)) {
      // `end_result` is bedoeld als het concrete eindresultaat, maar bij veel automations
      // herhaalt het gegenereerde eindresultaat grotendeels dezelfde feiten als `description`
      // (bv. "dealstage ingesteld" + "extern systeem bijgewerkt" komen in allebei voor). Zonder
      // filter leest de samenvatting dan als twee keer dezelfde zin — precies het "generiek en
      // niet logisch" gevoel. Alleen toevoegen als het echt nieuwe informatie bevat, en dan
      // duidelijk gelabeld als resultaat i.p.v. als een derde, ononderscheiden zin.
      if (!hasSubstantialWordOverlap(enrichedDescription, endResult)) {
        return `${enrichedDescription} Resultaat: ${lowercaseFirstLetter(endResult)}`;
      }
    }
    return enrichedDescription;
  }

  const simpleDescription = enrichment?.summary?.trim()
    || automation.aiDescription
    || automation.beschrijvingInSimpeleTaal?.find((line) => line.trim())
    || automation.doel;
  if (simpleDescription && !containsTechnicalText(simpleDescription) && !isGenericStatusDescription(simpleDescription, automation.naam)) return simpleDescription.trim();

  const handoff = hasWebhook
    ? "Als de voorwaarden kloppen, geeft HubSpot het werk door aan een gekoppelde backend-verwerking."
    : "Als de voorwaarden kloppen, voert HubSpot de ingestelde workflowactie uit.";
  const objectDescription = objectLabel === "Record" ? "HubSpot-records" : `${objectLabel.toLowerCase()}-records`;
  return `Deze HubSpot-workflow bewaakt ${objectDescription} en start "${workflowName}" wanneer de ingestelde voorwaarden gelden. ${handoff} De pagina hierboven beschrijft deze individuele automation en toont alleen broninformatie die uit HubSpot beschikbaar is.`;
}

// Bouwt de inhoud voor de "Wat gebeurt er?"-kaart: de plek waar iemand zonder
// technische achtergrond in één keer moet kunnen zien wanneer deze regel afgaat,
// wat er dan gebeurt (met een expliciet onderscheid tussen het onzichtbare
// achtergrondeffect en of dat effect ook echt in HubSpot te zien is), en waarom
// die regel bestaat. Elk stukje komt uit een los `ai_enrichment`-veld dat per
// automation wordt ingevuld tijdens de contentronde; zolang dat nog niet is
// gebeurd, laten we de betreffende regel gewoon weg in plaats van te gokken.
function buildWhatHappens(automation: Automatisering): HubSpotWhatHappensPresentation {
  const enrichment = automation.aiEnrichment;

  const when = enrichment?.when_text?.trim() || enrichment?.trigger_moment?.trim() || undefined;
  const background = enrichment?.data_flow?.trim() || undefined;
  const why = enrichment?.why_text?.trim() || undefined;

  let visibleInHubspot: HubSpotWhatHappensPresentation["visibleInHubspot"];
  if (typeof enrichment?.visible_in_hubspot === "boolean") {
    visibleInHubspot = {
      status: enrichment.visible_in_hubspot ? "yes" : "no",
      detail: enrichment.visible_in_hubspot_detail?.trim() || undefined,
    };
  }

  return { when, background, visibleInHubspot, why };
}

function buildEvidenceBadges(
  triggers: HubSpotWorkflowTriggerInfo[],
  actions: HubSpotWorkflowActionInfo[],
  shouldReEnroll: boolean | undefined,
  automation: Automatisering,
): string[] {
  const badges = [];
  if (triggers.length > 0) badges.push("HubSpot criteria");
  if (actions.some(isWebhookAction)) badges.push("Webhook action");
  else if (actions.length > 0) badges.push("HubSpot action");
  if (shouldReEnroll) badges.push("Re-enrollment");
  if (automation.hubspotLastRunAt) badges.push("Last run");
  if (badges.length === 0) badges.push("HubSpot automation");
  return badges;
}

function buildRuntimeMetric(automation: Automatisering): HubSpotDetailMetric {
  if (typeof automation.hubspotRunCount365d === "number") {
    return {
      label: "Runtime metrics",
      value: `${new Intl.NumberFormat("nl-NL").format(automation.hubspotRunCount365d)} runs`,
      detail: automation.hubspotLastRunAt ? `Laatste run: ${formatDate(automation.hubspotLastRunAt)}` : "Run count over 365 dagen.",
      tone: "good",
    };
  }
  if (automation.hubspotLastRunAt) {
    return {
      label: "Runtime metrics",
      value: "Last run known",
      detail: formatDate(automation.hubspotLastRunAt),
      tone: "info",
    };
  }
  return {
    label: "Runtime metrics",
    value: "Unavailable",
    detail: "Geen runs, success ratio of runtime in deze brondata.",
    tone: "warning",
  };
}

function buildDataflow(objectLabel: string, workflowName: string, hasWebhook: boolean, dataFlowDescription?: string): HubSpotDataflowNode[] {
  return [
    {
      name: `HubSpot ${objectLabel}`,
      subtitle: "Source trigger: record voldoet aan workflowcriteria",
      role: "source",
      arrowLabel: "criteria match",
    },
    {
      name: workflowName,
      subtitle: dataFlowDescription?.trim() || "Orchestrator: HubSpot workflow",
      role: "orchestrator",
      arrowLabel: hasWebhook ? "POST webhook" : "workflow action",
    },
    {
      name: hasWebhook ? "Backend endpoint" : "HubSpot action",
      subtitle: hasWebhook ? "Uitvoering buiten HubSpot" : "Actie binnen HubSpot",
      role: "destination",
    },
  ];
}

function buildConditions(triggers: HubSpotWorkflowTriggerInfo[], fallbackTrigger: string): HubSpotConditionItem[] {
  const items = triggers
    .map((trigger, index) => ({
      kind: index === 0 ? "if" as const : "and" as const,
      title: trigger.label || formatConditionTitle(trigger),
      subtitle: formatConditionSubtitle(trigger),
      badge: formatOperator(trigger.operator) || trigger.source || "HubSpot",
    }))
    .filter((condition) => condition.title.trim());

  if (items.length > 0) return items;
  if (fallbackTrigger.trim()) {
    return [{
      kind: "if",
      title: fallbackTrigger.trim(),
      subtitle: "Fallback uit automation triggertekst.",
      badge: "fallback",
    }];
  }
  return [{
    kind: "if",
    title: "Geen startvoorwaarden beschikbaar",
    subtitle: "HubSpot workflowcriteria ontbreken in de huidige brondata.",
    badge: "missing",
  }];
}

function buildReEnrollmentRules(
  shouldReEnroll: boolean | undefined,
  triggers: HubSpotWorkflowTriggerInfo[],
  rawWorkflow: RawWorkflowExtras,
): HubSpotConditionItem[] {
  if (!shouldReEnroll) {
    return [{
      kind: "re",
      title: "Re-enrollment niet aangetoond",
      subtitle: "De workflowdata toont geen actieve re-enrollment instelling.",
      badge: "off",
    }];
  }

  const rawCount = rawWorkflow.enrollmentCriteria?.reEnrollmentTriggersFilterBranches?.length ?? 0;
  const triggerRules = triggers.slice(0, Math.max(rawCount || 0, 3));
  if (triggerRules.length === 0) {
    return [{
      kind: "re",
      title: "Records kunnen opnieuw instromen",
      subtitle: "HubSpot meldt re-enrollment, maar de specifieke triggerregels ontbreken in de genormaliseerde data.",
      badge: "on",
    }];
  }

  return triggerRules.map((trigger) => ({
    kind: "re",
    title: trigger.property ? `${trigger.property} wijzigt of voldoet opnieuw` : trigger.label,
    subtitle: trigger.label || "HubSpot kan het record opnieuw enrollen wanneer deze voorwaarde opnieuw klopt.",
    badge: "re",
  }));
}

function buildWebhookActions(actions: HubSpotWorkflowActionInfo[], webhookPaths: string[] | undefined): HubSpotWebhookAction[] {
  const fromActions = actions.filter(isWebhookAction).map((action) => {
    const path = action.webhookPath || extractPath(action.webhookUrl) || action.label;
    return {
      method: action.webhookMethod || "POST",
      title: action.label || "Webhook action",
      path,
      url: action.webhookUrl ?? undefined,
      authLabel: "Auth via HubSpot action settings",
    };
  });

  const knownPaths = new Set(fromActions.map((action) => action.path));
  const fromPaths = (webhookPaths ?? [])
    .filter((path) => path && !knownPaths.has(path))
    .map((path) => ({
      method: "POST",
      title: "Webhook path",
      path,
      authLabel: "Auth onbekend",
    }));

  return [...fromActions, ...fromPaths];
}

function buildActionDetails(actions: HubSpotWorkflowActionInfo[], webhookActions: HubSpotWebhookAction[]): HubSpotActionDetail[] {
  if (webhookActions.length > 0) {
    return webhookActions.map((action) => ({
      title: action.title,
      subtitle: action.path,
      badge: action.method,
    }));
  }

  return actions.map((action) => ({
    title: action.label || action.type || "HubSpot action",
    subtitle: action.propertyName
      ? `${action.propertyName}${action.propertyValue ? ` = ${String(action.propertyValue)}` : ""}`
      : "Workflowactie uit HubSpot.",
    badge: action.type || "ACTION",
  }));
}

function buildPropertyUsage(triggers: HubSpotWorkflowTriggerInfo[]): HubSpotPropertyUsage[] {
  return triggers
    .filter((trigger) => trigger.property)
    .map((trigger) => ({
      property: trigger.property ?? "",
      rule: formatOperator(trigger.operator) || "is",
      value: formatValue(trigger.value) || trigger.label || "bekend",
    }));
}

function buildObjectSources(rawWorkflow: RawWorkflowExtras): HubSpotObjectSource[] {
  return (rawWorkflow.dataSources ?? [])
    .filter((source) => source.objectTypeId)
    .map((source) => ({
      objectTypeId: source.objectTypeId ?? "unknown",
      title: `Association type ${source.associationTypeId ?? "unknown"}`,
      subtitle: source.sortBy?.property
        ? `Sorted by ${source.sortBy.property}${source.sortBy.order ? ` ${source.sortBy.order.toLowerCase()}` : ""}.`
        : source.associationCategory || source.type || "HubSpot association",
    }));
}

function buildIssues(automation: Automatisering, hasWebhook: boolean): HubSpotIssue[] {
  const issues: HubSpotIssue[] = (automation.sourceFindings ?? [])
    .filter((finding) => !finding.resolvedAt)
    .map((finding) => ({
      severity: finding.severity === "critical" ? "critical" : "gap",
      title: finding.message,
      subtitle: `Bronmelding: ${finding.type}`,
    }));

  if (hasWebhook) {
    issues.push({
      severity: "gap",
      title: "Backend effect is outside HubSpot",
      subtitle: "HubSpot toont de handoff, niet wat het endpoint daarna precies leest of schrijft.",
    });
  }

  if (typeof automation.hubspotRunCount365d !== "number" && !automation.hubspotLastRunAt) {
    issues.push({
      severity: "gap",
      title: "Runtime metrics ontbreken",
      subtitle: "Geen success ratio, error count of gemiddelde runtime in deze brondata.",
    });
  }

  issues.push({
    severity: "gap",
    title: "Field mappings ontbreken",
    subtitle: "HubSpot workflowdata bevat geen betrouwbare bron-naar-doel veldmapping.",
  });

  if (issues.length === 1) {
    issues.push({
      severity: "resolved",
      title: "HubSpot voorwaarden beschikbaar",
      subtitle: "De belangrijkste startcriteria zijn uit de workflowdata te halen.",
    });
  }

  return issues;
}

function buildMeta(
  automation: Automatisering,
  workflow: Automatisering["hubspotWorkflow"],
  rawWorkflow: RawWorkflowExtras,
  objectLabel: string,
): Array<{ label: string; value: string }> {
  const createdBy = workflow?.createdBy ?? rawWorkflow.createdBy ?? null;
  const updatedBy = workflow?.updatedBy ?? rawWorkflow.updatedBy ?? null;
  const createdAt = workflow?.createdAt ?? rawWorkflow.createdAt ?? null;
  const updatedAt = workflow?.updatedAt ?? rawWorkflow.updatedAt ?? null;

  return [
    { label: "Workflow ID", value: workflow?.workflowId || rawWorkflow.id || automation.externalId || automation.id },
    { label: "Object", value: objectLabel },
    { label: "Portal owner", value: automation.owner || "Niet toegewezen" },
    { label: "HubSpot created by", value: createdBy ? formatUserAudit(createdBy) : HUBSPOT_AUDIT_SYNC_FALLBACK },
    { label: "Created at", value: createdAt ? formatDate(createdAt) : HUBSPOT_AUDIT_SYNC_FALLBACK },
    { label: "HubSpot updated by", value: updatedBy ? formatUserAudit(updatedBy) : HUBSPOT_AUDIT_SYNC_FALLBACK },
    { label: "Updated at", value: updatedAt ? formatDate(updatedAt) : HUBSPOT_AUDIT_SYNC_FALLBACK },
    { label: "Last run", value: automation.hubspotLastRunAt ? formatDate(automation.hubspotLastRunAt) : "Niet beschikbaar" },
    { label: "Last synced", value: automation.lastSyncedAt ? formatDate(automation.lastSyncedAt) : "Niet beschikbaar" },
    { label: "Verified", value: automation.laatstGeverifieerd ? formatDate(automation.laatstGeverifieerd) : "Niet geverifieerd" },
  ].filter((item): item is { label: string; value: string } => Boolean(item));
}

const HUBSPOT_AUDIT_SYNC_FALLBACK = "Niet beschikbaar via HubSpot API";

function formatUserAudit(user: { id?: string | null; email?: string | null; label?: string | null }): string {
  const label = user.label?.trim();
  const email = user.email?.trim();
  const id = user.id?.trim();
  if (label && email && label !== email) return `${label} (${email})`;
  return label || email || (id ? `HubSpot user ${id}` : "Onbekend");
}

function isWebhookAction(action: HubSpotWorkflowActionInfo): boolean {
  return Boolean(action.webhookUrl || action.webhookPath || /webhook/i.test(action.type));
}

function isEnabled(automation: Automatisering, rawWorkflow: RawWorkflowExtras): boolean {
  if (typeof rawWorkflow.isEnabled === "boolean") return rawWorkflow.isEnabled;
  return automation.status !== "Uitgeschakeld";
}

function formatObjectType(value: string | null | undefined): string {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "0-3" || normalized.includes("deal")) return "Deal";
  if (normalized === "0-1" || normalized.includes("contact")) return "Contact";
  if (normalized === "0-2" || normalized.includes("company")) return "Company";
  if (normalized === "0-8" || normalized.includes("line")) return "Line item";
  return value?.trim() || "Record";
}

function formatConditionTitle(trigger: HubSpotWorkflowTriggerInfo): string {
  if (!trigger.property) return trigger.label;
  const value = formatValue(trigger.value);
  if (!value) return `${trigger.property} ${trigger.operator || "is bekend"}`;
  return `${trigger.property} ${formatOperator(trigger.operator) || "is"} ${value}`;
}

function formatConditionSubtitle(trigger: HubSpotWorkflowTriggerInfo): string {
  if (trigger.property) return `HubSpot property: ${trigger.property}`;
  return trigger.source ? `Bron: ${trigger.source}` : "HubSpot startvoorwaarde.";
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return formatValue(objectValue.value)
      || formatValue(objectValue.values)
      || formatValue(objectValue.operationType)
      || formatValue(objectValue.operator)
      || "";
  }
  return String(value);
}

function formatOperator(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return formatValue(objectValue.operator) || formatValue(objectValue.operationType);
  }
  return String(value);
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

function extractPath(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

const SUMMARY_STOPWORDS = new Set([
  "de", "het", "een", "en", "van", "voor", "naar", "op", "in", "is", "wordt", "worden",
  "bij", "aan", "die", "dat", "deze", "dit", "als", "via", "met", "uit", "na", "daarna",
  "afhankelijk", "criteria", "relevante", "relevant", "gedefinieerde", "verdere",
]);

function significantWords(value: string): Set<string> {
  const words = value
    .toLowerCase()
    .replace(/['"()]/g, "")
    .split(/[^a-z0-9à-ÿ-]+/i)
    .filter((word) => word.length >= 4 && !SUMMARY_STOPWORDS.has(word));
  return new Set(words);
}

// Twee woorden tellen als "hetzelfde" als ze exact overeenkomen, of als het duidelijke
// vervoegingen/varianten van elkaar zijn (extern/externe, routing/procesrouting). Puur exacte
// matching mist te veel van dit soort AI-gegenereerde variatie en onderschat daardoor hoezeer
// end_result gewoon description herhaalt.
function wordsRelate(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a));
}

// Schat in of `end_result` grotendeels dezelfde inhoud herhaalt als `description`, zodat we
// weten of het toevoegen ervan de samenvatting echt iets nieuws vertelt of alleen langer maakt.
function hasSubstantialWordOverlap(description: string, endResult: string): boolean {
  const descWords = Array.from(significantWords(description));
  const resultWords = Array.from(significantWords(endResult));
  if (resultWords.length === 0) return true;

  const shared = resultWords.filter((word) => descWords.some((descWord) => wordsRelate(descWord, word))).length;
  return shared / resultWords.length >= 0.5;
}

function lowercaseFirstLetter(value: string): string {
  return value.length > 0 ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function containsTechnicalText(value: string): boolean {
  return /\b(GET|POST|PUT|PATCH|DELETE)\b|https?:\/\/|webhook\s*->|(?:^|\s)\/[a-z0-9][^\s.,)]|een van deze waarden is ['"]?\d+['"]?/i.test(value);
}

function isGenericStatusDescription(value: string, automationName: string): boolean {
  // Dit vangt de generieke boilerplate-zin die bij elke import automatisch wordt meegegeven
  // (bv. "Deze automatisering heet 'X' en is momenteel uitgeschakeld."), zodat we die nooit
  // als "goede" beschrijving tonen. De naam in die zin komt soms niet meer exact overeen met
  // de huidige `naam` van de automation (bv. omdat de portal-naam later een disambiguerend
  // ID-suffix kreeg), en de status kan ook "uitgeschakeld"/"in review"/"verouderd" zijn i.p.v.
  // alleen "actief", en met of zonder het woord "momenteel" — dus we matchen daar flexibel op.
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  const statusPattern = "(?:momenteel\\s+)?(?:actief|uitgeschakeld|in review|verouderd)";
  if (new RegExp(`^deze automatisering is ${statusPattern}\\.?$`, "i").test(normalized)) return true;

  const match = normalized.match(new RegExp(`^deze automatisering heet ['"]?(.+?)['"]?\\s+en is ${statusPattern}\\.?$`, "i"));
  if (!match) return false;
  const quotedName = match[1].trim();
  const name = automationName.trim().toLowerCase();
  return name === quotedName || name.startsWith(quotedName) || quotedName.startsWith(name);
}
