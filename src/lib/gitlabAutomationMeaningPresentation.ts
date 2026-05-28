import { parseGitLabExternalEndpoint } from "./automationFunnel";
import {
  PYTHON_CODEPATH_ANALYSIS,
  type PythonCodeCall,
  type PythonFunctionCodePath,
} from "./generatedPythonCodePathAnalysis";
import {
  RUNTIME_ENDPOINT_ANALYSIS,
  RUNTIME_FUNCTION_ANALYSIS,
  type RuntimeEndpointAnalysis,
  type RuntimeFunctionAnalysis,
} from "./generatedRuntimeAnalysis";
import type { Automatisering, GitLabCallInfo } from "./types";

export type GitLabMeaningConfidence = "hoog" | "middel" | "laag";
export type GitLabEvidenceSource = "call_graph" | "codepath" | "runtime" | "curated";

export interface GitLabEvidenceItem {
  label: string;
  value: string;
  source: GitLabEvidenceSource;
}

export interface GitLabOperationFact {
  label: string;
  description: string;
  technicalDetail?: string;
  evidence?: GitLabEvidenceItem[];
}

export interface GitLabAutomationMeaningPresentation {
  ontvangt: GitLabOperationFact[];
  haaltOp: GitLabOperationFact[];
  berekent: GitLabOperationFact[];
  pastAan: GitLabOperationFact[];
  stuurtTerug: GitLabOperationFact[];
  backgroundWork: GitLabOperationFact[];
  confidence: GitLabMeaningConfidence;
  confidenceLabel: string;
  summary: string;
  evidence: GitLabEvidenceItem[];
  evidenceBadges: string[];
  gaps: string[];
  curated: boolean;
}

interface EndpointInfo {
  method?: string;
  endpoint?: string;
  file?: string;
  handler?: string;
  calls: GitLabCallInfo[];
}

interface CuratedMeaningPatch {
  matcher: (endpointInfo: EndpointInfo, automation: Automatisering) => boolean;
  summary: string;
  ontvangt?: GitLabOperationFact[];
  haaltOp?: GitLabOperationFact[];
  berekent?: GitLabOperationFact[];
  pastAan?: GitLabOperationFact[];
  stuurtTerug?: GitLabOperationFact[];
  backgroundWork?: GitLabOperationFact[];
}

const IGNORED_INPUT_ARGS = new Set([
  "self",
  "request",
  "background_tasks",
  "api_key",
  "api_key_header",
  "db",
  "session",
]);

const IGNORED_FUNCTION_NAMES = new Set([
  "str",
  "int",
  "len",
  "list",
  "dict",
  "set",
  "get",
  "print",
  "logger.info",
  "logger.error",
  "logger.exception",
  "HTTPException",
  "call_hubspot_api",
  "asyncio.gather",
  "sentry_sdk.capture_exception",
]);

const CURATED_PATCHES: CuratedMeaningPatch[] = [
  {
    matcher: (endpointInfo) => endpointInfo.handler === "contact_change_endpoint" || endpointInfo.endpoint?.includes("/contact/updating_dealname") === true,
    summary:
      "Wanneer de naam van een HubSpot-contact wijzigt, werkt deze automatisering de dealnamen van de gekoppelde deals bij. Hij haalt de gekoppelde deals en de voor- en achternaam op uit HubSpot, bepaalt per deal welke naam nodig is, en schrijft de nieuwe dealnaam terug naar HubSpot. Het bijwerken gebeurt op de achtergrond, zodat het proces niet hoeft te wachten tot alle deals zijn verwerkt.",
    ontvangt: [
      curatedFact("contact_id", "De request body bevat het HubSpot contact-id waarvan de naam is gewijzigd.", "ContactUpdateDealName.contact_id"),
    ],
    haaltOp: [
      curatedFact("Gekoppelde deals", "Haalt alle HubSpot deals op die aan dit contact gekoppeld zijn.", "hubspot_calls.get_deals_for_contact(contact_id)"),
      curatedFact("Contactgegevens", "Haalt firstname en lastname van het contact op om de nieuwe contactnaam samen te stellen.", "hubspot_calls.get_contact_info(contact_id)"),
      curatedFact("Bestaande dealname", "Haalt per gekoppelde deal de bestaande HubSpot property dealname op.", "hubspot_calls.batch_get_deals_info(deal_ids, [\"dealname\"])"),
    ],
    berekent: [
      curatedFact("Nieuwe dealnaam", "Vervangt het contactdeel in <pipeline>: <contact name> - <company name> door de nieuwe contactnaam.", "_compute_new_deal_name(old_deal_name, new_contact_name, \"contact\")"),
    ],
    pastAan: [
      curatedFact("HubSpot deal property dealname", "Batch-updatet de HubSpot deal property dealname voor alle gekoppelde deals waarvan de naam afwijkt.", "hubspot_calls.batch_update_deals(batch_payload)"),
    ],
    stuurtTerug: [
      curatedFact("Scheduled response", "Stuurt direct terug dat de dealname-update scheduled is voor dit contact.", "Dealname update scheduled for contact {contact_id}."),
    ],
    backgroundWork: [
      curatedFact("_contact_change_task", "Start de eigenlijke dealname-update als achtergrondtaak na de HTTP-response.", "background_tasks.add_task(_contact_change_task, contact_id.contact_id)"),
    ],
  },
  {
    matcher: (endpointInfo) => endpointInfo.handler === "company_change_endpoint" || endpointInfo.endpoint?.includes("/company/updating_dealname") === true,
    summary:
      "Wanneer de naam van een HubSpot-bedrijf wijzigt, werkt deze automatisering de dealnamen van de gekoppelde deals bij. Hij haalt de gekoppelde deals en de actuele bedrijfsnaam op uit HubSpot, bepaalt per deal welke naam nodig is, en schrijft de nieuwe dealnaam terug naar HubSpot. Het bijwerken gebeurt op de achtergrond, zodat het proces niet hoeft te wachten tot alle deals zijn verwerkt.",
    ontvangt: [
      curatedFact("company_id", "De request body bevat het HubSpot company-id waarvan de naam is gewijzigd.", "CompanyUpdateDealName.company_id"),
    ],
    haaltOp: [
      curatedFact("Gekoppelde deals", "Haalt alle HubSpot deals op die aan dit bedrijf gekoppeld zijn.", "hubspot_calls.get_deals_for_company(company_id)"),
      curatedFact("Bedrijfsgegevens", "Haalt de actuele bedrijfsnaam op om dealnamen bij te werken.", "hubspot_calls.get_company_info(company_id)"),
      curatedFact("Bestaande dealname", "Haalt per gekoppelde deal de bestaande HubSpot property dealname op.", "hubspot_calls.batch_get_deals_info(deal_ids, [\"dealname\"])"),
    ],
    berekent: [
      curatedFact("Nieuwe dealnaam", "Vervangt het bedrijfsdeel in <pipeline>: <contact name> - <company name> door de nieuwe bedrijfsnaam.", "_compute_new_deal_name(old_deal_name, new_company_name, \"company\")"),
    ],
    pastAan: [
      curatedFact("HubSpot deal property dealname", "Batch-updatet de HubSpot deal property dealname voor alle gekoppelde deals waarvan de naam afwijkt.", "hubspot_calls.batch_update_deals(batch_payload)"),
    ],
    stuurtTerug: [
      curatedFact("Scheduled response", "Stuurt direct terug dat de dealname-update scheduled is voor dit bedrijf.", "Dealname update scheduled for company {company_id}."),
    ],
    backgroundWork: [
      curatedFact("_company_change_task", "Start de eigenlijke dealname-update als achtergrondtaak na de HTTP-response.", "background_tasks.add_task(_company_change_task, company_id.company_id)"),
    ],
  },
];

