import type { Automatisering, HubSpotWorkflowActionInfo, Pipeline } from "./types";

export interface ProcessJourneyCopyContext {
  pipelines?: Pipeline[];
  autoMap?: Map<string, Automatisering>;
}

export interface HubSpotTriggerValueList {
  property: string;
  values: string[];
}

export interface HubSpotBranchPath {
  id: string;
  label: string;
  conditionLabel: string;
  updates: Array<{ property: string; value: string }>;
  webhookPath?: string;
}

export interface ProcessJourneyNarrative {
  opening: string;
  triggerIntro: string;
  triggerValues: string[];
  hubspotStep: string;
  backendStep: string;
  hubspotUpdate: string;
  downstream: string;
  chainSummary: string;
}

export function buildStageValueResolver(pipelines: Pipeline[] = []): Map<string, { label: string; pipeline: string }> {
  const stages = new Map<string, { label: string; pipeline: string }>();

  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) {
      stages.set(stage.stage_id, { label: stage.label, pipeline: pipeline.naam });
    }
  }

  return stages;
}

export function formatHubSpotTriggerSentence(
  automation: Automatisering,
  context: ProcessJourneyCopyContext = {},
): string | undefined {
  const sentence = findTriggerSentence(automation);
  if (!sentence) return undefined;

  const normalized = sentence
    .replace(/^Stap\s+\d+(?:\.\d+)?:\s*/i, "")
    .replace(/^De automatisering start\b/i, "Start")
    .replace(/^Deze automatisering start\b/i, "Start")
    .replace(/^De automatisering\s+/i, "")
    .replace(/^Deze automatisering\s+/i, "")
    .replace(/object-eigenschap/g, "HubSpot-eigenschap")
    .replace(/\.$/, "");

  return resolveHubSpotValuesInSentence(normalized, context);
}

export function getHubSpotTriggerValueList(
  automation: Automatisering,
  context: ProcessJourneyCopyContext = {},
): HubSpotTriggerValueList | undefined {
  const sentence = formatHubSpotTriggerSentence(automation, context);
  if (!sentence) return undefined;

  const match = sentence.match(/(?:Start\s+(?:zodra|wanneer|als)\s+)?(?:HubSpot-eigenschap '([^']+)'|(?:de\s+)?([A-Za-z][\w\s-]*?)) een van deze waarden is (.+)$/i);
  if (!match) return undefined;

  const property = normalizeHubSpotProperty(match[1] ?? match[2] ?? "");
  const valuesText = match[3];
  const quotedValues = [...valuesText.matchAll(/'([^']+)'/g)].map((valueMatch) => valueMatch[1]).filter(Boolean);
  const values = quotedValues.length === 1 && quotedValues[0].includes(",")
    ? splitHubSpotValueList(quotedValues[0])
    : quotedValues;
  if (values.length < 2) return undefined;

  return {
    property,
    values,
  };
}

export function getPrimaryWebhookPath(automation: Automatisering): string | undefined {
  return automation.hubspotWorkflow?.actions.find((action) => action.webhookPath || action.webhookUrl)?.webhookPath
    ?? automation.webhookPaths?.[0];
}

