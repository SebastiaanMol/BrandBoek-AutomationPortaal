import type { Automatisering, GitLabCallInfo } from "./types";

export type AutomationFunnelStepKind = "start" | "read" | "compute" | "write" | "downstream";

export interface AutomationFunnelStep {
  kind: AutomationFunnelStepKind;
  title: string;
  summary: string;
  details: string[];
}

export interface AutomationFunnel {
  isGitLab: boolean;
  isEndpointAutomation: boolean;
  file?: string;
  method?: string;
  endpoint?: string;
  handler?: string;
  calls: GitLabCallInfo[];
  hubspotReads: string[];
  hubspotWrites: string[];
  steps: AutomationFunnelStep[];
  technicalDetails: Array<{ label: string; value: string }>;
  technicalCalls: string[];
  narrative: string;
  runtimeRole: string;
  riskSummary: string;
}

export function parseGitLabExternalEndpoint(externalId?: string): { method?: string; endpoint?: string } {
  const route = externalId?.split("::").at(1);
  const match = route?.match(/^([A-Z]+)\s+(.+)$/);
  return {
    method: match?.[1],
    endpoint: match?.[2],
  };
}

export function isGitLabEndpointAutomation(automation: Pick<Automatisering, "externalId">): boolean {
  return Boolean(automation.externalId?.includes("::"));
}

export function buildAutomationFunnel(automation: Automatisering): AutomationFunnel | null {
  const isGitLab = automation.source === "gitlab" || Boolean(automation.gitlabFilePath);
  if (!isGitLab) return null;

  const parsed = parseGitLabExternalEndpoint(automation.externalId);
  const method = automation.gitlabEndpoint?.method ?? parsed.method;
  const endpoint = automation.gitlabEndpoint?.endpoint ?? parsed.endpoint;
  const file = automation.gitlabEndpoint?.api_file ?? automation.gitlabFilePath ?? automation.externalId;
  const handler = automation.gitlabEndpoint?.handler;
  const calls = automation.gitlabEndpoint?.calls ?? [];
  const hubspotReads = inferHubSpotState(calls, "read");
  const inferredHubSpotWrites = inferHubSpotState(calls, "write");
  const hubspotWrites = inferredHubSpotWrites.length > 0
    ? inferredHubSpotWrites
    : inferKnownHubSpotWrites(automation, endpoint, handler);
  const isEndpoint = isGitLabEndpointAutomation(automation);
  const runtimeRole = inferRuntimeRole(automation, hubspotReads, hubspotWrites);
  const riskSummary = inferRuntimeRisk(automation, hubspotWrites);
  const inputSignals = inferInputSignals(automation);
  const computationDetails = summarizeLogicDetails(automation, inputSignals, hubspotReads, hubspotWrites);
  const technicalDetails = [
    { label: "Bestand", value: file },
    { label: "Endpoint", value: [method, endpoint].filter(Boolean).join(" ") },
    { label: "Handler", value: handler },
    { label: "Bron-id", value: automation.externalId },
  ].filter((detail): detail is { label: string; value: string } => Boolean(detail.value));

  const steps: AutomationFunnelStep[] = [
    {
      kind: "start",
      title: "Start",
      summary: inferStartSummary(automation, method, endpoint),
      details: inputSignals.length > 0
        ? inputSignals.slice(0, 3)
        : ["Een HubSpot workflow of externe gebeurtenis start deze backend automation."],
    },
    {
      kind: "read",
      title: "Leest",
      summary: hubspotReads.length > 0
        ? "Leest de HubSpot-status die nodig is om de juiste processtap te bepalen."
        : "Gebruikt vooral de gegevens die met de request binnenkomen.",
      details: hubspotReads.length > 0 ? hubspotReads : inferRequestInputs(automation),
    },
    {
      kind: "compute",
      title: "Bepaalt",
      summary: inferComputeSummary(automation, runtimeRole, computationDetails),
      details: computationDetails,
    },
    {
      kind: "write",
      title: "Schrijft",
      summary: hubspotWrites.length > 0
        ? summarizeHubSpotWrite(hubspotWrites)
        : "Er is geen duidelijke HubSpot-write gevonden in de analyse.",
      details: hubspotWrites.length > 0 ? hubspotWrites : ["Geen property- of stage-update herkend."],
    },
    {
      kind: "downstream",
      title: "Vervolg",
      summary: hubspotWrites.length > 0
        ? "HubSpot workflows kunnen reageren op deze nieuwe HubSpot-uitkomst."
        : "Het vervolg-effect is minder zeker, omdat er geen duidelijke HubSpot-write is herkend.",
      details: buildDownstreamDetails(automation, riskSummary),
    },
  ];

  return {
    isGitLab,
    isEndpointAutomation: isEndpoint,
    file,
    method,
    endpoint,
    handler,
    calls,
    hubspotReads,
    hubspotWrites,
    steps,
    technicalDetails,
    technicalCalls: calls.map(formatTechnicalCall).filter(unique),
    runtimeRole,
    riskSummary,
    narrative: buildNarrative(automation, runtimeRole, inputSignals, hubspotReads, hubspotWrites),
  };
}

