import type { Automatisering, GitLabCallInfo } from "./types";
import { parseGitLabExternalEndpoint } from "./automationFunnel";
import {
  RUNTIME_ENDPOINT_ANALYSIS,
  RUNTIME_FUNCTION_ANALYSIS,
  RUNTIME_WORKER_PROFILES,
  type RuntimeEndpointAnalysis,
  type RuntimeFunctionAnalysis,
  type RuntimeWorkerProfile,
} from "./generatedRuntimeAnalysis";
import {
  PYTHON_CODEPATH_ANALYSIS,
  type PythonFunctionCodePath,
  type PythonCodeCall,
} from "./generatedPythonCodePathAnalysis";

export interface BackendTraceStep {
  title: string;
  description: string;
  code?: string;
  technical?: BackendTraceEvidence[];
}

export interface BackendTraceEvidence {
  title: string;
  description: string;
  code?: string;
}

export interface BackendAutomationTrace {
  id: string;
  title: string;
  summary: string;
  plainSteps: BackendTraceStep[];
  technicalSteps: BackendTraceStep[];
  decisions: string[];
  evidence: Array<{ label: string; value: string }>;
}

interface BackendCallGroup {
  from: string;
  title: string;
  calls: GitLabCallInfo[];
  reads: GitLabCallInfo[];
  writes: GitLabCallInfo[];
  internal: GitLabCallInfo[];
}

export function getBackendAutomationTrace(automation: Automatisering): BackendAutomationTrace | null {
  const endpoint = automation.gitlabEndpoint?.endpoint ?? parseGitLabExternalEndpoint(automation.externalId).endpoint;
  const method = automation.gitlabEndpoint?.method ?? parseGitLabExternalEndpoint(automation.externalId).method;
  const handler = automation.gitlabEndpoint?.handler;
  const haystack = [
    automation.id,
    automation.naam,
    automation.externalId,
    endpoint,
    handler,
    automation.gitlabFilePath,
    automation.gitlabEndpoint?.api_file,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("create_new_deal") || haystack.includes("new create deal")) return createNewDealTrace(automation);
  if (!isGitLabEndpoint(automation, method, endpoint)) return null;
  return createGenericBackendTrace(automation);
}

function createGenericBackendTrace(automation: Automatisering): BackendAutomationTrace {
  const parsed = parseGitLabExternalEndpoint(automation.externalId);
  const endpoint = automation.gitlabEndpoint?.endpoint ?? parsed.endpoint;
  const method = automation.gitlabEndpoint?.method ?? parsed.method;
  const apiFile = automation.gitlabEndpoint?.api_file ?? automation.gitlabFilePath ?? "Onbekend GitLab-bestand";
  const handler = automation.gitlabEndpoint?.handler ?? inferHandlerName(automation);
  const calls = automation.gitlabEndpoint?.calls ?? [];
  const hubspotReads = calls.filter(isHubSpotRead);
  const hubspotWrites = calls.filter(isHubSpotWrite);
  const internalCalls = calls.filter((call) => !isHubSpotCall(call));
  const handlerInternalCalls = calls.filter((call) => isFromHandler(call, handler) && !isHubSpotCall(call));
  const callGroups = buildCallGroups(calls, handler);
  const endpointAnalysis = findEndpointAnalysis(apiFile, endpoint, handler);
  const trustedEndpointAnalysis = isTrustedEndpointAnalysis(endpointAnalysis) ? endpointAnalysis : undefined;
  const functionAnalyses = findFunctionAnalyses(calls);
  const workerProfile = findWorkerProfile(automation, trustedEndpointAnalysis, functionAnalyses);
  const codePaths = findPythonCodePaths(calls, handler, apiFile);
  const operationLabel = cleanOperationLabel(automation.naam, endpoint, handler);

  const plainSteps: BackendTraceStep[] = [
    step("De backend automation wordt gestart", `Een HubSpot workflow of externe webhook roept dit endpoint aan om "${operationLabel}" uit te voeren. De backend neemt vanaf dit punt de verwerking over van HubSpot.`, [
      evidence("Endpoint", "Dit is de route waarop de backend wordt aangeroepen.", [method, endpoint].filter(Boolean).join(" ") || automation.externalId),
    ]),
    step("De API-handler ontvangt de request", `De API-laag vangt de request af in de handler ${handler ? `"${handler}"` : "van dit endpoint"}. Deze laag is vooral bedoeld om de request aan te nemen en de juiste backendlogica te starten.`, [
      evidence("Handler", "De GitLab sync heeft deze handler bij het endpoint gevonden.", handler),
    ].filter(hasEvidenceCode)),
  ];

  if (handlerInternalCalls.length > 0) {
    plainSteps.push(
      step("De handler geeft de verwerking door", `De handler start een of meer service- of helperfuncties. Daardoor blijft de API-laag dun en zit de inhoudelijke verwerking van "${operationLabel}" in onderliggende backendfuncties.`, handlerInternalCalls.slice(0, 8).map(callToEvidence)),
    );
  }

  const semanticSteps = buildSemanticSteps(operationLabel, trustedEndpointAnalysis, functionAnalyses, workerProfile);
  if (semanticSteps.length > 0) {
    plainSteps.push(...semanticSteps);
  } else {
    plainSteps.push(
      step(
        "De backend verwerkt deze stap",
        "De backend verwerkt deze stap en gebruikt de bekende context uit de gekoppelde systemen. De analyse toont hier nog geen betrouwbare bedrijfsspecifieke procesbetekenis.",
        [],
      ),
    );
  }

  const codePathSteps = buildCodePathSteps(operationLabel, codePaths);
  if (codePathSteps.length > 0) plainSteps.push(...codePathSteps);

  if (callGroups.length > 0) {
    plainSteps.push(...callGroups.flatMap((group) => buildStepsForCallGroup(group, operationLabel)));
  } else if (hubspotReads.length > 0 || internalCalls.length > 0 || hubspotWrites.length > 0) {
    if (hubspotReads.length > 0) {
      plainSteps.push(
        step("De backend leest actuele HubSpot-data", `De backend haalt HubSpot-gegevens op die nodig zijn om "${operationLabel}" betrouwbaar uit te voeren. Daardoor baseert het proces zich op de actuele status in HubSpot en niet alleen op de webhookpayload.`, hubspotReads.map(callToEvidence)),
      );
    }

    if (internalCalls.length > 0) {
      plainSteps.push(
        step("De backend voert de proceslogica uit", `De backend roept service- of helperfuncties aan om de juiste vervolgstap te bepalen. Dit is het deel waar de specifieke businesslogica van "${operationLabel}" zit.`, internalCalls.slice(0, 8).map(callToEvidence)),
      );
    }

    if (hubspotWrites.length > 0) {
      plainSteps.push(
        step("De backend schrijft terug naar HubSpot", "Na de verwerking past de backend HubSpot aan. Dit kan bijvoorbeeld een deal, contact, company, property, stage of associatie zijn. Zo kan HubSpot daarna vervolgworkflows starten op basis van de nieuwe status.", hubspotWrites.map(callToEvidence)),
      );
    }
  } else {
    plainSteps.push(
      step("De backend gebruikt de binnengekomen request", "Er zijn in de call graph geen expliciete HubSpot-read, HubSpot-write of servicecalls herkend. Deze automation lijkt vooral te starten vanuit de requestgegevens of via code die nog niet in de call graph zit.", buildLimitedEvidence(calls)),
    );
  }

  if (hubspotWrites.length === 0) {
    plainSteps.push(
      step("Er is geen directe HubSpot-write herkend", "In de bekende call graph is geen expliciete HubSpot-schrijfactie gevonden. Het endpoint kan alsnog effect hebben via interne helpers, externe systemen of een codepad dat nog niet als write is herkend.", buildLimitedEvidence(calls)),
    );
  }

  plainSteps.push(
    step("De endpoint-call wordt afgerond", "Als de backend zonder fout eindigt, geeft het endpoint een response terug. Eventuele vervolgprocessen hangen af van de data die tijdens deze run is bijgewerkt of aangemaakt.", [
      evidence("Response", "De API-handler rondt de request af nadat de backendlogica klaar is.", handler ? `${handler}(...)` : undefined),
    ].filter(hasEvidenceCode)),
  );

  const technicalSteps = [
    technicalStep("Endpoint", "Route waarop de automation binnenkomt.", [method, endpoint].filter(Boolean).join(" ") || automation.externalId),
    technicalStep("Handler", "Functie die de request ontvangt.", handler),
    ...calls.map((call) => technicalStep(formatCallTitle(call), describeCall(call), formatCallCode(call))),
  ].filter((step) => step.code || step.description);

  return {
    id: `generic:${automation.id}`,
    title: `Backend trace: ${operationLabel}`,
    summary: `Deze trace is automatisch opgebouwd uit de GitLab endpoint-analyse en laat zien welke backendstappen, HubSpot reads/writes en helpercalls bekend zijn voor "${operationLabel}".`,
    plainSteps,
    technicalSteps,
    decisions: buildGenericDecisions(hubspotReads, hubspotWrites, internalCalls, trustedEndpointAnalysis, workerProfile, codePaths),
    evidence: [
      { label: "API-bestand", value: apiFile },
      { label: "Endpoint", value: [method, endpoint].filter(Boolean).join(" ") || automation.externalId || "Onbekend endpoint" },
      { label: "Handler", value: handler || "Onbekende handler" },
      { label: "Trace-type", value: "Automatisch opgebouwd uit GitLab call graph en Python-codepadanalyse" },
      trustedEndpointAnalysis?.confidenceScore ? { label: "Analyse-score", value: String(trustedEndpointAnalysis.confidenceScore) } : null,
      workerProfile?.workerName ? { label: "Worker-profiel", value: workerProfile.workerName } : null,
      codePaths.length > 0 ? { label: "Codepadfuncties", value: String(codePaths.length) } : null,
    ].filter((item): item is { label: string; value: string } => Boolean(item)),
  };
}