export function getHubSpotWorkflowBranchPaths(
  automation: Automatisering,
  context: ProcessJourneyCopyContext = {},
): HubSpotBranchPath[] {
  if (automation.source !== "hubspot") return [];

  const directBranches = automation.hubspotWorkflow?.branches ?? [];
  if (directBranches.length > 0) {
    return directBranches.map((branch, index) => {
      const updates = extractPropertyUpdates(branch.actions ?? []);
      const webhookPath = branch.actions?.find((action) => action.webhookPath || action.webhookUrl)?.webhookPath
        ?? getPrimaryWebhookPath(automation);

      return {
        id: branch.id || `branch-${index + 1}`,
        label: cleanBranchLabel(branch.label || `Pad ${index + 1}`),
        conditionLabel: branch.conditionLabel || cleanBranchLabel(branch.label || `Pad ${index + 1}`),
        updates,
        webhookPath,
      };
    });
  }

  const labels = (automation.branches ?? [])
    .flatMap((branch) => splitHubSpotValueList(resolveHubSpotValue("dealstage", branch.label, context)))
    .map(cleanBranchLabel)
    .filter(Boolean);
  const triggerValues = getHubSpotTriggerValueList(automation, context)?.values ?? [];
  const branchLabels = labels.length >= 2 ? labels : triggerValues;
  if (branchLabels.length < 2) return [];

  const updateProperty = inferBranchUpdateProperty(automation);
  const webhookPath = getPrimaryWebhookPath(automation);

  return branchLabels.map((label, index) => {
    const cleanedLabel = cleanBranchLabel(label);
    const condition = findMatchingTriggerValue(cleanedLabel, triggerValues) ?? cleanedLabel;

    return {
      id: `branch-${index + 1}`,
      label: cleanedLabel,
      conditionLabel: cleanBranchLabel(condition),
      updates: updateProperty ? [{ property: updateProperty, value: cleanedLabel }] : [],
      webhookPath,
    };
  });
}

function extractPropertyUpdates(actions: HubSpotWorkflowActionInfo[]): Array<{ property: string; value: string }> {
  return actions
    .filter((action) => action.propertyName)
    .map((action) => ({
      property: prettifyIdentifier(String(action.propertyName)),
      value: action.propertyValue == null ? "bijwerken" : cleanBranchLabel(String(action.propertyValue)),
    }));
}

function inferBranchUpdateProperty(automation: Automatisering): string | undefined {
  const actionProperty = automation.hubspotWorkflow?.actions
    .map((action) => action.propertyName)
    .find((property): property is string => Boolean(property));
  if (actionProperty) return prettifyIdentifier(actionProperty);

  const stepProperty = automation.stappen
    .map((step) => step.match(/(?:Stel|Set)\s+'([^']+)'/i)?.[1])
    .find((property): property is string => Boolean(property));
  if (stepProperty) return prettifyIdentifier(stepProperty);

  const text = `${automation.naam} ${automation.doel} ${automation.stappen.join(" ")}`.toLowerCase();
  if (text.includes("btw") && text.includes("2 maanden")) {
    return "BTW 2 maanden geboekt huidig kwartaal";
  }

  return undefined;
}

function findMatchingTriggerValue(label: string, triggerValues: string[]): string | undefined {
  const cleanedLabel = cleanBranchLabel(label).toLowerCase();
  const exactMatch = triggerValues.find((value) => cleanBranchLabel(value).toLowerCase() === cleanedLabel);
  if (exactMatch) return exactMatch;

  const normalizedLabel = normalizeBranchText(label);
  return triggerValues.find((value) => {
    const normalizedValue = normalizeBranchText(cleanBranchLabel(value));
    return normalizedValue.includes(normalizedLabel) || normalizedLabel.includes(normalizedValue);
  });
}

function cleanBranchLabel(value: string): string {
  const cleaned = value
    .replace(/\s+\([^)]*id\s+\d+[^)]*\)$/i, "")
    .replace(/\s+\([^)]*(?:id\s+\d+|pipeline)[^)]*$/i, "")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/[^\w\s()/-]/g, "")
    .trim();

  if (/^id\s+\d+\)?$/i.test(cleaned)) return "";
  return cleaned;
}