function inferKnownHubSpotWrites(
  automation: Automatisering,
  endpoint?: string,
  handler?: string,
): string[] {
  const haystack = [
    automation.id,
    automation.naam,
    automation.externalId,
    automation.gitlabFilePath,
    endpoint,
    handler,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("create_new_deal") || haystack.includes("new create deal")) {
    return ["Maakt of koppelt dealrecords aan in HubSpot."];
  }

  return [];
}

function summarizeHubSpotWrite(writes: string[]): string {
  const firstWrite = writes[0]?.toLowerCase() ?? "";
  if (firstWrite.includes("maakt") || firstWrite.includes("koppelt")) {
    return "Maakt of koppelt records in HubSpot op basis van de verwerking.";
  }
  if (firstWrite.includes("fase")) {
    return "Werkt de juiste HubSpot-fase bij op basis van de verwerking.";
  }
  if (firstWrite.includes("eigenaar") || firstWrite.includes("verantwoordelijke")) {
    return "Werkt de verantwoordelijke in HubSpot bij op basis van de verwerking.";
  }
  return "Zet de uitkomst van de verwerking terug in HubSpot.";
}

function describeNarrativeWrite(writes: string[]): string {
  const firstWrite = writes[0]?.toLowerCase() ?? "";
  if (firstWrite.includes("maakt") || firstWrite.includes("koppelt")) {
    return "Daarna maakt of koppelt het systeem de benodigde records in HubSpot, zodat het vervolgproces op de juiste gegevens kan doorlopen.";
  }
  if (firstWrite.includes("fase")) {
    return "Daarna werkt het systeem de juiste HubSpot-fase bij, zodat vervolgprocessen op die nieuwe fase kunnen reageren.";
  }
  if (firstWrite.includes("eigenaar") || firstWrite.includes("verantwoordelijke")) {
    return "Daarna werkt het systeem de verantwoordelijke in HubSpot bij, zodat de juiste persoon de volgende stap kan oppakken.";
  }
  return "Daarna zet het systeem de uitkomst terug in HubSpot, zodat vervolgprocessen op de bijgewerkte gegevens kunnen reageren.";
}

function inferHubSpotState(calls: GitLabCallInfo[], mode: "read" | "write"): string[] {
  return calls
    .filter((call) =>
      call.to.includes("repository.hubspot") ||
      call.to.includes("hubspot_client") ||
      call.to.includes("hubspot_calls")
    )
    .filter((call) => {
      const name = call.to.toLowerCase();
      const isWrite = /(^|[.:_])(update|create|archive|delete|add|set|patch|upsert)([.:_]|$)/.test(name);
      return mode === "write" ? isWrite : !isWrite;
    })
    .map((call) => describeHubSpotStateInteraction(call.to, mode))
    .filter(unique);
}