function isTrustedEndpointAnalysis(analysis: RuntimeEndpointAnalysis | undefined): analysis is RuntimeEndpointAnalysis {
  if (!analysis) return false;
  if ((analysis.confidenceScore ?? 0) >= 0.75) return true;
  return (
    analysis.writesProperties.length > 0 ||
    analysis.traversesAssociations.length > 0 ||
    analysis.hubspotRepositoryCalls.length > 0 ||
    analysis.serviceCallChainHints.length > 0 ||
    analysis.runtimeActorRole !== "read"
  );
}

function createNewDealTrace(automation: Automatisering): BackendAutomationTrace {
  const endpoint = automation.gitlabEndpoint?.endpoint ?? parseGitLabExternalEndpoint(automation.externalId).endpoint;
  const method = automation.gitlabEndpoint?.method ?? parseGitLabExternalEndpoint(automation.externalId).method;
  const apiFile = automation.gitlabEndpoint?.api_file ?? "gitlabtest/app/API/operations.py";

  return {
    id: "create_new_deal",
    title: "Backend trace: nieuwe deal aanmaken",
    summary:
      "Deze trace volgt de backend vanaf het HubSpot-webhooksignaal tot en met het bepalen, bijwerken of batch-aanmaken van vervolgdeals.",
    plainSteps: [
      step("HubSpot start de backend", "Een HubSpot workflow ziet dat er vanuit de salesdeal vervolgdeals moeten worden voorbereid. HubSpot stuurt daarom het deal-id naar de backend, zodat de backend met de actuele HubSpot-data kan bepalen welke administratieve deals nodig zijn.", [
        evidence("FastAPI route", "HubSpot komt binnen op de route in de API-laag.", `@router.post("${endpoint ?? "/hubspot/create_new_deal"}")`),
      ]),
      step("De API ontvangt het deal-id", "De backend ontvangt alleen de verwijzing naar de oorspronkelijke deal. Dat deal-id is het startpunt waarmee de backend daarna zelf alle benodigde gegevens ophaalt, in plaats van blind te vertrouwen op losse velden uit de webhook.", [
        evidence("Request model", "De handler ontvangt een `NewDeal` body en leest `deal_id.deal_id`.", "async def new_create_deal(deal_id: NewDeal)"),
      ]),
      step("De servicefunctie start", "De API-laag doet zelf bijna geen inhoudelijke verwerking. Hij geeft het deal-id door aan de servicefunctie die verantwoordelijk is voor de volledige logica rondom producten, klanttype, pipelines, bestaande deals en nieuwe vervolgdeals.", [
        evidence("Service call", "De handler roept de service-laag aan.", "await create_new_deal(deal_id.deal_id)"),
        evidence("Start servicefunctie", "`create_new_deal` logt de start en zet `deal_date = datetime.now()`.", "async def create_new_deal(deal_id: int)"),
      ]),
      step("Basisgegevens worden opgehaald", "De backend verzamelt eerst de context van de salesdeal: welke producten zijn verkocht, welke pipelines bestaan er, welk contact en bedrijf horen bij de deal en wie is de eigenaar. Deze gegevens vormen samen de basis om te bepalen welke vervolgdeals in HubSpot moeten bestaan.", [
        evidence("Parallelle HubSpot reads", "Met `asyncio.create_task` worden line items, pipelines, contact, company en owner parallel opgehaald.", "asyncio.gather(line_items_task, cont_pipes_task, contact_task, company_task, owner_task)"),
      ]),
      step("Het gekoppelde bedrijf wordt gecontroleerd", "De vervolgdeals worden op bedrijfsniveau opgebouwd. Als de oorspronkelijke deal geen gekoppeld bedrijf heeft, kan de backend niet betrouwbaar bepalen bij welke klant de nieuwe administratie- of btw-deals horen. Daarom stopt het proces dan bewust.", [
        evidence("Company guard", "Zonder `company_id` wordt `ValueError` gegooid en stopt de endpoint-call.", "if not company_id: raise ValueError(...)"),
      ]),
      step("Het klanttype wordt bepaald", "De backend kijkt naar het pakket van het bedrijf, bijvoorbeeld Software of Pakket groot. Dat pakket bepaalt of de klant in een standaard doorlopende administratieflow valt of in een controle-/softwaregerichte flow.", [
        evidence("Company properties", "De backend haalt bedrijfsproperties op, waaronder `software_portaal_pakket`.", "hubspot_calls.get_company_info(company_id, properties=NEEDED_COMPANY_PROPS)"),
      ]),
      step("De juiste pipelines worden gekozen", "Op basis van het klanttype kiest de backend de set pipelines waarin vervolgdeals mogen worden aangemaakt. Software- en Pakket groot-klanten krijgen controle-pipelines; andere klanten worden langs de doorlopende pipelines gelegd.", [
        evidence("Pipeline selector", "`client_type` bepaalt of `get_controle_pipelines()` of `continuous_pipelines` wordt gebruikt.", 'if client_type in ["Pakket groot", "Software"]'),
      ]),
      step("Producten worden aan pipelines gekoppeld", "De backend gebruikt de verkochte producten op de oorspronkelijke deal als inhoudelijke aanleiding. Een product zoals btw, administratie, jaarrekening of volledige service wordt gekoppeld aan de pipeline waar die dienstverlening verder moet worden opgevolgd.", [
        evidence("Product matching", "Line item namen worden gematcht op pipeline labels.", "match_product_to_pipeline(product_names, pipelines_to_use)"),
      ]),
      step("Bestaande deals worden opgehaald", "Voordat de backend iets nieuws maakt, haalt hij alle relevante bestaande deals op bij hetzelfde bedrijf en contact. Zo kan hij zien of er al een deal bestaat voor dezelfde dienstverlening, periode of contactpersoon.", [
        evidence("Existing deal reads", "Alle company- en contactdeals met benodigde properties worden opgehaald.", "fetch_all_company_deals_with_props(...) / fetch_all_contact_deals_with_props(...)"),
      ]),
      step("Dubbele deals worden voorkomen", "De backend maakt een interne index van bestaande deals. Daarmee controleert hij per pipeline en periode of een vervolgdeal al bestaat. Voor sommige flows kijkt hij naar jaar, voor btw naar kwartaal en voor volledige service ook naar maand.", [
        evidence("Lookup maps", "`contact_exists_map` en `exists_map` worden opgebouwd voor duplicate checks.", "exists_map[(pipeline_id, year, quarter, maand)] = deal_id"),
      ]),
      step("Per pipeline wordt de route gekozen", "Niet elke dienstverlening werkt met dezelfde periode. Volledige service wordt per maand verwerkt, btw en administratie per kwartaal, en andere diensten zoals jaarrekening of IB meestal per jaar. De backend kiest daarom per gematchte pipeline het juiste verwerkingspad.", [
        evidence("Pipeline handler", "De hoofdlogica gaat naar `handle_pipelines(...)`.", "response = await handle_pipelines(...)"),
        evidence("Contact read", "`handle_pipelines` haalt contactproperties op en zoekt de huidige deal in `deal_properties`.", "hubspot_calls.get_contact_info(contact_id, properties=NEEDED_CONTACT_PROPS)"),
        evidence("Monthly path", "Labels met `Volledige service` gaan naar maandlogica.", "process_monthly_pipeline(...)"),
        evidence("BTW path", "Labels met `BTW - Q` of `Administratie` gaan naar btw-/kwartaallogica.", "process_btw_pipeline(...)"),
        evidence("Yearly path", "Alle overige pipelines gaan naar jaarlogica.", "process_yearly_pipeline(...)"),
      ]),
      step("Bestaande deals worden bijgewerkt", "Als de backend ziet dat de juiste vervolgdeal al bestaat, maakt hij geen dubbele deal aan. In plaats daarvan vergelijkt hij het bedrag op de bestaande deal met het bedrag uit de oorspronkelijke line item en werkt hij alleen bij als dat nodig is.", [
        evidence("Update existing amount", "Als een bestaande deal gevonden wordt, wordt het bedrag alleen bijgewerkt wanneer het afwijkt.", "update_deal_amount_in_new_pipeline(...)"),
      ]),
      step("Ontbrekende deals worden klaargezet", "Als er nog geen passende vervolgdeal bestaat, stelt de backend een nieuwe HubSpot-deal samen. Daarbij bepaalt hij de juiste pipelinefase, dealnaam, eigenaar, jaar, kwartaal of maand en eventuele extra velden zoals controleur bij btw.", [
        evidence("Stage/name/input", "Voor nieuwe deals worden stage, dealnaam en HubSpot input opgebouwd.", "find_correct_stage(...) / create_dealname(...) / build_deal_input(...)"),
      ]),
      step("Nieuwe deals worden in batch aangemaakt", "De backend maakt de nieuwe deals niet één voor één direct aan, maar verzamelt alle ontbrekende vervolgdeals eerst. Daarna stuurt hij ze als batch naar HubSpot, zodat de salesdeal in één backend-run wordt vertaald naar alle benodigde vervolgdeals.", [
        evidence("Batch create", "Nieuwe deal-inputs worden gezamenlijk aangemaakt in HubSpot.", "hubspot_calls.batch_create_deals_sync(deal_inputs)"),
      ]),
    ],
    technicalSteps: [
      technicalStep("FastAPI route", "HubSpot komt binnen op de route in de API-laag.", `@router.post("${endpoint ?? "/hubspot/create_new_deal"}")`),
      technicalStep("Request model", "De handler ontvangt een `NewDeal` body en leest `deal_id.deal_id`.", "async def new_create_deal(deal_id: NewDeal)"),
      technicalStep("Service call", "De handler roept de service-laag aan.", "await create_new_deal(deal_id.deal_id)"),
      technicalStep("Start servicefunctie", "`create_new_deal` logt de start en zet `deal_date = datetime.now()`.", "async def create_new_deal(deal_id: int)"),
      technicalStep("Parallelle HubSpot reads", "Met `asyncio.create_task` worden line items, pipelines, contact, company en owner parallel opgehaald.", "asyncio.gather(line_items_task, cont_pipes_task, contact_task, company_task, owner_task)"),
      technicalStep("Company guard", "Zonder `company_id` wordt `ValueError` gegooid en stopt de endpoint-call.", "if not company_id: raise ValueError(...)"),
      technicalStep("Company properties", "De backend haalt bedrijfsproperties op, waaronder `software_portaal_pakket`.", "hubspot_calls.get_company_info(company_id, properties=NEEDED_COMPANY_PROPS)"),
      technicalStep("Pipeline selector", "`client_type` bepaalt of `get_controle_pipelines()` of `continuous_pipelines` wordt gebruikt.", 'if client_type in ["Pakket groot", "Software"]'),
      technicalStep("Product matching", "Line item namen worden gematcht op pipeline labels.", "match_product_to_pipeline(product_names, pipelines_to_use)"),
      technicalStep("Existing deal reads", "Alle company- en contactdeals met benodigde properties worden opgehaald.", "fetch_all_company_deals_with_props(...) / fetch_all_contact_deals_with_props(...)"),
      technicalStep("Lookup maps", "`contact_exists_map` en `exists_map` worden opgebouwd voor duplicate checks.", "exists_map[(pipeline_id, year, quarter, maand)] = deal_id"),
      technicalStep("Pipeline handler", "De hoofdlogica gaat naar `handle_pipelines(...)`.", "response = await handle_pipelines(...)"),
      technicalStep("Contact read", "`handle_pipelines` haalt contactproperties op en zoekt de huidige deal in `deal_properties`.", "hubspot_calls.get_contact_info(contact_id, properties=NEEDED_CONTACT_PROPS)"),
      technicalStep("Monthly path", "Labels met `Volledige service` gaan naar maandlogica.", "process_monthly_pipeline(...)"),
      technicalStep("BTW path", "Labels met `BTW - Q` of `Administratie` gaan naar btw-/kwartaallogica.", "process_btw_pipeline(...)"),
      technicalStep("Yearly path", "Alle overige pipelines gaan naar jaarlogica.", "process_yearly_pipeline(...)"),
      technicalStep("Stage/name/input", "Voor nieuwe deals worden stage, dealnaam en HubSpot input opgebouwd.", "find_correct_stage(...) / create_dealname(...) / build_deal_input(...)"),
      technicalStep("Update existing amount", "Als een bestaande deal gevonden wordt, wordt het bedrag alleen bijgewerkt wanneer het afwijkt.", "update_deal_amount_in_new_pipeline(...)"),
      technicalStep("Batch create", "Nieuwe deal-inputs worden gezamenlijk aangemaakt in HubSpot.", "hubspot_calls.batch_create_deals_sync(deal_inputs)"),
    ],
    decisions: [
      "Geen `company_id` betekent: proces stopt, want de backend weet niet bij welk bedrijf de vervolgdeal hoort.",
      "`software_portaal_pakket` is `Pakket groot` of `Software`: gebruik controle-pipelines.",
      "Ander pakket of leeg pakket: gebruik doorlopende pipelines.",
      "Pipeline-label bevat `Volledige service`: verwerk per maand.",
      "Pipeline-label bevat `BTW - Q` of `Administratie`: verwerk per kwartaal/btw-periode.",
      "Andere pipeline-labels: verwerk als jaarpipeline.",
      "Bestaande match gevonden: geen nieuwe duplicate deal maken, maar bedrag controleren/bijwerken.",
      "Geen bestaande match gevonden: stage bepalen en nieuwe deal-input klaarzetten.",
    ],
    evidence: [
      { label: "API-bestand", value: apiFile },
      { label: "Endpoint", value: [method, endpoint].filter(Boolean).join(" ") || "POST /hubspot/create_new_deal" },
      { label: "Service-bestand", value: "gitlabtest/app/service/operations/deal_creation.py" },
      { label: "Handler", value: automation.gitlabEndpoint?.handler ?? "new_create_deal" },
      { label: "Servicefunctie", value: "create_new_deal" },
    ],
  };
}