export function getGitLabAutomationMeaningPresentation(automation: Automatisering): GitLabAutomationMeaningPresentation {
  const endpointInfo = getEndpointInfo(automation);
  const codePaths = findRelevantCodePaths(endpointInfo);
  const endpointAnalysis = findEndpointAnalysis(endpointInfo);
  const functionAnalyses = findFunctionAnalyses(codePaths);
  const receives = buildInputFacts(endpointInfo, codePaths);
  const reads = buildReadFacts(endpointInfo, codePaths, endpointAnalysis, functionAnalyses);
  const computes = buildComputeFacts(codePaths, endpointAnalysis, functionAnalyses);
  const writes = buildWriteFacts(endpointInfo, codePaths, endpointAnalysis, functionAnalyses);
  const responses = buildResponseFacts(endpointInfo, codePaths);
  const backgroundWork = buildBackgroundFacts(codePaths, endpointInfo.calls);
  const curatedPatch = CURATED_PATCHES.find((patch) => patch.matcher(endpointInfo, automation));
  const curated = Boolean(curatedPatch);

  const meaning = {
    ontvangt: mergeFacts(receives, curatedPatch?.ontvangt),
    haaltOp: mergeFacts(reads, curatedPatch?.haaltOp),
    berekent: mergeFacts(computes, curatedPatch?.berekent),
    pastAan: mergeFacts(writes, curatedPatch?.pastAan),
    stuurtTerug: mergeFacts(responses, curatedPatch?.stuurtTerug),
    backgroundWork: mergeFacts(backgroundWork, curatedPatch?.backgroundWork),
  };
  const confidence = determineConfidence(meaning, codePaths, endpointAnalysis, curated);
  const evidence = buildEvidence(endpointInfo, codePaths, endpointAnalysis, functionAnalyses, curated);
  const gaps = buildGaps(meaning, confidence);
  const summary = curatedPatch?.summary ?? buildSummary(automation, endpointInfo, meaning, confidence);

  return {
    ...meaning,
    confidence,
    confidenceLabel: confidence === "hoog" ? "Hoog" : confidence === "middel" ? "Middel" : "Laag",
    summary,
    evidence,
    evidenceBadges: buildEvidenceBadges(evidence, confidence),
    gaps,
    curated,
  };
}

function getEndpointInfo(automation: Automatisering): EndpointInfo {
  const parsed = parseGitLabExternalEndpoint(automation.externalId);
  const importEndpoint = automation.importProposal?.gitlab?.endpoint;
  const endpoint = automation.gitlabEndpoint?.endpoint
    ?? automation.importProposal?.gitlab_endpoint?.endpoint
    ?? importEndpoint?.path
    ?? parsed.endpoint
    ?? automation.endpoints?.[0];
  const method = automation.gitlabEndpoint?.method
    ?? automation.importProposal?.gitlab_endpoint?.method
    ?? importEndpoint?.method
    ?? parsed.method;
  const file = automation.gitlabEndpoint?.api_file
    ?? automation.importProposal?.gitlab_endpoint?.api_file
    ?? importEndpoint?.api_file
    ?? automation.gitlabFilePath
    ?? automation.externalId;
  const handler = automation.gitlabEndpoint?.handler
    ?? automation.importProposal?.gitlab_endpoint?.handler
    ?? importEndpoint?.handler
    ?? inferHandlerFromExternalId(automation.externalId);
  const calls = automation.gitlabEndpoint?.calls
    ?? automation.importProposal?.gitlab_endpoint?.calls
    ?? automation.importProposal?.gitlab?.calls
    ?? [];

  return { method, endpoint, file, handler, calls };
}