function describeHubSpotStateInteraction(target: string, mode: "read" | "write"): string {
  const name = target.split("::").at(-1)?.toLowerCase() ?? target.toLowerCase();
  const object = inferHubSpotObject(name);

  if (mode === "read") {
    if (name.includes("owner")) return "Leest eigenaar of verantwoordelijke uit HubSpot.";
    if (name.includes("association")) return "Leest gekoppelde HubSpot records.";
    return `Leest ${object}gegevens uit HubSpot.`;
  }

  if (name.includes("stage")) return `Wijzigt ${object}fase in HubSpot.`;
  if (name.includes("owner")) return "Wijzigt eigenaar of verantwoordelijke in HubSpot.";
  if (name.includes("property") || name.includes("properties")) return `Wijzigt ${object}gegevens in HubSpot.`;
  if (name.includes("create") || name.includes("add")) return `Maakt of koppelt ${object}records aan in HubSpot.`;
  return `Schrijft nieuwe ${object}status terug naar HubSpot.`;
}

function inferHubSpotObject(name: string): string {
  if (name.includes("deal")) return "deal";
  if (name.includes("company")) return "company";
  if (name.includes("contact")) return "contact";
  if (name.includes("ticket")) return "ticket";
  if (name.includes("pipeline")) return "pipeline";
  return "HubSpot";
}

function inferRuntimeRole(automation: Automatisering, reads: string[], writes: string[]): string {
  const all = `${automation.naam} ${automation.doel} ${automation.trigger}`.toLowerCase();
  if (all.includes("sync") || all.includes("synchron")) return "Synchroniseert processtatus tussen HubSpot en een extern systeem.";
  if (all.includes("owner") || all.includes("toewijz") || all.includes("assignment")) return "Bepaalt of verspreidt verantwoordelijken binnen het proces.";
  if (all.includes("stage") || all.includes("fase")) return "Routeert een record naar de juiste procesfase.";
  if (all.includes("lead")) return "Verwerkt een binnengekomen lead naar bruikbare HubSpot-status.";
  if (writes.length > 0 && reads.length > 0) return "Zet gelezen HubSpot-status om naar nieuwe afgeleide HubSpot-status.";
  if (writes.length > 0) return "Schrijft een procesbeslissing terug naar HubSpot.";
  return "Voert een backend-beslissing uit voor de lopende HubSpot flow.";
}

function inferInputSignals(automation: Automatisering): string[] {
  return [
    automation.trigger,
    ...automation.stappen.filter((step) => /ontvang|request|lead|webhook|endpoint|formulier/i.test(step)),
  ]
    .map(toBusinessLanguage)
    .filter(isUsefulBusinessText)
    .filter(unique);
}

function inferRequestInputs(automation: Automatisering): string[] {
  const all = `${automation.naam} ${automation.doel} ${automation.trigger} ${automation.stappen.join(" ")}`.toLowerCase();
  if (all.includes("trustoo")) return ["Gebruikt leadgegevens uit Trustoo, zoals contactgegevens en aanvraaginformatie als die in de request zitten."];
  if (all.includes("offerte")) return ["Gebruikt leadgegevens uit Offerte.nl, zoals contactgegevens en aanvraaginformatie als die in de request zitten."];
  if (all.includes("calendly")) return ["Gebruikt afspraak- of formuliergegevens uit Calendly als die in de request zitten."];
  if (all.includes("lead")) return ["Gebruikt binnengekomen leadgegevens. De exacte velden zijn nog niet herkend."];
  return ["Gebruikt gegevens uit de binnenkomende request. De exacte velden zijn nog niet herkend."];
}