function step(title: string, description: string, technical?: BackendTraceEvidence[]): BackendTraceStep {
  return { title, description, technical };
}

function evidence(title: string, description: string, code?: string): BackendTraceEvidence {
  return { title, description, code };
}

function technicalStep(title: string, description: string, code?: string): BackendTraceStep {
  return { title, description, code };
}

function isGitLabEndpoint(automation: Automatisering, method?: string, endpoint?: string): boolean {
  return (
    automation.source === "gitlab" &&
    Boolean(method || endpoint || automation.gitlabEndpoint || automation.externalId?.includes("::"))
  );
}

function isHubSpotCall(call: GitLabCallInfo): boolean {
  const target = call.to.toLowerCase();
  return target.includes("repository.hubspot") || target.includes("hubspot_client") || target.includes("hubspot");
}

function isHubSpotWrite(call: GitLabCallInfo): boolean {
  if (!isHubSpotCall(call)) return false;
  const name = call.to.split("::").at(-1)?.toLowerCase() ?? call.to.toLowerCase();
  return /(^|[.:_])(update|create|archive|delete|add|set|patch|upsert|associate|batch_create)([.:_]|$)/.test(name);
}

function isHubSpotRead(call: GitLabCallInfo): boolean {
  return isHubSpotCall(call) && !isHubSpotWrite(call);
}