function splitHubSpotValueList(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let parenthesisDepth = 0;

  for (const char of value) {
    if (char === "(") parenthesisDepth += 1;
    if (char === ")" && parenthesisDepth > 0) parenthesisDepth -= 1;

    if (char === "," && parenthesisDepth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function normalizeBranchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^\w]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveAutomationIdsForConceptJourney(
  ids: string[],
  autoMap: Map<string, Automatisering>,
  endpoint: string,
): string[] {
  if (!endpoint) return ids;
  const idSet = new Set(ids);

  return ids.map((id) => {
    const automation = autoMap.get(id);
    if (!automation || !isLegacyGitLabFileAutomation(automation)) return id;
    const specificAutomation = findSpecificGitLabAutomationForEndpoint(autoMap, endpoint);
    if (!specificAutomation) return id;
    return idSet.has(specificAutomation.id) ? id : specificAutomation.id;
  });
}

export function findSpecificGitLabAutomationForEndpoint(
  autoMap: Map<string, Automatisering>,
  endpoint: string,
): Automatisering | undefined {
  return [...autoMap.values()].find((automation) => {
    if (automation.source !== "gitlab" || isLegacyGitLabFileAutomation(automation)) return false;
    const candidates = [
      automation.gitlabEndpoint?.endpoint,
      automation.endpoints?.[0],
      automation.externalId?.split("::").at(1),
    ].filter(Boolean);
    return candidates.some((candidate) => candidate === endpoint);
  });
}

export function isLegacyGitLabFileAutomation(automation: Automatisering): boolean {
  return automation.source === "gitlab" && (!automation.externalId || !automation.externalId.includes("::"));
}

export function summarizeAutomationForProcessJourney(
  automation: Automatisering,
  context: ProcessJourneyCopyContext = {},
): string {
  const isGitLab = automation.source === "gitlab" || Boolean(automation.gitlabFilePath);
  if (isGitLab) {
    const readsHubSpot = (automation.gitlabEndpoint?.calls ?? []).some((call) => call.kind === "hubspot_repository_call");
    return [
      "Backendverwerking in GitLab.",
      readsHubSpot ? "Leest of wijzigt HubSpot-data." : "Backendstap in GitLab.",
      "Technische endpoint- en handlerdetails staan in de automationdetails of Logica.",
    ].filter(Boolean).join(" ");
  }

  if (automation.source === "hubspot") {
    const trigger = formatHubSpotTriggerSentence(automation, context);
    const webhook = getPrimaryWebhookPath(automation);
    return [
      trigger ? `${trigger}.` : automation.trigger ? `Trigger: ${automation.trigger}.` : "HubSpot workflow die het proces routeert.",
      webhook ? "Geeft het werk door aan een backendverwerking." : "",
    ].filter(Boolean).join(" ");
  }

  if (automation.source === "zapier") {
    const processTrigger = automation.importProposal?.zap?.process?.trigger;
    const cleanTrigger = processTrigger?.replace(/[.!?]+$/, "");
    return [
      cleanTrigger ? `Zapier start bij: ${cleanTrigger}.` : "Zapier-automation die gegevens doorgeeft aan de volgende verwerking.",
      "Het portaal leest deze Zap read-only uit; technische webhookdetails staan bij Logica en bewijs.",
    ].filter(Boolean).join(" ");
  }

  return automation.doel || automation.trigger || "Geen korte uitleg beschikbaar.";
}

export function buildProcessJourneyNarrative({
  automations,
  endpoint,
  context = {},
}: {
  automations: Automatisering[];
  endpoint?: string;
  context?: ProcessJourneyCopyContext;
}): ProcessJourneyNarrative {
  const startAutomation =
    automations.find((automation) => automation.source === "hubspot" || automation.source === "zapier" || automation.source === "typeform") ??
    automations[0];
  const hubspot = startAutomation?.source === "hubspot" ? startAutomation : undefined;
  const gitlab = automations.find((automation) => automation.source === "gitlab" || Boolean(automation.gitlabFilePath)) ?? automations.at(-1);
  const domains = inferDomains(automations);
  const journeyKind = inferJourneyKind(automations);
  const triggerValues = hubspot ? getHubSpotTriggerValueList(hubspot, context) : undefined;
  const triggerSentence = hubspot ? formatHubSpotTriggerSentence(hubspot, context) : undefined;
  const workflowName = startAutomation
    ? cleanNarrativeName(cleanProcessJourneyTitle(startAutomation.naam))
    : "de automation";
  const startSource = startAutomation?.source ?? null;
  const sourceLabel = processStartSourceLabel(startSource);
  const workerName = gitlab ? cleanProcessJourneyTitle(gitlab.naam) : "de backend";
  const stateWrite = gitlab ? formatStateWriteForNarrative(inferStateWriteFromAutomation(gitlab)) : undefined;

  return {
    opening: buildOpeningNarrative(journeyKind, domains),
    triggerIntro: triggerValues
      ? `De procesreis start zodra de ${propertyLabel(triggerValues.property)} in HubSpot een van de volgende waarden krijgt:`
      : triggerSentence
        ? `De procesreis start in HubSpot: ${triggerSentence}.`
        : startSource === "typeform"
          ? `De procesreis start wanneer Typeform formulier "${workflowName}" wordt ingevuld.`
        : startSource === "zapier"
          ? `De procesreis start wanneer Zapier automation "${workflowName}" wordt geactiveerd.`
          : `De procesreis start zodra ${sourceLabel} "${workflowName}" wordt geactiveerd.`,
    triggerValues: triggerValues?.values ?? [],
    hubspotStep: buildStartAutomationNarrative(startSource, workflowName, endpoint),
    backendStep: buildBackendNarrative(journeyKind, workerName, endpoint, startSource),
    hubspotUpdate: startSource === "zapier"
      ? stateWrite
        ? `Na de verwerking is de bewezen systeemuitkomst dat ${stateWrite}.`
        : "Na de verwerking wordt een HubSpot-terugschrijving alleen getoond wanneer die uit de code blijkt."
      : startSource === "typeform"
        ? stateWrite
          ? `Na de verwerking is de bewezen systeemuitkomst dat ${stateWrite}.`
          : "Na de verwerking wordt een HubSpot-terugschrijving alleen getoond wanneer die uit de code blijkt."
      : stateWrite
        ? `Na de verwerking wordt HubSpot bijgewerkt. In deze reconstructie zien we vooral dat ${stateWrite}, waardoor de deal of het dossier een nieuwe status of eigenschap kan krijgen.`
        : "Na de verwerking kan HubSpot worden bijgewerkt, bijvoorbeeld met de volgende status, relevante periode of vervolgstap.",
    downstream: startSource === "zapier" || startSource === "typeform"
      ? "De procesreis stopt bij deze bewezen backenduitkomst. Een volgende procesreis wordt pas gekoppeld wanneer een exacte property, waarde, dealstage of workflowtrigger is aangetoond."
      : "Zodra HubSpot met die nieuwe gegevens is bijgewerkt, stopt deze procesreis bij die bewezen HubSpot-uitkomst. Een volgende procesreis wordt pas gekoppeld wanneer duidelijk is welke HubSpot-waarde een andere workflow start.",
    chainSummary: buildChainSummaryNarrative(journeyKind, startSource),
  };
}

export function cleanProcessJourneyTitle(value: string): string {
  return value.replace(/\s+\((GET|POST|PUT|PATCH|DELETE)\s+\/.*\)$/i, "").trim();
}

export function isGenericProcessJourneyTitle(value: string | undefined | null): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return [
    "",
    "procesreis bijwerken",
    "procesfase bepalen",
    "procesreis kandidaat",
    "dossier bijwerken",
  ].includes(normalized);
}

export function buildProcessJourneyTitleFromAutomations(
  automations: Automatisering[],
  fallback = "Procesreis",
): string {
  const first = automations.find((automation) => automation.source === "hubspot") ?? automations[0];
  const gitlab = automations.find((automation) => automation.source === "gitlab" || Boolean(automation.gitlabFilePath));
  const firstName = cleanNarrativeName(cleanProcessJourneyTitle(first?.naam ?? ""));
  const gitlabName = cleanNarrativeName(cleanProcessJourneyTitle(gitlab?.naam ?? ""));
  const endpoint = gitlab?.gitlabEndpoint?.endpoint ?? gitlab?.endpoints?.[0] ?? "";
  const text = `${firstName} ${gitlabName} ${endpoint}`.toLowerCase();

  if (text.includes("btw") && (text.includes("2 maanden") || text.includes("prev2m"))) {
    return "BTW vervolgkwartaal bijwerken";
  }
  if (text.includes("vpb") && text.includes("va")) return "VA VPB deal bijwerken";
  if (text.includes("wefact") || text.includes("debtor") || text.includes("debiteur")) {
    return "WeFact debiteur bijwerken";
  }
  if (text.includes("kvk")) return "KvK gegevens ophalen";
  if (text.includes("betaalt niet")) return "Betaalt niet status resetten";
  if (text.includes("name change") || text.includes("dealname") || text.includes("contact change")) {
    return "Contactnaam bijwerken";
  }
  if (text.includes("update ib kan gemaakt") || text.includes("kan_gemaakt_worden")) {
    return "IB kan gemaakt worden bijwerken";
  }
  if (text.includes("jr") && (text.includes("prio") || text.includes("priority"))) {
    return "Jaarrekening prioriteit bijwerken";
  }
  if (text.includes("machtiging")) return "Machtiging verwerken";
  if (text.includes("bankkoppeling") || text.includes("bank connection")) return "Bankkoppeling status bijwerken";
  if (text.includes("stage") || text.includes("fase")) return "Procesfase controleren";

  if (firstName && gitlabName && firstName.toLowerCase() !== gitlabName.toLowerCase()) {
    return `${firstName} naar ${gitlabName}`;
  }

  return firstName || gitlabName || fallback;
}

export function inferStateWriteFromAutomation(automation: Automatisering): string | undefined {
  const writeCall = (automation.gitlabEndpoint?.calls ?? []).find((call) =>
    /update|write|patch/i.test(call.to) && call.kind === "hubspot_repository_call",
  );
  if (writeCall) return prettifyIdentifier(writeCall.to.split("::").at(-1) ?? writeCall.to);

  return automation.stappen.find((step) => /update|bijwerk|schrijf|stel/i.test(step));
}

export function prettifyIdentifier(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bBtw\b/g, "BTW")
    .replace(/\bJr\b/g, "JR")
    .replace(/\bIb\b/g, "IB")
    .replace(/\bVpb\b/g, "VPB");
}