function summarizeLogicDetails(
  automation: Automatisering,
  inputSignals: string[],
  reads: string[],
  writes: string[],
): string[] {
  const simpleDescription = (automation.beschrijvingInSimpeleTaal ?? [])
    .map(toBusinessLanguage)
    .filter(isUsefulBusinessText)
    .filter(unique);

  if (simpleDescription.length > 0) return simpleDescription.slice(0, 3);

  const explicitSteps = automation.stappen
    .map(toBusinessLanguage)
    .filter(isUsefulBusinessText)
    .filter((step) => !inputSignals.includes(step))
    .filter(unique)
    .slice(0, 3);

  if (explicitSteps.length > 0) return explicitSteps;

  const doel = toBusinessLanguage(automation.doel);
  if (isUsefulBusinessText(doel)) return [doel];

  if (reads.length > 0 && writes.length > 0) {
    return ["Zet gelezen HubSpot-status om naar een nieuwe procesuitkomst."];
  }
  if (writes.length > 0) {
    return ["Bepaalt welke HubSpot-status bijgewerkt moet worden."];
  }

  return ["Voert de proceslogica uit die bij deze backend automation hoort."];
}

function inferStartSummary(automation: Automatisering, method?: string, endpoint?: string): string {
  const lower = `${automation.naam} ${automation.trigger} ${endpoint}`.toLowerCase();
  if (lower.includes("trustoo")) return "Een Trustoo-lead of aanvraag start deze automation.";
  if (lower.includes("offerte")) return "Een Offerte.nl-lead of aanvraag start deze automation.";
  if (lower.includes("calendly")) return "Een Calendly-afspraak of formulieractie start deze automation.";
  if (lower.includes("webhook")) return "Een webhook vanuit HubSpot of een extern systeem start deze automation.";
  if (endpoint) return "Een HubSpot workflow start deze backend automation.";
  return "Een HubSpot workflow of externe gebeurtenis start deze backend automation.";
}

function inferComputeSummary(
  automation: Automatisering,
  runtimeRole: string,
  details: string[],
): string {
  const lower = `${automation.naam} ${automation.doel}`.toLowerCase();
  if (lower.includes("lead")) return "Bepaalt hoe de binnengekomen lead in HubSpot verwerkt moet worden.";
  if (lower.includes("owner") || lower.includes("toewijz")) return "Bepaalt wie verantwoordelijk wordt voor de volgende processtap.";
  if (lower.includes("stage") || lower.includes("fase")) return "Bepaalt naar welke HubSpot-fase het record moet.";
  if (details.length > 0) return details[0];
  return runtimeRole;
}

function buildDownstreamDetails(automation: Automatisering, riskSummary: string): string[] {
  const systems = automation.systemen.filter((system) => system !== "GitLab");
  return [
    systems.length > 0 ? `Raakt mogelijk: ${systems.join(", ")}.` : "Raakt vooral HubSpot.",
    riskSummary,
  ];
}

function toBusinessLanguage(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";

  const asyncMatch = normalized.match(/asynchrone vervolgstap uit:\s*(.+)$/i);
  if (asyncMatch?.[1]) return translateFunctionPurpose(asyncMatch[1]);

  const followUpMatch = normalized.match(/vervolgstap uit:\s*(.+)$/i);
  if (followUpMatch?.[1]) return translateFunctionPurpose(followUpMatch[1]);

  const hubspotMatch = normalized.match(/gegevens in hubspot:\s*(.+)$/i);
  if (hubspotMatch?.[1]) return translateHubSpotAction(hubspotMatch[1]);

  if (looksLikeImplementationDetail(normalized)) return "";
  return normalized;
}

function translateFunctionPurpose(value: string): string {
  const name = humanizeIdentifier(value).toLowerCase();
  if (name.includes("next quarter") && name.includes("prev2m")) {
    return "Bepaalt welke volgende BTW-periode moet worden bijgewerkt.";
  }
  if (name.includes("add lead") && name.includes("hubspot")) {
    return "Verwerkt de binnengekomen lead en zet die als contact of deal klaar in HubSpot.";
  }
  if (name.includes("update") && name.includes("deal")) return "Werkt de bijbehorende deal in HubSpot bij.";
  if (name.includes("owner")) return "Bepaalt of wijzigt de verantwoordelijke eigenaar in HubSpot.";
  if (name.includes("stage")) return "Bepaalt of wijzigt de juiste HubSpot-fase.";
  if (name.includes("sync")) return "Synchroniseert de processtatus tussen HubSpot en een ander systeem.";
  return `Voert de processtap "${humanizeIdentifier(value)}" uit.`;
}