function callToEvidence(call: GitLabCallInfo): BackendTraceEvidence {
  return evidence(formatCallTitle(call), describeCall(call), formatCallCode(call));
}

function formatCallTitle(call: GitLabCallInfo): string {
  const target = getCallName(call);
  if (isHubSpotWrite(call)) return `HubSpot write: ${humanizeIdentifier(target)}`;
  if (isHubSpotRead(call)) return `HubSpot read: ${humanizeIdentifier(target)}`;
  if (call.kind.includes("async")) return `Async helper: ${humanizeIdentifier(target)}`;
  return `Code-aanroep: ${humanizeIdentifier(target)}`;
}

function describeCall(call: GitLabCallInfo): string {
  const target = getCallName(call);
  const lower = target.toLowerCase();
  const object = inferHubSpotObject(lower);

  if (isHubSpotWrite(call)) {
    if (lower.includes("stage")) return `Wijzigt de ${object}fase in HubSpot.`;
    if (lower.includes("owner")) return "Wijzigt eigenaar of verantwoordelijke in HubSpot.";
    if (lower.includes("association") || lower.includes("associate")) return "Maakt of wijzigt een HubSpot-associatie.";
    if (lower.includes("create")) return `Maakt ${object}records aan in HubSpot.`;
    return `Schrijft ${object}gegevens terug naar HubSpot.`;
  }

  if (isHubSpotRead(call)) {
    if (lower.includes("owner")) return "Leest eigenaar of verantwoordelijke uit HubSpot.";
    if (lower.includes("association") || lower.includes("associated")) return "Leest gekoppelde HubSpot-records.";
    if (lower.includes("pipeline")) return "Leest pipeline- of fase-informatie uit HubSpot.";
    return `Leest ${object}gegevens uit HubSpot.`;
  }

  if (call.kind.includes("async")) return "Voert een asynchrone service- of helperstap uit.";
  return "Roept een interne service- of helperfunctie aan.";
}

function formatCallCode(call: GitLabCallInfo): string {
  const file = call.file ? ` in ${call.file}` : "";
  return `${call.kind}: ${call.from} -> ${call.to}${file}`;
}

function getCallName(call: GitLabCallInfo): string {
  return call.to.split("::").at(-1) ?? call.to.split(".").at(-1) ?? call.to;
}

function buildLimitedEvidence(calls: GitLabCallInfo[]): BackendTraceEvidence[] {
  return calls.slice(0, 3).map(callToEvidence);
}

function buildGenericDecisions(
  reads: GitLabCallInfo[],
  writes: GitLabCallInfo[],
  internalCalls: GitLabCallInfo[],
  endpointAnalysis?: RuntimeEndpointAnalysis,
  workerProfile?: RuntimeWorkerProfile,
  codePaths: PythonFunctionCodePath[] = [],
): string[] {
  const decisions = [
    "Deze trace is gebaseerd op de bekende GitLab call graph, runtime-semantiek en automatisch uitgelezen Python-codepaden.",
  ];
  if (endpointAnalysis?.runtimePurpose) decisions.push(endpointAnalysis.runtimePurpose);
  if (workerProfile?.orchestrationRisk) decisions.push(workerProfile.orchestrationRisk);
  if (workerProfile?.fanOutRisk) decisions.push(workerProfile.fanOutRisk);
  const conditions = uniqueStrings(codePaths.flatMap((codePath) => codePath.decisions.map((decision) => conditionToPlain(decision.condition))));
  const writeKeys = uniqueStrings(codePaths.flatMap((codePath) => codePath.calls.flatMap((call) => call.payloadKeys)));
  if (conditions.length > 0) decisions.push(`Er zijn concrete if/else-condities uit de Python-code herkend: ${formatList(conditions.slice(0, 6))}.`);
  if (writeKeys.length > 0) decisions.push(`Er zijn concrete HubSpot-payloadvelden uit de Python-code herkend: ${formatList(writeKeys.slice(0, 8))}.`);
  if (reads.length > 0) decisions.push("Er zijn HubSpot-read calls herkend: de automation baseert zich deels op actuele HubSpot-data.");
  if (writes.length > 0) decisions.push("Er zijn HubSpot-write calls herkend: deze automation kan HubSpot-status wijzigen en daarmee vervolgprocessen raken.");
  if (internalCalls.length > 0) decisions.push("Er zijn interne helper- of servicecalls herkend: de inhoudelijke logica zit waarschijnlijk deels buiten de endpoint-handler.");
  if (writes.length === 0) decisions.push("Er is geen directe HubSpot-write herkend in de call graph; controleer de technische trace als het endpoint toch zichtbaar effect heeft.");
  return decisions.filter(unique);
}