function findRelevantCodePaths(endpointInfo: EndpointInfo): PythonFunctionCodePath[] {
  const wantedNames = new Set<string>();
  if (endpointInfo.handler) wantedNames.add(endpointInfo.handler);
  for (const call of endpointInfo.calls) {
    addCallFunctionName(wantedNames, call.from);
    addCallFunctionName(wantedNames, call.to);
  }

  const selected = new Map<string, PythonFunctionCodePath>();
  const endpointFile = normalizePath(endpointInfo.file);
  for (const path of PYTHON_CODEPATH_ANALYSIS) {
    const functionMatches = wantedNames.has(path.functionName);
    const fileMatches = endpointFile && normalizePath(path.file).endsWith(endpointFile);
    if (functionMatches || (fileMatches && endpointInfo.handler === path.functionName)) {
      selected.set(path.functionId, path);
    }
  }

  for (let round = 0; round < 4; round += 1) {
    let changed = false;
    const selectedPaths = Array.from(selected.values());
    for (const path of selectedPaths) {
      for (const call of path.calls) {
        const candidateNames = extractCalledFunctionNames(call);
        for (const candidateName of candidateNames) {
          const next = PYTHON_CODEPATH_ANALYSIS.find((candidate) => candidate.functionName === candidateName);
          if (next && !selected.has(next.functionId)) {
            selected.set(next.functionId, next);
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }

  return Array.from(selected.values());
}

function findEndpointAnalysis(endpointInfo: EndpointInfo): RuntimeEndpointAnalysis | undefined {
  const route = [endpointInfo.method, endpointInfo.endpoint].filter(Boolean).join(" ");
  const normalizedFile = normalizePath(endpointInfo.file);
  return RUNTIME_ENDPOINT_ANALYSIS.find((analysis) => {
    const fileMatches = normalizedFile && normalizePath(analysis.file).endsWith(normalizedFile);
    const handlerMatches = endpointInfo.handler && analysis.handler === endpointInfo.handler;
    const routeMatches = route && analysis.routes.includes(route);
    return Boolean(routeMatches || (fileMatches && handlerMatches));
  });
}

function findFunctionAnalyses(codePaths: PythonFunctionCodePath[]): RuntimeFunctionAnalysis[] {
  const functionIds = new Set(codePaths.map((path) => path.functionId));
  const functionNames = new Set(codePaths.map((path) => path.functionName));
  return RUNTIME_FUNCTION_ANALYSIS.filter((analysis) => functionIds.has(analysis.functionId) || functionNames.has(analysis.functionName));
}

function buildInputFacts(endpointInfo: EndpointInfo, codePaths: PythonFunctionCodePath[]): GitLabOperationFact[] {
  const handlerPath = codePaths.find((path) => path.functionName === endpointInfo.handler) ?? codePaths[0];
  const facts: GitLabOperationFact[] = [];
  const bodyFields = new Set<string>();

  if (handlerPath) {
    for (const call of handlerPath.calls) {
      for (const field of extractArgPropertyAccesses(handlerPath.args, call.code)) {
        bodyFields.add(field);
      }
    }
    for (const arg of handlerPath.args.filter((value) => !IGNORED_INPUT_ARGS.has(value))) {
      if (!bodyFields.size) {
        facts.push({
          label: arg,
          description: `De handler ontvangt ${arg} als input voor deze backend automation.`,
          technicalDetail: `${handlerPath.functionName}(${handlerPath.args.join(", ")})`,
          evidence: [evidence("Handler argument", arg, "codepath")],
        });
      }
    }
  }

  for (const field of bodyFields) {
    facts.push({
      label: field,
      description: `De request body bevat ${field}; dit veld is het startpunt voor de backendverwerking.`,
      technicalDetail: handlerPath ? `${handlerPath.functionName}(... ${field} ...)` : undefined,
      evidence: [evidence("Request body", field, "codepath")],
    });
  }

  for (const param of endpointInfo.endpoint?.matchAll(/\{([^}]+)\}/g) ?? []) {
    facts.push({
      label: param[1],
      description: `Het endpoint ontvangt ${param[1]} als URL-parameter.`,
      technicalDetail: endpointInfo.endpoint,
      evidence: [evidence("Path parameter", param[1], "call_graph")],
    });
  }

  return uniqueFacts(facts);
}

function buildReadFacts(
  endpointInfo: EndpointInfo,
  codePaths: PythonFunctionCodePath[],
  endpointAnalysis: RuntimeEndpointAnalysis | undefined,
  functionAnalyses: RuntimeFunctionAnalysis[],
): GitLabOperationFact[] {
  const facts: GitLabOperationFact[] = [];
  const propertyHints = extractPropertyHints(codePaths);

  for (const call of allPythonCalls(codePaths)) {
    const target = call.hubspotTarget || call.name;
    if (!isReadName(target, call.code)) continue;
    facts.push(readFactFromPythonCall(call, propertyHints));
  }

  for (const call of endpointInfo.calls) {
    if (!isCallGraphRead(call)) continue;
    facts.push({
      label: humanizeIdentifier(getCallName(call)),
      description: describeReadTarget(getCallName(call), []),
      technicalDetail: call.to,
      evidence: [evidence("Call graph", call.to, "call_graph")],
    });
  }

  for (const association of endpointAnalysis?.traversesAssociations ?? []) {
    facts.push({
      label: association,
      description: `Gebruikt de HubSpot-associatie ${association} om gerelateerde records te vinden.`,
      technicalDetail: association,
      evidence: [evidence("Runtime association", association, "runtime")],
    });
  }

  for (const analysis of functionAnalyses) {
    for (const association of analysis.traversesAssociations) {
      facts.push({
        label: association,
        description: `Gebruikt de HubSpot-associatie ${association} in de service-logica.`,
        technicalDetail: analysis.functionName,
        evidence: [evidence("Runtime association", association, "runtime")],
      });
    }
  }

  return uniqueFacts(facts);
}

function buildComputeFacts(
  codePaths: PythonFunctionCodePath[],
  endpointAnalysis: RuntimeEndpointAnalysis | undefined,
  functionAnalyses: RuntimeFunctionAnalysis[],
): GitLabOperationFact[] {
  const facts: GitLabOperationFact[] = [];

  for (const path of codePaths) {
    if (/compute|build|create_dealname|deal_name|dealname|match|route|find|calculate|amount|pipeline/i.test(path.functionName)) {
      facts.push({
        label: humanizeIdentifier(path.functionName),
        description: `Voert de berekening of beslissing ${humanizeIdentifier(path.functionName)} uit.`,
        technicalDetail: `${path.file}:${path.lineno}`,
        evidence: [evidence("Codepad", path.functionName, "codepath")],
      });
    }
    for (const decision of path.decisions) {
      if (!isUsefulDecision(decision.condition)) continue;
      facts.push({
        label: "Beslisregel",
        description: describeDecision(decision.condition),
        technicalDetail: decision.condition,
        evidence: [evidence("If/else", decision.condition, "codepath")],
      });
    }
    for (const call of path.calls) {
      if (/_compute_|build_|create_|match_|find_|route_|calculate|dealname/i.test(call.name) && !isReadName(call.name, call.code) && !isWriteName(call.name, call.code)) {
        facts.push({
          label: humanizeIdentifier(call.name),
          description: `Gebruikt ${humanizeIdentifier(call.name)} om de juiste waarde of vervolgstap te bepalen.`,
          technicalDetail: call.code,
          evidence: [evidence("Code call", call.name, "codepath")],
        });
      }
    }
  }

  for (const item of endpointAnalysis?.temporalLogic ?? []) {
    facts.push({
      label: item,
      description: `Gebruikt ${item} als onderdeel van de backendbeslissing.`,
      technicalDetail: endpointAnalysis.handler,
      evidence: [evidence("Runtime logic", item, "runtime")],
    });
  }

  for (const analysis of functionAnalyses) {
    for (const item of analysis.temporalLogic) {
      facts.push({
        label: item,
        description: `Gebruikt ${item} in ${humanizeIdentifier(analysis.functionName)}.`,
        technicalDetail: analysis.functionName,
        evidence: [evidence("Runtime logic", item, "runtime")],
      });
    }
  }

  return uniqueFacts(facts);
}

function buildWriteFacts(
  endpointInfo: EndpointInfo,
  codePaths: PythonFunctionCodePath[],
  endpointAnalysis: RuntimeEndpointAnalysis | undefined,
  functionAnalyses: RuntimeFunctionAnalysis[],
): GitLabOperationFact[] {
  const facts: GitLabOperationFact[] = [];
  const writeCalls = allPythonCalls(codePaths).filter((call) => isWriteName(call.hubspotTarget || call.name, call.code));
  const payloadKeys = new Set(writeCalls.flatMap((call) => call.payloadKeys));
  const updateTarget = writeCalls.find((call) => call.hubspotTarget || /properties=\{/.test(call.code));

  if (payloadKeys.size > 0) {
    for (const key of payloadKeys) {
      facts.push({
        label: key === "dealname" ? "HubSpot deal property dealname" : `HubSpot property ${key}`,
        description: key === "dealname"
          ? "Past de HubSpot deal property dealname aan."
          : `Schrijft de HubSpot property ${key}.`,
        technicalDetail: updateTarget?.code,
        evidence: [evidence("Payload property", key, "codepath")],
      });
    }
  }

  for (const call of allPythonCalls(codePaths)) {
    const target = call.hubspotTarget || call.name;
    if (!isWriteName(target, call.code)) continue;
    facts.push({
      label: humanizeIdentifier(cleanHubSpotTarget(target)),
      description: describeWriteTarget(cleanHubSpotTarget(target), call.payloadKeys),
      technicalDetail: call.code,
      evidence: [evidence("Code call", target, "codepath")],
    });
  }

  for (const call of endpointInfo.calls) {
    if (!isCallGraphWrite(call)) continue;
    facts.push({
      label: humanizeIdentifier(getCallName(call)),
      description: describeWriteTarget(getCallName(call), []),
      technicalDetail: call.to,
      evidence: [evidence("Call graph", call.to, "call_graph")],
    });
  }

  for (const property of endpointAnalysis?.writesProperties ?? []) {
    facts.push({
      label: `HubSpot property ${property}`,
      description: `Schrijft of wijzigt de HubSpot property ${property}.`,
      technicalDetail: endpointAnalysis.handler,
      evidence: [evidence("Runtime write", property, "runtime")],
    });
  }

  for (const analysis of functionAnalyses) {
    for (const property of analysis.writesProperties) {
      facts.push({
        label: `HubSpot property ${property}`,
        description: `Schrijft of wijzigt de HubSpot property ${property} in ${humanizeIdentifier(analysis.functionName)}.`,
        technicalDetail: analysis.functionName,
        evidence: [evidence("Runtime write", property, "runtime")],
      });
    }
  }

  return uniqueFacts(facts);
}

function buildResponseFacts(endpointInfo: EndpointInfo, codePaths: PythonFunctionCodePath[]): GitLabOperationFact[] {
  const handlerPath = codePaths.find((path) => path.functionName === endpointInfo.handler) ?? codePaths[0];
  if (!handlerPath?.returns.length) return [];

  return [
    {
      label: "API response",
      description: "Geeft een HTTP-response terug zodra de handler klaar is met het aannemen of uitvoeren van de request.",
      technicalDetail: handlerPath.returns.map((item) => item.value || "return").join(", "),
      evidence: [evidence("Return", handlerPath.functionName, "codepath")],
    },
  ];
}

function buildBackgroundFacts(codePaths: PythonFunctionCodePath[], calls: GitLabCallInfo[]): GitLabOperationFact[] {
  const facts: GitLabOperationFact[] = [];
  for (const call of allPythonCalls(codePaths)) {
    if (!/background_tasks\.add_task/.test(call.name) && !/background_tasks\.add_task/.test(call.code)) continue;
    const taskName = call.code.match(/add_task\(([^,\s)]+)/)?.[1] ?? "background task";
    facts.push({
      label: taskName,
      description: "Start dit werk als achtergrondtaak, zodat de HTTP-response niet hoeft te wachten op de volledige verwerking.",
      technicalDetail: call.code,
      evidence: [evidence("Background task", taskName, "codepath")],
    });
  }

  for (const call of calls) {
    if (!/background/i.test(call.kind)) continue;
    facts.push({
      label: getCallName(call),
      description: "De call graph markeert deze stap als achtergrondwerk.",
      technicalDetail: call.to,
      evidence: [evidence("Call graph", call.kind, "call_graph")],
    });
  }

  return uniqueFacts(facts);
}

function determineConfidence(
  meaning: Pick<GitLabAutomationMeaningPresentation, "ontvangt" | "haaltOp" | "pastAan" | "stuurtTerug" | "backgroundWork">,
  codePaths: PythonFunctionCodePath[],
  endpointAnalysis: RuntimeEndpointAnalysis | undefined,
  curated: boolean,
): GitLabMeaningConfidence {
  const hasInput = meaning.ontvangt.length > 0;
  const hasRuntimeEffect = meaning.haaltOp.length > 0 || meaning.pastAan.length > 0;
  const hasCompletion = meaning.stuurtTerug.length > 0 || meaning.backgroundWork.length > 0;
  if ((curated || codePaths.length > 1) && hasInput && hasRuntimeEffect && hasCompletion) return "hoog";
  if (codePaths.length > 0 && hasRuntimeEffect) return "middel";
  if ((endpointAnalysis?.confidenceScore ?? 0) >= 0.75 && hasRuntimeEffect) return "middel";
  return "laag";
}

function buildGaps(
  meaning: Pick<GitLabAutomationMeaningPresentation, "ontvangt" | "haaltOp" | "pastAan" | "stuurtTerug" | "backgroundWork">,
  confidence: GitLabMeaningConfidence,
): string[] {
  const gaps: string[] = [];
  if (meaning.ontvangt.length === 0) gaps.push("Inputvelden niet bewezen in de beschikbare brondata.");
  if (meaning.haaltOp.length === 0) gaps.push("Concrete read-operaties niet bewezen in de beschikbare brondata.");
  if (meaning.pastAan.length === 0) gaps.push("Geen concrete write bewezen in de beschikbare brondata.");
  if (meaning.stuurtTerug.length === 0 && meaning.backgroundWork.length === 0) gaps.push("Response of achtergrondtaak niet concreet bewezen.");
  if (confidence === "laag") gaps.push("Analysekwaliteit laag: toon dit als gap in plaats van als harde claim.");
  return gaps;
}

function buildSummary(
  automation: Automatisering,
  endpointInfo: EndpointInfo,
  meaning: Pick<GitLabAutomationMeaningPresentation, "ontvangt" | "haaltOp" | "berekent" | "pastAan" | "stuurtTerug" | "backgroundWork">,
  confidence: GitLabMeaningConfidence,
): string {
  if (confidence === "laag") {
    return "Van deze automatisering is nog niet genoeg broninformatie beschikbaar om betrouwbaar te beschrijven welke gegevens worden opgehaald, bepaald of aangepast.";
  }

  const trigger = buildPlainTrigger(automation, endpointInfo);
  const reads = summarizePlainReads(meaning.haaltOp);
  const computes = summarizePlainComputes(meaning.berekent);
  const writes = summarizePlainWrites(meaning.pastAan);
  const writeDestination = inferPlainWriteDestination(automation, meaning.pastAan);
  const computeClause = computes ? `, bepaalt hij ${computes}` : "";
  const writeClause = writes
    ? `, en schrijft hij ${writes} terug naar ${writeDestination}`
    : ", en er is nog geen bewezen aanpassing zichtbaar";
  const backgroundClause = meaning.backgroundWork.length > 0
    ? " Het verdere werk gebeurt op de achtergrond, zodat het proces niet hoeft te wachten tot alles is verwerkt."
    : "";

  return `Wanneer ${trigger}, haalt deze automatisering ${reads} op uit HubSpot${computeClause}${writeClause}.${backgroundClause}`;
}

function buildPlainTrigger(automation: Automatisering, endpointInfo: EndpointInfo): string {
  const text = `${automation.naam} ${automation.doel} ${automation.trigger} ${endpointInfo.endpoint ?? ""} ${endpointInfo.handler ?? ""}`.toLowerCase();
  if (text.includes("contact") && text.includes("dealname")) return "de naam van een HubSpot-contact wijzigt";
  if (text.includes("company") && text.includes("dealname")) return "de naam van een HubSpot-bedrijf wijzigt";
  if (text.includes("clockify") && (text.includes("upsert") || text.includes("client"))) return "een HubSpot-bedrijf in Clockify moet worden bijgewerkt";
  if (text.includes("update_year") || text.includes("update year")) return "het jaar op een HubSpot-deal moet worden bijgewerkt";

  const trigger = automation.trigger.trim();
  if (trigger && !/(endpoint|api|post|get|put|patch|delete|\/|::|_)/i.test(trigger)) {
    return lowerFirst(stripTrailingPeriod(trigger));
  }

  const name = stripTechnicalText(automation.naam);
  return name ? `het proces "${name}" wordt gestart` : "deze stap in het proces wordt gestart";
}

function inferPlainWriteDestination(automation: Automatisering, facts: GitLabOperationFact[]): string {
  const text = `${automation.systemen.join(" ")} ${facts.map((fact) => `${fact.label} ${fact.description} ${fact.technicalDetail ?? ""}`).join(" ")}`.toLowerCase();
  if (text.includes("clockify")) return "Clockify";
  if (text.includes("wefact")) return "WeFact";
  if (text.includes("typeform")) return "Typeform";
  return "HubSpot";
}

function summarizePlainReads(facts: GitLabOperationFact[]): string {
  const values = facts.map((fact) => plainReadLabel(fact)).filter(Boolean);
  return joinDutch(uniqueStrings(values).slice(0, 3), "de benodigde gegevens");
}

function summarizePlainComputes(facts: GitLabOperationFact[]): string {
  const values = facts.map((fact) => plainComputeLabel(fact)).filter(Boolean);
  return joinDutch(uniqueStrings(values).slice(0, 2), "");
}

function summarizePlainWrites(facts: GitLabOperationFact[]): string {
  const values = facts.map((fact) => plainWriteLabel(fact)).filter(Boolean);
  return joinDutch(uniqueStrings(values).slice(0, 2), "");
}

function plainReadLabel(fact: GitLabOperationFact): string {
  const text = `${fact.label} ${fact.description} ${fact.technicalDetail ?? ""}`.toLowerCase();
  if (text.includes("gekoppelde deals") || text.includes("deals_for_contact") || text.includes("deals_for_company")) return "de gekoppelde deals";
  if (text.includes("contactgegevens") || text.includes("contact_info")) return "de contactgegevens";
  if (text.includes("bedrijfsgegevens") || text.includes("company_info")) return "de bedrijfsgegevens";
  if (text.includes("bestaande dealname") || text.includes("dealname")) return "de bestaande dealnaam";
  if (text.includes("get by id") || text.includes("get_by_id")) return "het bijbehorende record";
  if (text.includes("associated")) return "de gekoppelde records";
  return "";
}

function plainComputeLabel(fact: GitLabOperationFact): string {
  const text = `${fact.label} ${fact.description} ${fact.technicalDetail ?? ""}`.toLowerCase();
  if (text.includes("nieuwe dealnaam") || text.includes("deal name") || text.includes("deal names")) return "de nieuwe dealnaam";
  if (text.includes("year") || text.includes("jaar")) return "het juiste jaar";
  if (text.includes("period") || text.includes("date") || text.includes("cutoff")) return "de juiste periode";
  if (text.includes("geen gekoppelde deals")) return "of er gekoppelde deals zijn";
  if (text.includes("afwijkt") || text.includes("gelijk")) return "of er echt iets moet worden aangepast";
  return "";
}

function plainWriteLabel(fact: GitLabOperationFact): string {
  const text = `${fact.label} ${fact.description} ${fact.technicalDetail ?? ""}`.toLowerCase();
  if (text.includes("dealname")) return "de nieuwe dealnaam";
  if (text.includes("year") || text.includes("jaar")) return "het jaar";
  if (text.includes("deal")) return "de aangepaste dealgegevens";
  return "de aangepaste gegevens";
}

function joinDutch(values: string[], fallback: string): string {
  if (values.length === 0) return fallback;
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} en ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} en ${values.at(-1)}`;
}

function lowerFirst(value: string): string {
  return value ? `${value.charAt(0).toLocaleLowerCase("nl-NL")}${value.slice(1)}` : value;
}

function stripTrailingPeriod(value: string): string {
  return value.replace(/[.!?]\s*$/, "");
}

function stripTechnicalText(value: string): string {
  return stripTrailingPeriod(value)
    .replace(/\b(GET|POST|PUT|PATCH|DELETE)\b/gi, "")
    .replace(/\/[^\s)]+/g, "")
    .replace(/[A-Za-z0-9_./-]+::[A-Za-z0-9_./-]+/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEvidence(
  endpointInfo: EndpointInfo,
  codePaths: PythonFunctionCodePath[],
  endpointAnalysis: RuntimeEndpointAnalysis | undefined,
  functionAnalyses: RuntimeFunctionAnalysis[],
  curated: boolean,
): GitLabEvidenceItem[] {
  return [
    endpointInfo.endpoint ? evidence("Endpoint", formatEndpoint(endpointInfo), "call_graph") : null,
    endpointInfo.calls.length > 0 ? evidence("Call graph", `${endpointInfo.calls.length} calls`, "call_graph") : null,
    codePaths.length > 0 ? evidence("Codepad", `${codePaths.length} functies`, "codepath") : null,
    endpointAnalysis ? evidence("Runtime endpoint", endpointAnalysis.handler, "runtime") : null,
    functionAnalyses.length > 0 ? evidence("Runtime functies", `${functionAnalyses.length} functies`, "runtime") : null,
    curated ? evidence("Curated evidence", "Handmatig verrijkt waar de automatische analyse te weinig context geeft", "curated") : null,
  ].filter((item): item is GitLabEvidenceItem => Boolean(item));
}

function buildEvidenceBadges(evidenceItems: GitLabEvidenceItem[], confidence: GitLabMeaningConfidence): string[] {
  const badges = new Set<string>([`Analyse: ${confidence === "hoog" ? "Hoog" : confidence === "middel" ? "Middel" : "Laag"}`]);
  for (const item of evidenceItems) badges.add(item.label);
  return Array.from(badges);
}

function readFactFromPythonCall(call: PythonCodeCall, propertyHints: string[]): GitLabOperationFact {
  const target = cleanHubSpotTarget(call.hubspotTarget || call.name);
  return {
    label: humanizeIdentifier(target),
    description: describeReadTarget(target, propertyHintsForCall(call, propertyHints)),
    technicalDetail: call.code,
    evidence: [evidence("Code call", call.hubspotTarget || call.name, "codepath")],
  };
}

function describeReadTarget(target: string, properties: string[]): string {
  const lowered = target.toLowerCase();
  const propertyText = properties.length > 0 ? ` Gebruikte properties: ${properties.join(", ")}.` : "";
  if (lowered.includes("get_deals_for_contact")) return `Haalt gekoppelde HubSpot deals op voor het contact.${propertyText}`;
  if (lowered.includes("get_deals_for_company")) return `Haalt gekoppelde HubSpot deals op voor het bedrijf.${propertyText}`;
  if (lowered.includes("get_contact_info")) return `Haalt HubSpot contactgegevens op.${propertyText}`;
  if (lowered.includes("get_company_info")) return `Haalt HubSpot bedrijfsgegevens op.${propertyText}`;
  if (lowered.includes("batch_get_deals_info")) return `Haalt bestaande informatie van meerdere HubSpot deals op.${propertyText}`;
  if (lowered.includes("search")) return `Zoekt HubSpot-records op die nodig zijn voor deze verwerking.${propertyText}`;
  return `Leest HubSpot-data via ${humanizeIdentifier(target)}.${propertyText}`;
}

function describeWriteTarget(target: string, properties: string[]): string {
  const lowered = target.toLowerCase();
  const propertyText = properties.length > 0 ? ` Property: ${properties.join(", ")}.` : "";
  if (lowered.includes("batch_update_deals")) return `Batch-updatet HubSpot deals.${propertyText}`;
  if (lowered.includes("update_deal")) return `Werkt een HubSpot deal bij.${propertyText}`;
  if (lowered.includes("create_deal") || lowered.includes("batch_create_deals")) return `Maakt HubSpot dealrecords aan.${propertyText}`;
  if (lowered.includes("delete_deal")) return `Verwijdert of archiveert een HubSpot deal.${propertyText}`;
  if (lowered.includes("update")) return `Past HubSpot-data aan via ${humanizeIdentifier(target)}.${propertyText}`;
  return `Schrijft data terug via ${humanizeIdentifier(target)}.${propertyText}`;
}

function propertyHintsForCall(call: PythonCodeCall, allHints: string[]): string[] {
  const localHints = extractPropertyNamesFromText(call.code);
  if (localHints.length > 0) return localHints;
  const target = call.hubspotTarget.toLowerCase();
  if (target.includes("contact")) return allHints.filter((item) => ["firstname", "lastname", "email"].includes(item));
  if (target.includes("deal")) return allHints.filter((item) => item.includes("deal") || ["dealname", "amount", "dealstage", "pipeline"].includes(item));
  return [];
}

function allPythonCalls(codePaths: PythonFunctionCodePath[]): PythonCodeCall[] {
  return codePaths.flatMap((path) => path.calls);
}

function extractPropertyHints(codePaths: PythonFunctionCodePath[]): string[] {
  return uniqueStrings(codePaths.flatMap((path) => [
    ...path.calls.flatMap((call) => extractPropertyNamesFromText(call.code)),
    ...path.decisions.flatMap((decision) => extractPropertyNamesFromText(decision.condition)),
    ...path.returns.flatMap((item) => extractPropertyNamesFromText(item.value)),
  ]));
}

function extractPropertyNamesFromText(text: string): string[] {
  const values: string[] = [];
  for (const match of text.matchAll(/properties(?:\s+or\s+\{\})?\]\["([^"]+)"\]|properties\["([^"]+)"\]|\.get\("([^"]+)"\)|\["([a-zA-Z_][a-zA-Z0-9_]*)"\]/g)) {
    const value = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (value && !["message", "description", "detail"].includes(value)) values.push(value);
  }
  return uniqueStrings(values);
}

function extractArgPropertyAccesses(args: string[], code: string): string[] {
  const argSet = new Set(args);
  const fields: string[] = [];
  for (const match of code.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g)) {
    if (argSet.has(match[1]) && !IGNORED_INPUT_ARGS.has(match[1]) && !IGNORED_INPUT_ARGS.has(match[2])) fields.push(match[2]);
  }
  return uniqueStrings(fields);
}

function extractCalledFunctionNames(call: PythonCodeCall): string[] {
  const names = [call.name.split(".").at(-1) ?? call.name];
  for (const match of call.code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    names.push(match[1]);
  }
  for (const match of call.code.matchAll(/add_task\(([^,\s)]+)/g)) {
    names.push(match[1]);
  }
  return uniqueStrings(names.filter((name) => name.length > 2 && !IGNORED_FUNCTION_NAMES.has(name)));
}

function addCallFunctionName(names: Set<string>, callRef: string): void {
  const name = getCallName({ to: callRef } as GitLabCallInfo);
  if (name && !IGNORED_FUNCTION_NAMES.has(name)) names.add(name);
}

function isReadName(name: string, code: string): boolean {
  const text = `${name} ${code}`.toLowerCase();
  if (isWriteName(name, code)) return false;
  return /\b(get|fetch|search|read|list|batch_get|retrieve)\b|get_|fetch_|search_|batch_get|associations?/.test(text);
}

function isUsefulDecision(condition: string): boolean {
  return !/properties is None|response\.status_code|logger|print/i.test(condition);
}

function describeDecision(condition: string): string {
  if (/not\s+deal_ids/i.test(condition)) return "Stopt zonder update als er geen gekoppelde deals zijn.";
  if (/not\s+updates/i.test(condition)) return "Stopt zonder API-write als de nieuwe naam gelijk is aan de bestaande dealnaam.";
  if (/new_deal_name\s*!=\s*old_deal_name/i.test(condition)) return "Schrijft alleen een update wanneer de berekende dealnaam echt afwijkt.";
  return `Controleert: ${condition}.`;
}

function isWriteName(name: string, code: string): boolean {
  const text = `${name} ${code}`.toLowerCase();
  return /\b(update|create|delete|archive|upsert|patch|set|associate|batch_update|batch_create)\b|update_|create_|delete_|archive_|upsert_|batch_update|batch_create|properties=\{/.test(text);
}

function isCallGraphRead(call: GitLabCallInfo): boolean {
  const target = call.to.toLowerCase();
  return target.includes("hubspot") && isReadName(getCallName(call), call.to);
}

function isCallGraphWrite(call: GitLabCallInfo): boolean {
  const target = call.to.toLowerCase();
  return target.includes("hubspot") && isWriteName(getCallName(call), call.to);
}

function getCallName(call: Pick<GitLabCallInfo, "to">): string {
  return call.to.split("::").at(-1) ?? call.to.split(".").at(-1) ?? call.to;
}

function cleanHubSpotTarget(value: string): string {
  return value.replace(/^hubspot_calls\./, "").split(".").at(-1) ?? value;
}

function mergeFacts(primary: GitLabOperationFact[], fallback?: GitLabOperationFact[]): GitLabOperationFact[] {
  if (!fallback?.length) return uniqueFacts(primary ?? []);
  const fallbackLabels = new Set(fallback.map((fact) => fact.label));
  return uniqueFacts([...fallback, ...(primary ?? []).filter((fact) => !fallbackLabels.has(fact.label))]);
}

function uniqueFacts(facts: GitLabOperationFact[]): GitLabOperationFact[] {
  const seen = new Set<string>();
  const result: GitLabOperationFact[] = [];
  for (const fact of facts) {
    const key = `${fact.label}:${fact.description}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(fact);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function evidence(label: string, value: string, source: GitLabEvidenceSource): GitLabEvidenceItem {
  return { label, value, source };
}

function curatedFact(label: string, description: string, technicalDetail: string): GitLabOperationFact {
  return {
    label,
    description,
    technicalDetail,
    evidence: [evidence("Curated evidence", technicalDetail, "curated")],
  };
}

function summarizeFacts(facts: GitLabOperationFact[], fallback: string): string {
  if (facts.length === 0) return fallback;
  return facts.slice(0, 3).map((fact) => fact.label).join(", ");
}

function formatEndpoint(endpointInfo: EndpointInfo): string {
  return [endpointInfo.method, endpointInfo.endpoint].filter(Boolean).join(" ");
}

function inferHandlerFromExternalId(externalId?: string): string | undefined {
  return externalId?.split("::").at(0)?.split("/").at(-1)?.replace(/\.py$/, "");
}

function normalizePath(path?: string): string {
  return (path ?? "").replace(/\\/g, "/").replace(/^gitlabtest\//, "");
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/^hubspot_calls\./, "")
    .replace(/[_:./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