function translateHubSpotAction(value: string): string {
  const name = humanizeIdentifier(value).toLowerCase();
  if (name.includes("dossier") && name.includes("association")) return "Leest welk dossier bij dit HubSpot-record hoort.";
  if (name.includes("update") && name.includes("dossier")) return "Werkt het gekoppelde dossier in HubSpot bij.";
  if (name.includes("deal")) return "Leest of wijzigt dealgegevens in HubSpot.";
  if (name.includes("contact")) return "Leest of wijzigt contactgegevens in HubSpot.";
  if (name.includes("company")) return "Leest of wijzigt bedrijfsgegevens in HubSpot.";
  return `Leest of wijzigt HubSpot-status voor ${humanizeIdentifier(value)}.`;
}

function isUsefulBusinessText(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (looksLikeImplementationDetail(normalized)) return false;
  if (/^ontvangt de request\.?$/i.test(normalized)) return false;
  return true;
}

function looksLikeImplementationDetail(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    /\b(GET|POST|PUT|PATCH|DELETE)\s+\//i.test(normalized) ||
    normalized.includes("client.crm") ||
    normalized.includes("hubspotapierror") ||
    normalized.includes("basic_api") ||
    normalized.includes("repository") ||
    normalized.includes("api call") ||
    normalized.includes("get_page") ||
    normalized.includes("::") ||
    normalized.includes("app.") ||
    normalized.includes("python") ||
    normalized.includes("sdk")
  );
}

function formatTechnicalCall(call: GitLabCallInfo): string {
  const target = call.to.split("::").at(-1) ?? call.to;
  const kind = call.kind.replace(/_/g, " ");
  return `${kind}: ${target}`;
}

function buildNarrative(
  automation: Automatisering,
  runtimeRole: string,
  inputSignals: string[],
  reads: string[],
  writes: string[],
): string {
  const purpose =
    (automation.beschrijvingInSimpeleTaal ?? [])
      .map(toBusinessLanguage)
      .find(isUsefulBusinessText) || automation.doel;
  const businessPurpose = isUsefulBusinessText(purpose) ? purpose : runtimeRole;
  const fallbackStart = automation.externalId?.includes("::")
    ? "Deze backend automation wordt gestart vanuit HubSpot."
    : "Deze automation wordt gestart vanuit HubSpot of een externe gebeurtenis.";
  const inputPart = inputSignals.length > 0 && inputSignals[0] !== businessPurpose
    ? inputSignals[0]
    : fallbackStart;
  const readPart = reads.length > 0
    ? "Daarbij leest hij relevante HubSpot-status."
    : "Daarbij gebruikt hij vooral de binnenkomende request als input.";
  const writePart = writes.length > 0
    ? describeNarrativeWrite(writes)
    : "Er is geen duidelijke HubSpot-write gevonden, dus het vervolg-effect is minder zeker.";
  return `${inputPart} ${businessPurpose} ${readPart} ${writePart}`;
}

function inferRuntimeRisk(automation: Automatisering, writes: string[]): string {
  if (writes.length > 0 && automation.systemen.length > 2) {
    return "Middel tot hoog: een HubSpot-update kan meerdere downstream systemen of workflows raken.";
  }
  if (writes.length > 0) {
    return "Middel: wijzigingen in HubSpot-status kunnen vervolgprocessen starten.";
  }
  return "Laag tot middel: vooral afhankelijk van welke workflow deze worker aanroept.";
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(value: string, index: number, all: string[]): boolean {
  return all.indexOf(value) === index;
}