function buildCodePathSteps(operationLabel: string, codePaths: PythonFunctionCodePath[]): BackendTraceStep[] {
  const steps: BackendTraceStep[] = [];
  const meaningful = codePaths.filter(hasMeaningfulCodePath).slice(0, 8);

  for (const codePath of meaningful) {
    const functionLabel = humanizeIdentifier(codePath.functionName);
    const loops = codePath.loops.filter((loop) => loop.iter || loop.condition).slice(0, 4);
    const decisions = codePath.decisions.filter((decision) => !isNoisyCondition(decision.condition)).slice(0, 8);
    const raises = codePath.raises.slice(0, 4);
    const writeCalls = codePath.calls.filter(isPythonHubSpotWriteCall).slice(0, 6);
    const importantCalls = codePath.calls.filter(isMeaningfulPythonCall).slice(0, 8);

    if (loops.length > 0) {
      const loopMeanings = uniqueStrings(loops.map(loopToPlain));
      steps.push(
        step(
          `${functionLabel} doorloopt records`,
          `Voor "${operationLabel}" doorloopt de backend in "${functionLabel}" ${formatList(loopMeanings)}. Daardoor kan een enkele trigger meerdere gekoppelde records raken in plaats van alleen de startdeal.`,
          loops.map((loop) => evidence("Loop uit Python-code", loopToPlain(loop), `${loop.kind} ${loop.target ? `${loop.target} in ${loop.iter}` : loop.condition}:`)),
        ),
      );
    }

    if (decisions.length > 0) {
      const conditionMeanings = uniqueStrings(decisions.map((decision) => conditionToPlain(decision.condition)));
      steps.push(
        step(
          `${functionLabel} neemt codebeslissingen`,
          `De backend beslist in "${functionLabel}" op basis van echte codevoorwaarden. Belangrijk zijn: ${formatList(conditionMeanings.slice(0, 6))}.`,
          decisions.map((decision) => evidence("If/elif uit Python-code", conditionToPlain(decision.condition), `if ${decision.condition}:`)),
        ),
      );
    }

    if (importantCalls.length > 0) {
      steps.push(
        step(
          `${functionLabel} voert concrete subacties uit`,
          `Binnen "${functionLabel}" zijn concrete subacties gevonden die de verwerking van "${operationLabel}" dragen. Dit maakt zichtbaar welke helpers, HubSpot-acties of berekeningen echt in de code worden aangeroepen.`,
          importantCalls.map((call) => evidence("Code-aanroep", pythonCallToPlain(call), call.code)),
        ),
      );
    }

    if (writeCalls.length > 0) {
      const writtenFields = uniqueStrings(writeCalls.flatMap((call) => call.payloadKeys)).slice(0, 10);
      steps.push(
        step(
          `${functionLabel} schrijft specifieke HubSpot-velden`,
          writtenFields.length > 0
            ? `Het zichtbare resultaat van "${functionLabel}" is dat HubSpot-velden zoals ${formatList(writtenFields)} worden bijgewerkt.`
            : `Het zichtbare resultaat van "${functionLabel}" is dat de backend via een HubSpot-write records bijwerkt.`,
          writeCalls.map((call) => evidence("HubSpot write uit Python-code", pythonCallToPlain(call), call.code)),
        ),
      );
    }

    if (raises.length > 0) {
      steps.push(
        step(
          `${functionLabel} kan bewust stoppen`,
          `De backend heeft in "${functionLabel}" stopcondities. Als verplichte data ontbreekt of een foutpad wordt geraakt, stopt de automation bewust in plaats van onvolledig door te lopen.`,
          raises.map((raiseInfo) => evidence("Stopconditie uit Python-code", "De functie gooit een exception op dit punt.", `raise ${raiseInfo.exception}`)),
        ),
      );
    }
  }

  return steps;
}