function resolveHubSpotValuesInSentence(
  sentence: string,
  context: ProcessJourneyCopyContext,
): string {
  const valueMatch = sentence.match(/(?:Start\s+(?:zodra|wanneer|als)\s+)?(?:HubSpot-eigenschap '([^']+)'|(?:de\s+)?([A-Za-z][\w\s-]*?)) een van deze waarden is '([^']+)'/i);
  if (!valueMatch) return sentence;

  const property = normalizeHubSpotProperty(valueMatch[1] ?? valueMatch[2] ?? "");
  const rawValues = valueMatch[3].split(",").map((value) => value.trim()).filter(Boolean);
  const resolvedValues = rawValues.map((value) => resolveHubSpotValue(property, value, context));
  if (resolvedValues.every((value, index) => value === rawValues[index])) return sentence;

  return sentence.replace(
    valueMatch[0],
    `HubSpot-eigenschap '${property}' een van deze waarden is ${resolvedValues.map((value) => `'${value}'`).join(", ")}`,
  );
}

function inferDomains(automations: Automatisering[]): string[] {
  const text = automations
    .map((automation) => `${automation.naam} ${automation.doel} ${automation.trigger} ${automation.fasen.join(" ")}`)
    .join(" ")
    .toUpperCase();
  return ["BTW", "JR", "IB", "VPB", "VA", "Sales"].filter((domain) => text.includes(domain.toUpperCase()));
}

function inferJourneyKind(automations: Automatisering[]): "btw_2m" | "btw" | "jr" | "machtiging" | "bank" | "generic" {
  const text = automations
    .map((automation) => `${automation.naam} ${automation.doel} ${automation.trigger} ${automation.stappen.join(" ")}`)
    .join(" ")
    .toLowerCase();

  if (text.includes("btw") && (text.includes("2 maanden") || text.includes("2m") || text.includes("prev2m"))) return "btw_2m";
  if (text.includes("btw")) return "btw";
  if (text.includes("jaarrekening") || /\bjr\b/.test(text)) return "jr";
  if (text.includes("machtiging")) return "machtiging";
  if (text.includes("bankkoppeling") || text.includes("bank connection")) return "bank";
  return "generic";
}

function buildOpeningNarrative(kind: ReturnType<typeof inferJourneyKind>, domains: string[]): string {
  if (kind === "btw_2m") {
    return "Deze procesreis gaat over klantdossiers waarbij de btw-administratie voor twee maanden is geboekt. Het dossier zit dan in een fase waarin de administratie al grotendeels is verwerkt, maar waarin nog een vervolgstap nodig kan zijn. Denk aan aanvullende informatie opvragen, een controle uitvoeren of het dossier voorbereiden op de volgende btw-periode.";
  }
  if (kind === "btw") {
    return "Deze procesreis gaat over een stap in het btw-proces. HubSpot registreert de status van het klantdossier, waarna een workflow of backendstap bepaalt welke vervolgstap nodig is voor de btw-administratie.";
  }
  if (kind === "jr") {
    return "Deze procesreis gaat over een stap in het jaarrekeningproces. HubSpot registreert waar het dossier staat, waarna het systeem kan bepalen of prioriteit, status of vervolgstappen moeten worden bijgewerkt.";
  }
  if (kind === "machtiging") {
    return "Deze procesreis gaat over het verwerken van een machtiging. Zodra HubSpot ziet dat de machtigingsstatus verandert, kan het systeem vervolgacties starten om gekoppelde klant- of dossiergegevens bij te werken.";
  }
  if (kind === "bank") {
    return "Deze procesreis gaat over de bankkoppeling van een klant. Een wijziging in die status kan bepalen welke administratieve vervolgstap nodig is en of het dossier in HubSpot moet worden bijgewerkt.";
  }

  return "";
}

function buildStartAutomationNarrative(source: string | null, workflowName: string, endpoint?: string): string {
  if (source === "zapier") {
    return endpoint
      ? "Wanneer dit gebeurt, geeft Zapier de klant- of leadcontext door aan de backend. De technische webhook-koppeling staat bij Logica en bewijs."
      : "Wanneer dit gebeurt, routeert Zapier de automation naar de volgende verwerkingsstap.";
  }

  if (source === "typeform") {
    return endpoint
      ? "Wanneer dit gebeurt, geeft Typeform de formulierinzending door aan de volgende verwerking. De technische webhook-koppeling staat bij Logica en bewijs."
      : "Wanneer dit gebeurt, registreert Typeform de formulierinzending als eerste bekende processtap.";
  }

  return endpoint
    ? `Wanneer dit gebeurt, activeert HubSpot automatisch de workflow "${workflowName}". Deze workflow geeft het dossier door voor verdere verwerking.`
    : `Wanneer dit gebeurt, activeert HubSpot automatisch de workflow "${workflowName}". Deze workflow routeert het werk naar de volgende stap in het proces.`;
}

function buildBackendNarrative(
  kind: ReturnType<typeof inferJourneyKind>,
  workerName: string,
  endpoint?: string,
  startSource?: string | null,
): string {
  if (kind === "btw_2m") {
    return "Daarna controleert het systeem welke btw-periode of welk volgend kwartaal bij het dossier hoort. HubSpot registreert de status van het dossier; de automatische verwerking bepaalt welke vervolgstap administratief nodig is.";
  }

  if (kind === "jr") {
    return "Daarna controleert het systeem welke jaarrekeninggegevens bij deze klant of dit dossier horen. Op basis daarvan wordt bepaald of de prioriteit, status of vervolgstap moet worden aangepast.";
  }

  if (kind === "machtiging") {
    return "Daarna controleert het systeem welke klant- of dossiergegevens bij deze machtiging horen. Op basis daarvan wordt bepaald welke gegevens in HubSpot moeten worden bijgewerkt.";
  }

  if (kind === "bank") {
    return "Daarna controleert het systeem wat de wijziging in de bankkoppeling betekent voor het dossier. Op basis daarvan wordt bepaald welke status of vervolgstap in HubSpot moet worden bijgewerkt.";
  }

  if (startSource === "zapier" || startSource === "typeform") {
    const sourceLabel = startSource === "typeform" ? "Typeform" : "Zapier";
    return `Daarna verwerkt de backend de gegevens uit ${sourceLabel} en de gekoppelde klant- of dossiercontext. Op basis daarvan wordt bepaald welke informatie in HubSpot of het gekoppelde systeem moet worden bijgewerkt.`;
  }

  return "Daarna verwerkt het systeem de relevante klant- of dossiergegevens. Op basis daarvan wordt bepaald welke status, eigenschap of vervolgstap in HubSpot moet worden bijgewerkt.";
}

function buildChainSummaryNarrative(kind: ReturnType<typeof inferJourneyKind>, startSource?: string | null): string {
  if (kind === "btw_2m") {
    return "Zo ontstaat er een automatische procesketen: een wijziging in de dealstatus in HubSpot zet de workflow aan, de workflow geeft een signaal aan de backend, de backend verwerkt de juiste logica en HubSpot wordt daarna weer bijgewerkt voor de volgende stap in het btw-proces.";
  }

  if (startSource === "zapier" || startSource === "typeform") {
    const sourceLabel = startSource === "typeform" ? "Typeform" : "Zapier";
    return `Zo ontstaat er een automatische procesketen: ${sourceLabel} activeert de backendverwerking, de backend verwerkt de aangeleverde gegevens en alleen bewezen vervolgtriggers worden daarna aan een volgende procesreis gekoppeld.`;
  }

  return "Zo ontstaat er een automatische procesketen: een wijziging in HubSpot start een workflow, het systeem verwerkt de juiste gegevens en HubSpot wordt daarna bijgewerkt voor de volgende stap.";
}

function propertyLabel(property: string): string {
  if (property === "dealstage") return "dealfase";
  if (property === "pipeline") return "pipeline";
  return `HubSpot-eigenschap '${property}'`;
}

function normalizeHubSpotProperty(property: string): string {
  const normalized = property.trim().toLowerCase().replace(/[\s-]+/g, "");
  if (normalized === "dealstage" || normalized === "dealfase") return "dealstage";
  if (normalized === "pipeline") return "pipeline";
  return property.trim();
}

function cleanNarrativeName(value: string): string {
  return value.replace(/['"]/g, "").replace(/\s+/g, " ").trim();
}

function processStartSourceLabel(source: string | null): string {
  if (source === "zapier") return "Zapier automation";
  if (source === "typeform") return "Typeform formulier";
  if (source === "hubspot") return "HubSpot workflow";
  return "automation";
}

function formatStateWriteForNarrative(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value.toLowerCase();
  if (text.includes("update deal properties")) return "dealgegevens in HubSpot worden bijgewerkt";
  if (text.includes("update company properties")) return "bedrijfsgegevens in HubSpot worden bijgewerkt";
  if (text.includes("update contact properties")) return "contactgegevens in HubSpot worden bijgewerkt";
  return `${value} wordt uitgevoerd`;
}

function findTriggerSentence(automation: Automatisering): string | undefined {
  return (automation.beschrijvingInSimpeleTaal ?? []).find((line) =>
    /start zodra|start wanneer|start als|trigger/i.test(line),
  );
}

function resolveHubSpotValue(
  property: string,
  value: string,
  context: ProcessJourneyCopyContext,
): string {
  const pipelines = context.pipelines ?? [];

  if (property === "dealstage") {
    const stage = buildStageValueResolver(pipelines).get(value);
    return stage ? `${cleanDisplayLabel(stage.label)} (${cleanDisplayLabel(stage.pipeline)}, id ${value})` : value;
  }

  if (property === "pipeline") {
    const pipeline = pipelines.find((item) => item.pipelineId === value);
    return pipeline ? `${cleanDisplayLabel(pipeline.naam)} (id ${value})` : value;
  }

  return value;
}

function cleanDisplayLabel(value: string): string {
  return value
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