function buildSemanticSteps(
  operationLabel: string,
  endpointAnalysis: RuntimeEndpointAnalysis | undefined,
  functionAnalyses: RuntimeFunctionAnalysis[],
  workerProfile: RuntimeWorkerProfile | undefined,
): BackendTraceStep[] {
  const steps: BackendTraceStep[] = [];
  const readsEntities = uniqueStrings([
    ...(workerProfile?.readsEntities ?? []),
  ].map(translateRuntimeText));
  const readsProperties = uniqueStrings([
    ...(endpointAnalysis?.readsProperties ?? []),
    ...functionAnalyses.flatMap((analysis) => analysis.readsProperties),
    ...(workerProfile?.readsProperties ?? []),
  ].map(translateRuntimeText));
  const writesProperties = uniqueStrings([
    ...(endpointAnalysis?.writesProperties ?? []),
    ...functionAnalyses.flatMap((analysis) => analysis.writesProperties),
    ...(workerProfile?.writesProperties ?? []),
  ].map(translateRuntimeText));
  const writesDealstages = uniqueStrings([
    ...functionAnalyses.flatMap((analysis) => analysis.writesDealstages),
    ...(workerProfile?.writesDealstages ?? []),
  ].map(translateRuntimeText));
  const associations = uniqueStrings([
    ...(endpointAnalysis?.traversesAssociations ?? []),
    ...functionAnalyses.flatMap((analysis) => analysis.traversesAssociations),
    ...(workerProfile?.traversesAssociations ?? []),
  ].map(translateRuntimeText));
  const temporalLogic = uniqueStrings([
    ...(endpointAnalysis?.temporalLogic ?? []),
    ...functionAnalyses.flatMap((analysis) => analysis.temporalLogic),
    ...(workerProfile?.temporalLogic ?? []),
  ].map(translateRuntimeText));
  const computes = uniqueStrings((workerProfile?.computes ?? []).map(translateRuntimeText));
  const downstream = uniqueStrings([
    ...(endpointAnalysis?.downstreamEffects ?? []),
    ...(workerProfile?.downstreamWorkflows ?? []),
    ...(workerProfile?.emitsSignals ?? []),
  ].map(translateRuntimeText));

  if (workerProfile?.businessSemantics) {
    steps.push(
      step("Procesbetekenis", translateRuntimeText(workerProfile.businessSemantics), [
        evidence("Worker-profiel", "Deze betekenis komt uit het runtime worker-profiel.", workerProfile.workerName),
      ]),
    );
  } else if (endpointAnalysis?.runtimePurpose) {
    steps.push(
      step("Procesbetekenis", endpointAnalysis.runtimePurpose, [
        evidence("Endpoint-analyse", "Deze betekenis komt uit de endpoint runtime-semantiek.", endpointAnalysis.endpointId),
      ]),
    );
  }

  if (readsEntities.length > 0 || readsProperties.length > 0 || associations.length > 0) {
    const details = [
      readsEntities.length > 0 ? `records zoals ${formatList(readsEntities)}.` : "",
      readsProperties.length > 0 ? `properties zoals ${formatList(readsProperties)}.` : "",
      associations.length > 0 ? `associaties zoals ${formatList(associations)}.` : "",
    ].filter(Boolean).join(" ");
    steps.push(
      step(
        "De backend bepaalt welke HubSpot-context nodig is",
        `Voor "${operationLabel}" kijkt de backend naar ${details}`,
        [
          readsProperties.length > 0 ? evidence("Gelezen properties", "Properties die volgens de runtime-analyse gelezen worden.", readsProperties.join(", ")) : null,
          associations.length > 0 ? evidence("Associaties", "HubSpot-relaties die volgens de analyse gevolgd worden.", associations.join(", ")) : null,
        ].filter(isEvidence),
      ),
    );
  }

  if (computes.length > 0 || temporalLogic.length > 0) {
    const details = [
      computes.length > 0 ? `berekent ${formatList(computes)}` : "",
      temporalLogic.length > 0 ? `gebruikt ${formatList(temporalLogic)}` : "",
    ].filter(Boolean).join(" en ");
    steps.push(
      step(
        "De backend past procesregels toe",
        `In deze stap ${details}. Daardoor wordt niet alleen data verplaatst, maar ook proceslogica toegepast.`,
        [
          computes.length > 0 ? evidence("Berekent", "Afgeleide procesuitkomsten uit het worker-profiel.", computes.join(", ")) : null,
          temporalLogic.length > 0 ? evidence("Tijd/periode-logica", "Temporal logic uit de runtime-analyse.", temporalLogic.join(", ")) : null,
        ].filter(isEvidence),
      ),
    );
  }

  if (writesProperties.length > 0 || writesDealstages.length > 0) {
    const details = [
      writesProperties.length > 0 ? `properties zoals ${formatList(writesProperties)}` : "",
      writesDealstages.length > 0 ? `dealstages zoals ${formatList(writesDealstages)}` : "",
    ].filter(Boolean).join(" en ");
    steps.push(
      step(
        "De backend wijzigt concrete HubSpot-status",
        `Het zichtbare effect van "${operationLabel}" zit in het bijwerken van ${details}.`,
        [
          writesProperties.length > 0 ? evidence("Geschreven properties", "Properties die volgens de runtime-analyse worden geschreven.", writesProperties.join(", ")) : null,
          writesDealstages.length > 0 ? evidence("Geschreven dealstages", "Dealstages die volgens de analyse geraakt worden.", writesDealstages.join(", ")) : null,
        ].filter(isEvidence),
      ),
    );
  }

  if (downstream.length > 0) {
    steps.push(
      step(
        "Vervolgprocessen kunnen reageren",
        `Na deze backend-run kunnen vervolgprocessen geraakt worden, zoals ${formatList(downstream)}.`,
        [evidence("Downstream effecten", "Effecten en signalen uit endpoint- en workeranalyse.", downstream.join(", "))],
      ),
    );
  }

  return steps;
}

function findPythonCodePaths(calls: GitLabCallInfo[], handler?: string, apiFile?: string): PythonFunctionCodePath[] {
  const wanted = new Map<string, { name: string; file?: string }>();

  if (handler) wanted.set(`handler:${handler}`, { name: handler, file: apiFile });

  for (const call of calls) {
    for (const endpoint of [call.from, call.to]) {
      const name = endpoint.split("::").at(-1)?.split(".").at(-1);
      if (!name) continue;
      const file = endpoint === call.to ? call.file ?? undefined : undefined;
      wanted.set(`${name}:${file ?? ""}`, { name, file });
    }
  }

  const matches = [...wanted.values()].flatMap(({ name, file }) => {
    const normalizedFile = normalizePath(file ?? "");
    return PYTHON_CODEPATH_ANALYSIS.filter((codePath) => {
      if (codePath.functionName !== name) return false;
      if (!normalizedFile) return true;
      const codePathFile = normalizePath(codePath.file);
      return normalizedFile.endsWith(codePathFile) || codePathFile.endsWith(normalizedFile);
    });
  });

  return uniqueBy(
    matches.filter((codePath) => !isInfrastructureSource(codePath.file) && !isNoisyPythonFunction(codePath.functionName)),
    (codePath) => codePath.functionId,
  );
}

function hasMeaningfulCodePath(codePath: PythonFunctionCodePath): boolean {
  return (
    codePath.loops.length > 0 ||
    codePath.raises.length > 0 ||
    codePath.decisions.some((decision) => !isNoisyCondition(decision.condition)) ||
    codePath.calls.some(isMeaningfulPythonCall)
  );
}

function isNoisyPythonFunction(functionName: string): boolean {
  const lower = functionName.toLowerCase();
  return lower.startsWith("__") || lower === "log" || lower === "main";
}

function isMeaningfulPythonCall(call: PythonCodeCall): boolean {
  const lower = call.name.toLowerCase();
  if (["logger.info", "logger.debug", "logger.warning", "logging.info", "logging.warning", "print"].includes(lower)) return false;
  if (lower.endsWith(".get") || lower.endsWith(".append") || lower.endsWith(".keys") || lower.endsWith(".values")) return false;
  return (
    call.hubspotTarget.length > 0 ||
    call.payloadKeys.length > 0 ||
    lower.includes("find_correct") ||
    lower.includes("fetch_all") ||
    lower.includes("process_") ||
    lower.includes("handle_") ||
    lower.includes("create_") ||
    lower.includes("update_") ||
    lower.includes("batch_")
  );
}

function isPythonHubSpotWriteCall(call: PythonCodeCall): boolean {
  const target = [call.name, call.hubspotTarget].join(" ").toLowerCase();
  return (
    call.payloadKeys.length > 0 &&
    /(update|create|archive|delete|add|set|patch|upsert|associate|batch_create)/.test(target)
  );
}

function loopToPlain(loop: PythonFunctionCodePath["loops"][number]): string {
  const iter = String(loop.iter ?? "").toLowerCase();
  const target = loop.target ? humanizeIdentifier(loop.target) : "records";
  if (iter.includes("company_deals")) return "alle deals van hetzelfde bedrijf";
  if (iter.includes("contact_deals")) return "alle deals van hetzelfde contact";
  if (iter.includes("all_deals")) return "alle relevante deals";
  if (iter.includes("pipeline")) return "alle relevante pipelines";
  if (iter.includes("line_item") || iter.includes("product")) return "alle verkochte producten of line items";
  if (loop.kind === "while") return `de voorwaarde "${loop.condition}" zolang die waar is`;
  return `${target} uit ${humanizeIdentifier(loop.iter ?? "de verzameling")}`;
}

function conditionToPlain(condition: string): string {
  const lower = condition.toLowerCase();
  if (lower.includes("str(d)") && lower.includes("deal_id")) return "de oorspronkelijke startdeal wordt overgeslagen";
  if (lower.includes("not company_id")) return "er moet een gekoppeld bedrijf bekend zijn";
  if (lower.includes("not contact_id")) return "er moet een gekoppeld contact bekend zijn";
  if (lower.includes("not pipeline_id") || lower.includes("not current_stage")) return "pipeline en huidige fase moeten bekend zijn";
  if (lower.includes("current_stage == previous_stage")) return "de deal wordt overgeslagen als hij al op de vorige fase staat";
  if (lower === "previous_stage" || lower.includes("if previous_stage")) return "de code gebruikt de opgeslagen vorige fase als die bekend is";
  if (lower.includes("not previous_stage")) return "de code berekent een fallbackfase als vorige fase ontbreekt";
  if (lower.includes("dealstage") && lower.includes("not in")) return "de huidige dealfase moet niet in de uitgesloten of afgeronde fases zitten";
  if (lower.includes("dealstage") && lower.includes(" in ")) return "de huidige dealfase moet binnen een specifieke set fases vallen";
  if (lower.includes("pipeline")) return "de code splitst de route op basis van pipeline";
  if (lower.includes("year")) return "de code controleert jaar- of periodegegevens";
  if (lower.includes("quarter")) return "de code controleert kwartaalgegevens";
  if (lower.includes("amount")) return "de code vergelijkt of bedraggegevens moeten worden bijgewerkt";
  if (lower.includes("status_code")) return "de code controleert de response van een externe API-call";
  return humanizeIdentifier(condition.replace(/[=!<>]=?/g, " "));
}

function isNoisyCondition(condition: string): boolean {
  const lower = condition.toLowerCase();
  return lower.includes("logger") || lower.includes("response.status_code") || lower === "__name__ == \"__main__\"";
}

function pythonCallToPlain(call: PythonCodeCall): string {
  const target = call.hubspotTarget || call.name;
  const lower = target.toLowerCase();
  const fields = call.payloadKeys.length > 0 ? ` met velden ${formatList(call.payloadKeys.slice(0, 6))}` : "";
  if (lower.includes("get_deal")) return `haalt dealgegevens op${fields}`;
  if (lower.includes("get_company")) return `haalt bedrijfsgegevens op${fields}`;
  if (lower.includes("get_contact")) return `haalt contactgegevens op${fields}`;
  if (lower.includes("update_deal")) return `werkt dealgegevens bij${fields}`;
  if (lower.includes("create_deal")) return `maakt dealgegevens aan${fields}`;
  if (lower.includes("fetch_all_company_deals")) return "haalt alle deals van hetzelfde bedrijf op";
  if (lower.includes("find_correct_stage")) return "bepaalt de juiste HubSpot-fase";
  if (lower.includes("batch")) return `voert een batchactie uit${fields}`;
  return `${humanizeIdentifier(target)}${fields}`;
}

function buildCallGroups(calls: GitLabCallInfo[], handler?: string): BackendCallGroup[] {
  const groups = new Map<string, GitLabCallInfo[]>();

  for (const call of calls) {
    if (isFromHandler(call, handler)) continue;
    if (isInfrastructureSource(call.from)) continue;
    const key = call.from || "Onbekende bronfunctie";
    const current = groups.get(key) ?? [];
    current.push(call);
    groups.set(key, current);
  }

  return [...groups.entries()]
    .map(([from, groupedCalls]) => {
      const sortedCalls = [...groupedCalls].sort((a, b) => a.depth - b.depth);
      return {
        from,
        title: humanizeIdentifier(from.split("::").at(-1) ?? from),
        calls: sortedCalls,
        reads: sortedCalls.filter(isHubSpotRead),
        writes: sortedCalls.filter(isHubSpotWrite),
        internal: sortedCalls.filter((call) => !isHubSpotCall(call)),
      };
    })
    .sort((a, b) => Math.min(...a.calls.map((call) => call.depth)) - Math.min(...b.calls.map((call) => call.depth)));
}

function isInfrastructureSource(from: string): boolean {
  const normalized = from.toLowerCase();
  return (
    normalized.includes("repository.hubspot") ||
    normalized.includes("hubspot_client") ||
    normalized.includes("client.crm") ||
    normalized.includes("basic_api") ||
    normalized.includes("batch_api")
  );
}

function buildStepsForCallGroup(group: BackendCallGroup, operationLabel: string): BackendTraceStep[] {
  const steps: BackendTraceStep[] = [];
  const hasReads = group.reads.length > 0;
  const hasWrites = group.writes.length > 0;
  const hasInternal = group.internal.length > 0;

  if (hasReads) {
    steps.push(
      step(
        `${group.title} leest HubSpot-data`,
        `De backendfunctie "${group.title}" haalt HubSpot-gegevens op die nodig zijn voor "${operationLabel}". Dit maakt de stap afhankelijk van de actuele status van gekoppelde HubSpot-records.`,
        group.reads.map(callToEvidence),
      ),
    );
  }

  if (hasInternal) {
    steps.push(
      step(
        `${group.title} verwerkt de backendlogica`,
        `De backendfunctie "${group.title}" roept onderliggende helpers of services aan. Daar zit waarschijnlijk een deel van de inhoudelijke proceslogica of datavoorbereiding.`,
        group.internal.slice(0, 8).map(callToEvidence),
      ),
    );
  }

  if (hasWrites) {
    steps.push(
      step(
        `${group.title} schrijft terug naar HubSpot`,
        `De backendfunctie "${group.title}" past HubSpot aan. Deze wijziging kan het zichtbare resultaat van "${operationLabel}" zijn en kan vervolgworkflows of procesreizen raken.`,
        group.writes.map(callToEvidence),
      ),
    );
  }

  if (!hasReads && !hasInternal && !hasWrites) {
    steps.push(
      step(
        `${group.title} wordt uitgevoerd`,
        `De backendfunctie "${group.title}" is onderdeel van de verwerking van "${operationLabel}", maar de bekende call graph laat niet specifieker zien of deze stap HubSpot leest of schrijft.`,
        group.calls.map(callToEvidence),
      ),
    );
  }

  return steps;
}

function isFromHandler(call: GitLabCallInfo, handler?: string): boolean {
  if (!handler) return call.depth === 0;
  const from = call.from.toLowerCase();
  const normalizedHandler = handler.toLowerCase();
  return call.depth === 0 || from.endsWith(`::${normalizedHandler}`) || from.endsWith(`.${normalizedHandler}`);
}

function findEndpointAnalysis(
  apiFile: string,
  endpoint?: string,
  handler?: string,
): RuntimeEndpointAnalysis | undefined {
  const normalizedFile = normalizePath(apiFile);
  const normalizedEndpoint = endpoint?.toLowerCase();
  const normalizedHandler = handler?.toLowerCase();

  return RUNTIME_ENDPOINT_ANALYSIS.find((analysis) => {
    const sameHandler = normalizedHandler && analysis.handler?.toLowerCase() === normalizedHandler;
    const sameFile = normalizePath(analysis.file) === normalizedFile || normalizedFile.endsWith(normalizePath(analysis.file));
    const sameRoute = normalizedEndpoint && analysis.routes.some((route) => route.toLowerCase().includes(normalizedEndpoint));
    return Boolean((sameRoute && (!normalizedHandler || sameHandler)) || (sameHandler && sameFile));
  });
}

function findFunctionAnalyses(calls: GitLabCallInfo[]): RuntimeFunctionAnalysis[] {
  const names = uniqueStrings(calls.flatMap((call) => [call.from, call.to].map((value) => value.split("::").at(-1) ?? value)));
  const files = uniqueStrings(calls.map((call) => normalizePath(call.file ?? "")).filter(Boolean));

  return RUNTIME_FUNCTION_ANALYSIS.filter((analysis) => {
    const functionName = analysis.functionName.toLowerCase();
    const file = normalizePath(analysis.file);
    return names.some((name) => name.toLowerCase() === functionName) || files.some((knownFile) => knownFile.endsWith(file));
  });
}

function findWorkerProfile(
  automation: Automatisering,
  endpointAnalysis: RuntimeEndpointAnalysis | undefined,
  functionAnalyses: RuntimeFunctionAnalysis[],
): RuntimeWorkerProfile | undefined {
  const haystack = [
    automation.naam,
    automation.id,
    automation.externalId,
    endpointAnalysis?.workflowGraph,
    endpointAnalysis?.runtimePurpose,
    ...functionAnalyses.map((analysis) => analysis.workflowGraph),
    ...functionAnalyses.map((analysis) => analysis.functionName),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const scored = RUNTIME_WORKER_PROFILES.map((profile) => {
    const needles = [
      profile.workerName,
      profile.workflowGraph,
      profile.runtimeActorRole,
      profile.businessSemantics,
      ...profile.triggerSignals,
      ...profile.rootTriggerEvents,
    ]
      .filter(Boolean)
      .flatMap((value) => tokenize(String(value)));
    const domainScore = workerProfileDomainScore(profile, haystack);
    const score = uniqueStrings(needles).filter((needle) => haystack.includes(needle)).length
      + domainScore;
    return {
      profile,
      score,
      domainScore,
      directNameMatches: workerProfileNameMatches(profile, haystack),
    };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best?.score) return undefined;
  if (best.domainScore >= 10 || best.directNameMatches >= 2) return best.profile;
  return undefined;
}

function workerProfileNameMatches(profile: RuntimeWorkerProfile, haystack: string): number {
  const genericTokens = new Set([
    "worker",
    "hubspot",
    "runtime",
    "state",
    "backend",
    "automation",
    "deal",
    "contact",
    "company",
    "bedrijf",
    "update",
    "process",
    "proces",
  ]);
  return uniqueStrings(tokenize(profile.workerName))
    .filter((token) => token.length >= 4 && !genericTokens.has(token))
    .filter((token) => haystack.includes(token))
    .length;
}

function workerProfileDomainScore(profile: RuntimeWorkerProfile, haystack: string): number {
  const profileText = [
    profile.workerName,
    profile.workflowGraph,
    profile.businessSemantics,
    ...profile.rootTriggerEvents,
    ...profile.triggerSignals,
    ...profile.readsEntities,
    ...profile.readsProperties,
    ...profile.computes,
    ...profile.writesProperties,
    ...profile.emitsSignals,
    ...profile.downstreamWorkflows,
  ].filter(Boolean).join(" ").toLowerCase();

  const domainTokens = [
    "wefact",
    "debtor",
    "clockify",
    "bankkoppeling",
    "btw",
    "machtiging",
    "vpb",
    "jaarrekening",
    "lead",
    "kvk",
    "typeform",
  ];

  return domainTokens.filter((token) => profileText.includes(token) && haystack.includes(token)).length * 10;
}

function inferHandlerName(automation: Automatisering): string | undefined {
  return automation.gitlabEndpoint?.handler ?? automation.externalId?.split("::").at(0)?.split("/").at(-1);
}

function cleanOperationLabel(name: string, endpoint?: string, handler?: string): string {
  const withoutRoute = name.replace(/\s*\([A-Z]+\s+\/.*?\)\s*$/i, "").trim();
  const candidate = withoutRoute || handler || endpoint?.split("/").filter(Boolean).at(-1) || "deze backend automation";
  return humanizeIdentifier(candidate);
}

function inferHubSpotObject(name: string): string {
  if (name.includes("deal")) return "deal";
  if (name.includes("company")) return "company";
  if (name.includes("contact")) return "contact";
  if (name.includes("ticket")) return "ticket";
  if (name.includes("pipeline")) return "pipeline";
  return "HubSpot";
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function translateRuntimeText(value: string): string {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();

  const exact: Record<string, string> = {
    "triggering deal": "startdeal",
    "company": "bedrijf",
    "company deals": "deals van hetzelfde bedrijf",
    "pipeline stages": "pipelinefases",
    "contact": "contactpersoon",
    "company properties": "bedrijfsproperties",
    "contact properties": "contactproperties",
    "previous stage": "vorige fase",
    "computed correct stage": "berekende juiste fase",
    "all affected pipeline workflows": "alle workflows van geraakte pipelines",
    "operational pause/resume workflows": "workflows die werk pauzeren of hervatten",
    "debtor follow-up": "debiteurenopvolging",
    "deal_blocked_by_payment": "deal geblokkeerd door betalingsstatus",
    "deal_unblocked_by_payment": "deal vrijgegeven na betalingsstatus",
    "dealstage_changed": "dealstage gewijzigd",
    "date/cutoff logic": "datum- en peildatumlogica",
    "year-based matching": "matching op jaar",
    "quarter readiness": "kwartaalgereedheid",
    "paged/batch processing": "gepagineerde of batchverwerking",
    "reset uses previous stage or recomputes from current year/quarter context": "reset gebruikt de vorige fase of berekent opnieuw vanuit jaar-/kwartaalcontext",
    "betaalt niet stage per pipeline": "Betaalt-niet fase per pipeline",
    "previous stage preservation": "bewaren van de vorige fase",
    "correct fallback stage on reset": "juiste terugvalfase bij reset",
    "freezes or resumes operational work for a customer based on payment status.":
      "Pauzeert of hervat operationeel werk voor een klant op basis van de betalingsstatus.",
    "critical: this is a cross-pipeline blocking mechanism.":
      "Kritiek: dit is een blokkeringsmechanisme over meerdere pipelines heen.",
    "very high: one payment state can move every deal associated with the company.":
      "Zeer hoog: één betalingsstatus kan alle deals van hetzelfde bedrijf verplaatsen.",
  };

  if (exact[normalized]) return exact[normalized];
  if (exact[lower]) return exact[lower];

  return normalized
    .replace(/\breads\b/gi, "leest")
    .replace(/\bwrites\b/gi, "schrijft")
    .replace(/\bdeal\b/gi, "deal")
    .replace(/\bdeals\b/gi, "deals")
    .replace(/\bcompany\b/gi, "bedrijf")
    .replace(/\bcontact\b/gi, "contact")
    .replace(/\bpipeline\b/gi, "pipeline")
    .replace(/\bstage\b/gi, "fase")
    .replace(/\bstages\b/gi, "fases")
    .replace(/\bproperties\b/gi, "properties")
    .replace(/\bworkflow\b/gi, "workflow")
    .replace(/\bworkflows\b/gi, "workflows");
}

function hasEvidenceCode(item: BackendTraceEvidence): boolean {
  return Boolean(item.code);
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function formatList(values: string[], max = 5): string {
  const visible = values.slice(0, max);
  const suffix = values.length > max ? ` en ${values.length - max} meer` : "";
  return `${visible.join(", ")}${suffix}`;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4);
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
}

function unique(value: string, index: number, all: string[]): boolean {
  return all.indexOf(value) === index;
}

function uniqueBy<T>(values: T[], getKey: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = getKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isEvidence(item: BackendTraceEvidence | null): item is BackendTraceEvidence {
  return Boolean(item);
}
