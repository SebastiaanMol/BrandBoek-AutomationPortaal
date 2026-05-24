import type { Automatisering } from "./types";
import type { HubSpotWorkflowActionInfo, TypeformProcessStepInfo, ZapierProcessStepInfo } from "./types";
import { buildAutomationFunnel } from "./automationFunnel";
import type { AutomationFunnelStepKind } from "./automationFunnel";
import { getBackendAutomationTrace, type BackendAutomationTrace } from "./backendAutomationTrace";
import { displayAutomationName } from "./automationDisplay";
import { automationRuntimeRoleLabel } from "./automationRoles";
import {
  formatHubSpotTriggerSentence,
  getHubSpotWorkflowBranchPaths,
  type HubSpotBranchPath,
  isLegacyGitLabFileAutomation,
  type ProcessJourneyCopyContext,
} from "./processJourneyCopy";

export type FlowRuntimeStepType =
  | "signal"
  | "zapier_step"
  | "typeform_step"
  | "hubspot_workflow"
  | "hubspot_branching"
  | "gitlab_backend_block"
  | "gitlab_worker"
  | "automation"
  | "return_to_hubspot"
  | "state_write"
  | "emitted_signal"
  | "downstream";

export interface FlowRuntimeWorkerMiniStep {
  kind: AutomationFunnelStepKind;
  title: string;
  summary: string;
  technical?: Array<{ title: string; description: string; code?: string }>;
}

export interface FlowRuntimeWorker {
  id: string;
  automationId: string;
  title: string;
  description: string;
  evidence?: string;
  miniSteps: FlowRuntimeWorkerMiniStep[];
  backendTrace?: FlowRuntimeBackendTrace;
}

export interface FlowRuntimeBackendTrace {
  summary: string;
  decisions: string[];
  technicalSteps: Array<{ title: string; description: string; code?: string }>;
}

export interface FlowRuntimeHubSpotAction {
  id: string;
  label: string;
  title: string;
  description: string;
  tone: "update" | "route" | "workflow";
}

export interface FlowRuntimeStep {
  id: string;
  type: FlowRuntimeStepType;
  label: string;
  title: string;
  description: string;
  evidence?: string;
  transitionFromPrevious?: {
    label: string;
    description: string;
    evidence?: string;
  };
  automationId?: string;
  workers?: FlowRuntimeWorker[];
  branchPaths?: HubSpotBranchPath[];
  hubspotActions?: FlowRuntimeHubSpotAction[];
}

export interface RuntimeChainLink {
  sourceId: string;
  targetId: string;
}

export function isFlowRuntimeStepSelectedForAutomation(
  step: FlowRuntimeStep,
  automationId: string | null | undefined,
): boolean {
  if (!automationId) return false;
  const workerIds = step.workers?.map((worker) => worker.automationId) ?? [];
    const isAutomationStep =
    step.type === "zapier_step" ||
    step.type === "typeform_step" ||
    step.type === "hubspot_workflow" ||
    step.type === "gitlab_backend_block" ||
    step.type === "gitlab_worker" ||
    step.type === "automation";
  const isAutomationOutcomeStep =
    step.type === "return_to_hubspot" ||
    step.type === "state_write";

  return (
    ((isAutomationStep || isAutomationOutcomeStep) && step.automationId === automationId) ||
    workerIds.includes(automationId)
  );
}

export function countFlowRuntimeStepsForAutomation(
  steps: FlowRuntimeStep[],
  automationId: string | null | undefined,
): number {
  return steps.filter((step) => isFlowRuntimeStepSelectedForAutomation(step, automationId)).length;
}

export function getFlowRuntimeTransitionLabel(
  step: Pick<FlowRuntimeStep, "type" | "title" | "description" | "transitionFromPrevious">,
): string {
  const text = [
    step.type,
    step.title,
    step.description,
    step.transitionFromPrevious?.label,
    step.transitionFromPrevious?.description,
    step.transitionFromPrevious?.evidence,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (step.type === "gitlab_backend_block" || step.type === "gitlab_worker") {
    return "Overdracht naar backend";
  }

  if (step.type === "state_write") {
    return "Uitkomst vastgelegd";
  }

  if (step.type === "return_to_hubspot") {
    return text.includes("wefact") || text.includes("resultaat van verwerking")
      ? "Resultaat van verwerking"
      : "Terugkoppeling naar HubSpot";
  }

  if (text.includes("backend")) {
    return "Overdracht naar backend";
  }

  if (step.type === "zapier_step" || text.includes("zapier")) {
    return "Zapier-stap geactiveerd";
  }

  if (step.type === "typeform_step" || text.includes("typeform")) {
    return "Typeform-stap geactiveerd";
  }

  if (step.type === "hubspot_workflow" || text.includes("workflow")) {
    return "Workflow geactiveerd";
  }

  return "Volgende verwerking";
}

export function expandFlowAutomationIds(
  automationIds: string[],
  links: RuntimeChainLink[] = [],
  maxNodes = 30,
): string[] {
  const included = new Set(automationIds);
  let changed = true;

  while (changed && included.size < maxNodes) {
    changed = false;
    for (const link of links) {
      const touchesIncluded = included.has(link.sourceId) || included.has(link.targetId);
      if (!touchesIncluded) continue;

      if (!included.has(link.sourceId) && included.size < maxNodes) {
        included.add(link.sourceId);
        changed = true;
      }
      if (!included.has(link.targetId) && included.size < maxNodes) {
        included.add(link.targetId);
        changed = true;
      }
    }
  }

  if (included.size === automationIds.length) return automationIds;

  return orderAutomationIds([...included], automationIds, links);
}

export function buildFlowRuntimeChain(
  automationIds: string[],
  autoMap: Map<string, Automatisering>,
  context: ProcessJourneyCopyContext = {},
): FlowRuntimeStep[] {
  const rawAutomations = automationIds
    .map((id) => autoMap.get(id))
    .filter((automation): automation is Automatisering => automation !== undefined);
  const automations = orderAutomationsForRuntimeJourney(rawAutomations);

  if (automations.length === 0) return [];

  const steps: FlowRuntimeStep[] = [];
  const hasGitLabWorker = automations.some(
    (automation) => automation.source === "gitlab" || Boolean(automation.gitlabFilePath),
  );
  const firstSignal = inferSignal(automations[0]);
  const firstWorkflow = automations[0];
  steps.push({
    id: "signal-start",
    type: "signal",
    label: "Startsignaal",
    title: firstSignal,
    description: buildStartSignalDescription(firstWorkflow, context),
    evidence: buildStartSignalEvidence(firstWorkflow, context),
  });

  for (let index = 0; index < automations.length; index += 1) {
    const automation = automations[index];
    const role = automationRuntimeRoleLabel(automation);
    const isGitLab = automation.source === "gitlab" || Boolean(automation.gitlabFilePath);
    const isHubSpot = role === "HubSpot workflow";
    const funnel = buildAutomationFunnel(automation);

    if (isGitLab) {
      const gitlabAutomations: Automatisering[] = [];
      let cursor = index;

      while (cursor < automations.length) {
        const candidate = automations[cursor];
        const candidateIsGitLab = candidate.source === "gitlab" || Boolean(candidate.gitlabFilePath);
        if (!candidateIsGitLab) break;
        gitlabAutomations.push(candidate);
        cursor += 1;
      }

      const workers = gitlabAutomations.map(buildRuntimeWorker);
      const lastGitLabAutomation = gitlabAutomations.at(-1) ?? automation;
      const lastGitLabFunnel = buildAutomationFunnel(lastGitLabAutomation);
      const previousHubSpot = automations[index - 1];

      steps.push({
        id: `gitlab-backend-block-${gitlabAutomations.map((item) => item.id).join("-")}`,
        type: "gitlab_backend_block",
        label: "GitLab backendblok",
        title: gitlabAutomations.length === 1
          ? displayAutomationName(gitlabAutomations[0])
          : `${gitlabAutomations.length} gekoppelde GitLab automations`,
        description: gitlabAutomations.length === 1
          ? buildSingleGitLabBlockDescription(gitlabAutomations[0], previousHubSpot)
          : buildMultiGitLabBlockDescription(gitlabAutomations, previousHubSpot),
        evidence: gitlabAutomations.length === 1
          ? buildGitLabBlockEvidence(gitlabAutomations[0], previousHubSpot)
          : buildGitLabBlockEvidence(lastGitLabAutomation, previousHubSpot),
        transitionFromPrevious: buildBackendTransitionFromPrevious(
          previousHubSpot,
          gitlabAutomations[0],
        ),
        automationId: gitlabAutomations[0]?.id,
        workers,
      });

      const stateWrite = inferStateWrite(
        lastGitLabAutomation,
        automations[index - 1],
        lastGitLabFunnel?.hubspotWrites ?? [],
      );
      const hubspotWrites = lastGitLabFunnel?.hubspotWrites ?? [];
      const stateWriteEvidence = hubspotWrites.length
        ? lastGitLabFunnel.hubspotWrites.join(" ")
        : "Afgeleid uit de GitLab automation en omliggende startautomation.";

      if (hubspotWrites.length > 0) {
        steps.push({
          id: `return-to-hubspot-${lastGitLabAutomation.id}`,
          type: "return_to_hubspot",
          label: "Resultaat terug naar HubSpot",
          title: buildReturnToHubSpotTitle(stateWrite),
          description: buildReturnToHubSpotDescription(stateWrite),
          evidence: stateWriteEvidence,
          automationId: lastGitLabAutomation.id,
        });

        steps.push({
          id: `state-write-${lastGitLabAutomation.id}`,
          type: "state_write",
          label: "Eindpunt in HubSpot",
          title: `HubSpot registreert de uitkomst: ${stateWrite}`,
          description: buildStateWriteDescription(stateWrite),
          evidence: stateWriteEvidence,
          automationId: previousHubSpot?.id,
        });

        steps.push({
          id: `emitted-signal-${lastGitLabAutomation.id}`,
          type: "emitted_signal",
          label: "Uitgaand HubSpot-signaal",
          title: inferEmittedSignal(stateWrite),
          description: "Dit is de HubSpot-uitkomst die deze procesreis achterlaat. Een volgende procesreis wordt pas gekoppeld als deze exacte property/waarde matcht met de starttrigger van een andere HubSpot workflow.",
          evidence: "Afgeleid uit de HubSpot-update.",
          automationId: lastGitLabAutomation.id,
        });
      } else {
        const terminalOutcome = inferTerminalOutcome(lastGitLabAutomation);
        steps.push({
          id: `terminal-outcome-${lastGitLabAutomation.id}`,
          type: "state_write",
          label: "Einduitkomst",
          title: terminalOutcome.title,
          description: terminalOutcome.description,
          evidence: terminalOutcome.evidence,
          automationId: lastGitLabAutomation.id,
        });
      }

      index = cursor - 1;
      continue;
    }

    if (automation.source === "zapier" && automation.importProposal?.zap?.process?.steps?.length) {
      steps.push(...buildZapierRuntimeSteps(automation));
      continue;
    }

    if (automation.source === "typeform" && automation.importProposal?.typeform?.process?.steps?.length) {
      steps.push(...buildTypeformRuntimeSteps(automation));
      continue;
    }

    steps.push({
      id: `automation-${automation.id}`,
      type: isHubSpot ? "hubspot_workflow" : "automation",
      label: role,
      title: automation.naam,
      description: hasGitLabWorker
          ? buildHubSpotWorkflowDescription(automation, automations[index + 1], context, isHubSpot && index === 0)
          : buildHubSpotWorkflowDescription(automation, undefined, context, isHubSpot && index === 0),
      evidence: buildHubSpotWorkflowEvidence(automation, context, isHubSpot && index === 0),
      automationId: automation.id,
      hubspotActions: isHubSpot ? buildHubSpotNativeActions(automation) : undefined,
    });

    const branchPaths = isHubSpot ? getHubSpotWorkflowBranchPaths(automation, context) : [];
    if (branchPaths.length > 0) {
      steps.push({
        id: `hubspot-branching-${automation.id}`,
        type: "hubspot_branching",
        label: "HubSpot vertakking",
        title: `${branchPaths.length} paden op basis van de gekozen waarde`,
        description: "HubSpot kiest eerst het juiste pad en voert per pad een eigen update en webhook uit.",
        evidence: "Afgeleid uit de HubSpot workflow-branches en herhaalde acties per pad.",
        automationId: automation.id,
        branchPaths,
      });
    }
  }

  const downstreamProof = buildBackendWriteProof(automations);
  steps.push({
    id: "downstream-end",
    type: "downstream",
    label: "Gekoppelde volgende procesreis",
    title: downstreamProof.hasHubSpotWrite ? "Nog geen vervolgproces gekoppeld" : "Geen vervolgproces bewezen",
    description: buildDownstreamDescription(automations, downstreamProof),
    evidence: buildDownstreamEvidence(automations, downstreamProof),
  });

  return steps;
}

function orderAutomationsForRuntimeJourney(automations: Automatisering[]): Automatisering[] {
  if (automations.length < 2) return automations;

  const idSet = new Set(automations.map((automation) => automation.id));
  const baseIndex = new Map(automations.map((automation, index) => [automation.id, index]));
  const outgoing = new Map(automations.map((automation) => [automation.id, [] as string[]]));
  const indegree = new Map(automations.map((automation) => [automation.id, 0]));

  for (const source of automations) {
    for (const target of automations) {
      if (source.id === target.id || !isGitLab(target)) continue;
      const handoff = getExactWebhookAction(source, target);
      if (!handoff) continue;
      outgoing.get(source.id)?.push(target.id);
      indegree.set(target.id, (indegree.get(target.id) ?? 0) + 1);
    }
  }

  const hasHandoffs = [...outgoing.values()].some((targets) => targets.length > 0);
  if (!hasHandoffs) return automations;

  const compare = (a: string, b: string) => (baseIndex.get(a) ?? 0) - (baseIndex.get(b) ?? 0);
  const byId = new Map(automations.map((automation) => [automation.id, automation]));
  const queue = automations
    .map((automation) => automation.id)
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort(compare);
  const orderedIds: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    orderedIds.push(id);
    for (const targetId of outgoing.get(id) ?? []) {
      const next = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, next);
      if (next === 0) queue.push(targetId);
    }
    queue.sort(compare);
  }

  if (orderedIds.length !== automations.length) return automations;
  return orderedIds
    .filter((id) => idSet.has(id))
    .map((id) => byId.get(id))
    .filter((automation): automation is Automatisering => automation !== undefined);
}

function buildZapierRuntimeSteps(automation: Automatisering): FlowRuntimeStep[] {
  const zapierSteps = automation.importProposal?.zap?.process?.steps ?? [];
  return zapierSteps.map((zapierStep, index) => ({
    id: `zapier-step-${automation.id}-${zapierStep.index}`,
    type: "zapier_step",
    label: zapierStep.kind === "webhook" ? "Zapier overdracht" : "Zapier stap",
    title: buildZapierStepTitle(zapierStep),
    description: buildZapierStepDescription(zapierStep, automation),
    evidence: buildZapierStepEvidence(zapierStep, automation),
    transitionFromPrevious: index > 0
      ? {
          label: `Van stap ${index} naar stap ${index + 1}`,
          description: "Zapier voert de volgende actie in dezelfde Zap uit.",
          evidence: `Bron: Zapier export "${automation.naam}", stap ${zapierStep.index}.`,
        }
      : undefined,
    automationId: automation.id,
  }));
}

function buildZapierStepTitle(step: ZapierProcessStepInfo): string {
  if (step.kind === "webhook") {
    return "Geeft gegevens door aan de backendverwerking";
  }
  return step.summary;
}

function buildZapierStepDescription(step: ZapierProcessStepInfo, automation: Automatisering): string {
  if (step.kind === "webhook") {
    return "Zapier geeft de gegevens door aan de volgende verwerking. De exacte technische koppeling staat onder Logica.";
  }
  if (step.kind === "email") {
    return "Zapier verstuurt een e-mail als onderdeel van deze automation.";
  }
  if (step.kind === "condition" || step.kind === "branch") {
    return "Zapier bepaalt via deze voorwaarde welk pad de automation volgt.";
  }
  if (step.kind === "lookup") {
    return "Zapier haalt extra gegevens op die nodig zijn voor de volgende stap.";
  }
  return step.details[0] ?? automation.doel ?? "Zapier voert deze processtap uit.";
}

function buildZapierStepEvidence(step: ZapierProcessStepInfo, automation: Automatisering): string {
  const details = step.details.length > 0 ? ` Details: ${step.details.join(" ")}` : "";
  const webhookPaths = step.webhookPaths.length > 0
    ? ` Technische koppeling: ${step.webhookPaths.join(", ")}.`
    : "";
  return `Bron: Zapier export "${automation.naam}", stap ${step.index} (${step.appName}).${details}${webhookPaths}`;
}

function buildTypeformRuntimeSteps(automation: Automatisering): FlowRuntimeStep[] {
  const typeformSteps = automation.importProposal?.typeform?.process?.steps ?? [];
  return typeformSteps.map((typeformStep, index) => ({
    id: `typeform-step-${automation.id}-${typeformStep.index}`,
    type: "typeform_step",
    label: typeformStep.kind === "webhook" ? "Typeform overdracht" : "Typeform stap",
    title: buildTypeformStepTitle(typeformStep),
    description: buildTypeformStepDescription(typeformStep, automation),
    evidence: buildTypeformStepEvidence(typeformStep, automation),
    transitionFromPrevious: index > 0
      ? {
          label: `Typeform verwerkt formulierinzending`,
          description: "Typeform gaat door met de volgende bekende stap uit dezelfde formulierkoppeling.",
          evidence: `Bron: Typeform API-uitlezing "${automation.naam}", stap ${typeformStep.index}.`,
        }
      : undefined,
    automationId: automation.id,
  }));
}

function buildTypeformStepTitle(step: TypeformProcessStepInfo): string {
  return step.title || step.summary;
}

function buildTypeformStepDescription(step: TypeformProcessStepInfo, automation: Automatisering): string {
  if (step.kind === "webhook") {
    return "Typeform geeft de formulierinzending door aan de volgende verwerking. De technische koppeling staat onder Logica.";
  }
  if (step.kind === "form_submission") {
    return step.summary || `Een klant vult het Typeform formulier "${automation.naam}" in.`;
  }
  return step.details[0] ?? automation.doel ?? "Typeform voert deze processtap uit.";
}

function buildTypeformStepEvidence(step: TypeformProcessStepInfo, automation: Automatisering): string {
  const details = step.details.length > 0 ? ` Details: ${step.details.join(" ")}` : "";
  const webhookPaths = step.webhookPaths.length > 0
    ? ` Technische koppeling: ${step.webhookPaths.join(", ")}.`
    : "";
  return `Bron: Typeform API-uitlezing "${automation.naam}", stap ${step.index}.${details}${webhookPaths}`;
}

function buildBackendTransitionFromPrevious(
  previousAutomation: Automatisering | undefined,
  backendAutomation: Automatisering | undefined,
): FlowRuntimeStep["transitionFromPrevious"] {
  if (!previousAutomation || !backendAutomation) return undefined;

  const previousVisibleStepCount = previousAutomation.source === "zapier"
    ? previousAutomation.importProposal?.zap?.process?.steps?.length ?? 1
    : 1;
  const label = `Van stap ${previousVisibleStepCount} naar stap ${previousVisibleStepCount + 1}`;

  if (previousAutomation.source === "zapier") {
    const webhook = getPrimaryWebhookAction(previousAutomation, backendAutomation);
    const endpoint = webhook?.webhookPath ?? webhook?.webhookUrl ?? backendAutomation.gitlabEndpoint?.endpoint;
    return {
      label,
      description: `Webhook-match: Zapier geeft deze stap door aan de backendverwerking "${displayAutomationName(backendAutomation)}".`,
      evidence: endpoint ? `Bewezen webhookkoppeling: ${endpoint}.` : "Bewezen op basis van de gekoppelde Zapier- en backendautomation.",
    };
  }

  if (previousAutomation.source === "typeform") {
    const webhook = getPrimaryWebhookAction(previousAutomation, backendAutomation);
    const endpoint = webhook?.webhookPath ?? webhook?.webhookUrl ?? backendAutomation.gitlabEndpoint?.endpoint;
    return {
      label: "Overdracht naar backend",
      description: `Webhook-match: Typeform geeft de formulierinzending door aan de backendverwerking "${displayAutomationName(backendAutomation)}".`,
      evidence: endpoint ? `Bewezen webhookkoppeling: ${endpoint}.` : "Bewezen op basis van de gekoppelde Typeform- en backendautomation.",
    };
  }

  const webhook = getPrimaryWebhookAction(previousAutomation, backendAutomation);
  if (!webhook) return undefined;

  return {
    label,
    description: `${sourceSystemLabel(previousAutomation)} geeft het werk door aan de backendverwerking "${displayAutomationName(backendAutomation)}".`,
    evidence: `Webhookactie: ${webhook.webhookPath ?? webhook.webhookUrl}.`,
  };
}

function buildHubSpotNativeActions(automation: Automatisering): FlowRuntimeHubSpotAction[] {
  const actions = automation.hubspotWorkflow?.actions ?? [];
  return actions
    .filter(isUsefulHubSpotAction)
    .slice(0, 8)
    .map((action) => {
      const tone = inferHubSpotActionTone(action);
      return {
        id: `${automation.id}-hubspot-action-${action.index}-${action.type}`,
        label: buildHubSpotActionLabel(action, tone),
        title: buildHubSpotActionTitle(action),
        description: buildHubSpotActionDescription(action),
        tone,
      };
    });
}

function isUsefulHubSpotAction(action: HubSpotWorkflowActionInfo): boolean {
  const text = `${action.type} ${action.label} ${action.propertyName ?? ""} ${action.webhookPath ?? ""}`.toLowerCase();
  return Boolean(action.label || action.propertyName || action.webhookPath) && !text.includes("delay");
}

function buildHubSpotActionTitle(action: HubSpotWorkflowActionInfo): string {
  const type = `${action.type} ${action.label}`.toLowerCase();
  if (action.propertyName) return `Zet ${prettifyHubSpotProperty(action.propertyName)}`;
  if (action.webhookPath || type.includes("webhook")) return "Stuurt de verwerking aan";
  if (action.enrollWorkflowId || type.includes("workflow")) return "Start of gebruikt een andere HubSpot workflow";
  if (type.includes("branch")) return "Kiest het juiste pad";
  return action.label || "Voert HubSpot actie uit";
}

function buildHubSpotActionLabel(
  action: HubSpotWorkflowActionInfo,
  tone: FlowRuntimeHubSpotAction["tone"],
): string {
  if (tone === "route") return "Webhookactie";
  if (action.propertyName) return "Actie in HubSpot";
  return `HubSpot actie ${action.index + 1}`;
}

function buildHubSpotActionDescription(action: HubSpotWorkflowActionInfo): string {
  if (action.propertyName) {
    const value = action.propertyValue === undefined || action.propertyValue === null || action.propertyValue === ""
      ? "een nieuwe waarde"
      : String(action.propertyValue);
    return `HubSpot werkt het veld "${prettifyHubSpotProperty(action.propertyName)}" bij naar "${value}".`;
  }
  if (action.webhookPath || action.webhookUrl || /webhook/i.test(action.type) || /webhook/i.test(action.label)) {
    return "Een HubSpot-terugschrijving wordt alleen getoond als die uit de code blijkt.";
  }
  if (action.enrollWorkflowId) {
    return "HubSpot zet het record door naar een andere workflow binnen HubSpot.";
  }
  return action.label || "HubSpot voert deze stap uit binnen de workflow.";
}

function inferHubSpotActionTone(action: HubSpotWorkflowActionInfo): FlowRuntimeHubSpotAction["tone"] {
  if (action.propertyName) return "update";
  if (action.webhookPath || action.webhookUrl || /webhook/i.test(action.type) || /webhook/i.test(action.label)) return "route";
  return "workflow";
}

function prettifyHubSpotProperty(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\bIB\b/i, "IB")
    .replace(/\bJR\b/i, "JR");
}

function buildDownstreamDescription(
  automations: Automatisering[],
  proof = buildBackendWriteProof(automations),
): string {
  if (proof.hasHubSpotWrite) {
    return "De procesreis eindigt hier met een bewezen HubSpot-update vanuit het backendpad. Een volgende procesreis wordt pas gekoppeld wanneer de exacte property/waarde uit de code is bewezen en matcht met de starttrigger van een andere HubSpot workflow.";
  }

  return "Er is geen bewezen vervolgtrigger gevonden op basis van deze einduitkomst. Daarom wordt er geen volgende procesreis gekoppeld.";
}

function buildDownstreamEvidence(
  automations: Automatisering[],
  proof = buildBackendWriteProof(automations),
): string {
  if (!proof.hasHubSpotWrite) {
    return "Nog niet bewezen: exacte property, waarde, dealstage, workflowtrigger of codekoppeling die na deze einduitkomst een volgende procesreis start.";
  }

  return [
    proof.endpoint ? `Bewezen endpoint: ${proof.endpoint}.` : "",
    proof.handler ? `Bewezen handler: ${proof.handler}.` : "",
    proof.writeCalls.length > 0 ? `Codepad schrijft naar HubSpot via: ${proof.writeCalls.join(", ")}.` : "",
    "Nog niet bewezen: exacte HubSpot property/waarde waarop een andere workflow start.",
  ].filter(Boolean).join(" ");
}

function buildBackendWriteProof(automations: Automatisering[]): {
  hasHubSpotWrite: boolean;
  endpoint?: string;
  handler?: string;
  writeCalls: string[];
} {
  const gitlabAutomations = automations.filter(isGitLab);
  const firstEndpointAutomation = gitlabAutomations.find((automation) => automation.gitlabEndpoint?.endpoint);
  const writeCalls = gitlabAutomations.flatMap((automation) =>
    (automation.gitlabEndpoint?.calls ?? [])
      .filter((call) => call.kind === "hubspot_repository_call" && isHubSpotWriteCall(call.to))
      .map((call) => call.to.split("::").at(-1) ?? call.to),
  ).filter(uniqueString);

  return {
    hasHubSpotWrite: writeCalls.length > 0,
    endpoint: firstEndpointAutomation
      ? [firstEndpointAutomation.gitlabEndpoint?.method, firstEndpointAutomation.gitlabEndpoint?.endpoint].filter(Boolean).join(" ")
      : undefined,
    handler: firstEndpointAutomation?.gitlabEndpoint?.handler,
    writeCalls,
  };
}

function isHubSpotWriteCall(target: string): boolean {
  const name = target.toLowerCase();
  return /(^|[.:_])(update|create|archive|delete|add|set|patch|upsert)([.:_]|$)/.test(name);
}

function uniqueString(value: string, index: number, all: string[]): boolean {
  return all.indexOf(value) === index;
}

function buildStartSignalDescription(automation: Automatisering, context: ProcessJourneyCopyContext): string {
  if (isGitLab(automation)) {
    const endpoint = getGitLabEndpointLabel(automation);
    return endpoint
      ? `GitLab backendautomation "${displayAutomationName(automation)}" wordt direct aangeroepen via ${endpoint}.`
      : `GitLab backendautomation "${displayAutomationName(automation)}" wordt direct aangeroepen.`;
  }

  if (automation.source === "zapier") {
    return automation.trigger && automation.trigger !== "Onbekend"
      ? `Zapier automation "${automation.naam}" start op trigger: ${automation.trigger}.`
      : `Zapier automation "${automation.naam}" is het eerste bekende startpunt in deze procesreis.`;
  }

  if (automation.source === "typeform") {
    const processTrigger = automation.importProposal?.typeform?.process?.trigger;
    return processTrigger
      ? `Typeform formulier "${automation.naam}" start wanneer het formulier wordt ingevuld. ${processTrigger}`
      : `Typeform formulier "${automation.naam}" is het eerste bekende startpunt in deze procesreis.`;
  }

  const trigger = getPrimaryHubSpotTrigger(automation);
  if (trigger) {
    return `HubSpot workflow "${automation.naam}" start wanneer ${trigger.label}.`;
  }

  const simpleTrigger = getSimpleTriggerSentence(automation, context);
  if (simpleTrigger) {
    return `HubSpot workflow "${automation.naam}" ${lowercaseStart(simpleTrigger)}.`;
  }

  return automation.trigger && automation.trigger !== "Onbekend"
    ? `HubSpot workflow "${automation.naam}" start op trigger: ${automation.trigger}.`
    : `HubSpot workflow "${automation.naam}" is het eerste bekende startpunt in deze procesreis.`;
}

function buildStartSignalEvidence(automation: Automatisering, context: ProcessJourneyCopyContext): string {
  if (isGitLab(automation)) {
    return getGitLabEndpointLabel(automation)
      ? `Bron: GitLab endpointanalyse. ${getGitLabEndpointLabel(automation)}.`
      : "Bron: GitLab automationmetadata. Er is geen upstream workflow of Zapier automation bewezen.";
  }

  if (automation.source === "zapier") {
    return "Bron: Zapier export. De exacte webhookkoppeling wordt apart bewezen via endpoint-match.";
  }

  if (automation.source === "typeform") {
    return "Bron: Typeform API-uitlezing. De exacte webhookkoppeling wordt apart bewezen via endpoint-match.";
  }

  const trigger = getPrimaryHubSpotTrigger(automation);
  if (trigger) {
    return [
      `Bron: HubSpot workflowdefinitie (${trigger.source}).`,
      trigger.property ? `Property: ${trigger.property}.` : "",
      trigger.operator ? `Operator: ${trigger.operator}.` : "",
      trigger.value != null ? `Waarde: ${trigger.value}.` : "",
    ].filter(Boolean).join(" ");
  }

  const simpleTrigger = getSimpleTriggerSentence(automation, context);
  if (simpleTrigger) {
    return `Bron: HubSpot sync-uitlezing. ${simpleTrigger}.`;
  }

  return "Bron: HubSpot metadata. Exacte triggercriteria zijn nog niet uitgelezen voor deze workflow.";
}

function buildHubSpotWorkflowDescription(
  automation: Automatisering,
  nextAutomation?: Automatisering,
  context: ProcessJourneyCopyContext = {},
  triggerAlreadyShown = false,
): string {
  if (automation.source === "zapier") {
    return buildZapierAutomationDescription(automation, nextAutomation, triggerAlreadyShown);
  }

  const trigger = getPrimaryHubSpotTrigger(automation);
  const simpleTrigger = getSimpleTriggerSentence(automation, context);
  const webhook = getPrimaryWebhookAction(automation, nextAutomation);
  const parts = [
    triggerAlreadyShown
      ? "Start door het startsignaal uit stap 1."
      : trigger
      ? `Start op: ${trigger.label}.`
      : simpleTrigger
        ? `${simpleTrigger}.`
        : automation.trigger && automation.trigger !== "Onbekend"
          ? `Start op: ${automation.trigger}.`
        : "",
    webhook
      ? "Geeft het werk door aan de backendverwerking."
      : "",
    nextAutomation && isGitLab(nextAutomation)
      ? `Die overdracht is gekoppeld aan GitLab automation "${nextAutomation.naam}".`
      : "",
  ];

  return parts.filter(Boolean).join(" ") || automation.doel || "Deze HubSpot workflow routeert de volgende stap.";
}

function buildHubSpotWorkflowEvidence(
  automation: Automatisering,
  context: ProcessJourneyCopyContext,
  triggerAlreadyShown = false,
): string {
  if (automation.source === "zapier") {
    return `Bron: Zapier export "${automation.naam}". Webhook-match bepaalt of deze automation aan een backendstap wordt voorgesteld.`;
  }

  const trigger = getPrimaryHubSpotTrigger(automation);
  const simpleTrigger = getSimpleTriggerSentence(automation, context);
  const webhook = getPrimaryWebhookAction(automation);
  const parts = [
    `Bron: HubSpot workflow "${automation.naam}"${automation.externalId ? ` (${automation.externalId})` : ""}.`,
    triggerAlreadyShown
      ? "Trigger: dezelfde triggercriteria als het startsignaal in stap 1."
      : trigger ? `Trigger: ${trigger.label}.` : simpleTrigger ? `Trigger: ${simpleTrigger}.` : "",
    webhook ? `Actie ${webhook.index}: ${webhook.label}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

function buildZapierAutomationDescription(
  automation: Automatisering,
  nextAutomation?: Automatisering,
  triggerAlreadyShown = false,
): string {
  const webhook = getPrimaryWebhookAction(automation, nextAutomation);
  const parts = [
    triggerAlreadyShown
      ? "Start door het startsignaal uit stap 1."
      : automation.trigger && automation.trigger !== "Onbekend"
        ? `Start op: ${automation.trigger}.`
        : "",
    webhook
      ? "Zapier geeft het werk door aan de backendverwerking."
      : "",
    nextAutomation && isGitLab(nextAutomation)
      ? `Die overdracht is gekoppeld aan GitLab automation "${nextAutomation.naam}".`
      : "",
  ];

  return parts.filter(Boolean).join(" ") || automation.doel || "Deze Zapier automation routeert de volgende stap.";
}

function buildSingleGitLabBlockDescription(automation: Automatisering, previousAutomation?: Automatisering): string {
  const previousLabel = previousAutomation ? sourceSystemLabel(previousAutomation) : "De vorige automation";
  return [
    previousAutomation ? `${previousLabel} "${previousAutomation.naam}" geeft gegevens door aan deze backend automation.` : "",
    "De backend verwerkt de aangeleverde gegevens en bepaalt welke klant-, deal- of dossierinformatie moet worden bijgewerkt.",
    "Technische endpoint- en handlerdetails staan onder Logica.",
  ].filter(Boolean).join(" ");
}

function buildMultiGitLabBlockDescription(automations: Automatisering[], previousAutomation?: Automatisering): string {
  const previousLabel = previousAutomation ? sourceSystemLabel(previousAutomation) : "De vorige automation";
  return [
    previousAutomation ? `${previousLabel} "${previousAutomation.naam}" start dit backendblok.` : "",
    `Daarna werken ${automations.length} GitLab automations samen aan dezelfde backendverwerking.`,
    "Technische endpoint- en handlerdetails staan onder Logica.",
  ].filter(Boolean).join(" ");
}

function buildGitLabBlockEvidence(automation: Automatisering, previousAutomation?: Automatisering): string {
  const webhook = previousAutomation ? getPrimaryWebhookAction(previousAutomation, automation) : undefined;
  const endpoint = getGitLabEndpointLabel(automation, webhook?.webhookPath ?? webhook?.webhookUrl, webhook?.webhookMethod);
  const previousLabel = previousAutomation ? sourceSystemLabel(previousAutomation) : "vorige automation";
  return [
    webhook ? `Webhookactie vanuit ${previousLabel}: ${webhook.webhookPath ?? webhook.webhookUrl}.` : "",
    endpoint ? `GitLab endpoint/handler: ${endpoint}.` : "",
    automation.gitlabFilePath ? `Bestand: ${automation.gitlabFilePath}.` : "",
  ].filter(Boolean).join(" ") || "Gebaseerd op gekoppelde GitLab automation metadata.";
}

function sourceSystemLabel(automation: Automatisering): string {
  if (automation.source === "zapier") return "Zapier automation";
  if (automation.source === "typeform") return "Typeform formulier";
  if (automation.source === "hubspot") return "HubSpot workflow";
  if (automation.source === "gitlab" || Boolean(automation.gitlabFilePath)) return "GitLab automation";
  return "Automation";
}

function getPrimaryHubSpotTrigger(automation: Automatisering) {
  return automation.hubspotWorkflow?.triggers?.[0];
}

function getPrimaryWebhookAction(automation: Automatisering, target?: Automatisering) {
  const webhooks = (automation.hubspotWorkflow?.actions ?? []).filter((action) => action.webhookUrl || action.webhookPath);
  const fallbackWebhooks = (automation.webhookPaths ?? []).map((path, index) => ({
    index: index + 1,
    type: "WEBHOOK",
    label: `Webhook naar ${path}`,
    webhookMethod: "POST",
    webhookPath: path,
    webhookUrl: path,
  }));
  const candidates = webhooks.length > 0 ? webhooks : fallbackWebhooks;
  if (!target) return candidates[0];

  const targetEndpoint = target.gitlabEndpoint?.endpoint ?? target.endpoints?.[0] ?? target.externalId?.split("::").at(1);
  if (!targetEndpoint) return candidates[0];

  return candidates.find((action) => {
    const path = action.webhookPath ?? action.webhookUrl ?? "";
    return path.includes(targetEndpoint) || targetEndpoint.includes(path);
  }) ?? candidates[0];
}

function getExactWebhookAction(automation: Automatisering, target: Automatisering) {
  const webhooks = (automation.hubspotWorkflow?.actions ?? []).filter((action) => action.webhookUrl || action.webhookPath);
  const fallbackWebhooks = (automation.webhookPaths ?? []).map((path, index) => ({
    index: index + 1,
    type: "WEBHOOK",
    label: `Webhook naar ${path}`,
    webhookMethod: "POST",
    webhookPath: path,
    webhookUrl: path,
  }));
  const candidates = webhooks.length > 0 ? webhooks : fallbackWebhooks;
  const targetEndpoint = target.gitlabEndpoint?.endpoint ?? target.endpoints?.[0] ?? target.externalId?.split("::").at(1);
  if (!targetEndpoint) return undefined;

  return candidates.find((action) => {
    const path = action.webhookPath ?? action.webhookUrl ?? "";
    return Boolean(path) && (path.includes(targetEndpoint) || targetEndpoint.includes(path));
  });
}

function getSimpleTriggerSentence(
  automation: Automatisering,
  context: ProcessJourneyCopyContext = {},
): string | undefined {
  return formatHubSpotTriggerSentence(automation, context);
}

function lowercaseStart(value: string): string {
  if (!value.toLowerCase().startsWith("start ")) return value;
  return `start ${value.slice("Start ".length)}`;
}

function getGitLabEndpointLabel(
  automation: Automatisering,
  preferredEndpoint?: string | null,
  preferredMethod?: string | null,
): string {
  const hasSpecificEndpoint = Boolean(preferredEndpoint) || !isLegacyGitLabFileAutomation(automation);
  const method = preferredMethod ?? automation.gitlabEndpoint?.method ?? undefined;
  const endpoint = preferredEndpoint
    ?? (hasSpecificEndpoint
      ? automation.gitlabEndpoint?.endpoint
        ?? automation.endpoints?.[0]
        ?? automation.externalId?.split("::").at(1)
      : undefined);
  const handler = automation.gitlabEndpoint?.handler;
  return [
    method && endpoint ? `${method} ${endpoint}` : endpoint,
    handler ? `handler ${handler}` : "",
  ].filter(Boolean).join(", ");
}

function isGitLab(automation: Automatisering): boolean {
  return automation.source === "gitlab" || Boolean(automation.gitlabFilePath);
}

function buildRuntimeWorker(automation: Automatisering): FlowRuntimeWorker {
  const funnel = buildAutomationFunnel(automation);
  const backendTrace = getBackendAutomationTrace(automation);
  return {
    id: `worker-${automation.id}`,
    automationId: automation.id,
    title: displayAutomationName(automation),
    description: buildGitLabWorkerDescription(automation, funnel, backendTrace),
    evidence: backendTrace?.evidence.map((item) => `${item.label}: ${item.value}.`).join(" ")
      ?? funnel?.runtimeRole
      ?? "Gebaseerd op het GitLab endpoint/handler van deze automation.",
    miniSteps: backendTrace
      ? buildBackendTraceMiniSteps(backendTrace)
      : (funnel?.steps ?? [])
          .filter((step) => ["start", "read", "compute", "write", "downstream"].includes(step.kind))
          .map((step) => ({
            kind: step.kind,
            title: step.title,
            summary: step.summary,
          })),
    backendTrace: backendTrace ? {
      summary: backendTrace.summary,
      decisions: backendTrace.decisions,
      technicalSteps: backendTrace.technicalSteps,
    } : undefined,
  };
}

function buildBackendTraceMiniSteps(trace: BackendAutomationTrace): FlowRuntimeWorkerMiniStep[] {
  return trace.plainSteps
    .filter((step) => !/backend automation wordt gestart|api-handler ontvangt|endpoint-call wordt afgerond/i.test(step.title))
    .slice(0, 12)
    .map((step) => ({
      kind: classifyBackendTraceStep(step.title),
      title: step.title,
      summary: step.description,
      technical: step.technical,
    }));
}

function classifyBackendTraceStep(title: string): AutomationFunnelStepKind {
  const lower = title.toLowerCase();
  if (lower.includes("start") || lower.includes("ontvangt") || lower.includes("handler")) return "start";
  if (lower.includes("leest") || lower.includes("context")) return "read";
  if (lower.includes("beslissing") || lower.includes("berekent") || lower.includes("procesregels") || lower.includes("subacties")) return "compute";
  if (lower.includes("schrijft") || lower.includes("wijzigt") || lower.includes("hubspot-status")) return "write";
  return "compute";
}

function orderAutomationIds(
  ids: string[],
  baseOrder: string[],
  links: RuntimeChainLink[],
): string[] {
  const idSet = new Set(ids);
  const baseIndex = new Map(baseOrder.map((id, index) => [id, index]));
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  const indegree = new Map(ids.map((id) => [id, 0]));

  for (const link of links) {
    if (!idSet.has(link.sourceId) || !idSet.has(link.targetId)) continue;
    outgoing.get(link.sourceId)?.push(link.targetId);
    indegree.set(link.targetId, (indegree.get(link.targetId) ?? 0) + 1);
  }

  const compare = (a: string, b: string) => {
    const ai = baseIndex.get(a);
    const bi = baseIndex.get(b);
    if (ai !== undefined || bi !== undefined) return (ai ?? Number.MAX_SAFE_INTEGER) - (bi ?? Number.MAX_SAFE_INTEGER);
    return a.localeCompare(b, "nl");
  };

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0).sort(compare);
  const ordered: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
    queue.sort(compare);
  }

  return ordered.length === ids.length ? ordered : ids.sort(compare);
}

function buildReturnToHubSpotTitle(stateWrite: string): string {
  if (isHubSpotRecordCreation(stateWrite)) return "De verwerking levert HubSpot-records op";
  return "De verwerking levert een HubSpot-uitkomst op";
}

function buildReturnToHubSpotDescription(stateWrite: string): string {
  if (isHubSpotRecordCreation(stateWrite)) {
    return "De backendverwerking geeft de uitkomst terug aan HubSpot. In deze reis betekent dat: de benodigde dealrecords worden aangemaakt of gekoppeld.";
  }
  if (stateWrite.includes("=")) {
    return "De backendverwerking geeft de uitkomst terug aan HubSpot. Daarmee wordt duidelijk welke eigenschap in HubSpot zichtbaar wordt bijgewerkt.";
  }
  return "De backendverwerking geeft de uitkomst terug aan HubSpot. Daarmee wordt duidelijk welke HubSpot-uitkomst zichtbaar wordt bijgewerkt.";
}

function buildStateWriteDescription(stateWrite: string): string {
  if (isHubSpotRecordCreation(stateWrite)) {
    return "Dit is het einde van deze procesreis. HubSpot bevat nu de aangemaakte of gekoppelde dealrecords, zodat medewerkers met de juiste dossiers verder kunnen.";
  }
  if (stateWrite.includes("=")) {
    return "Dit is het einde van deze procesreis. HubSpot bevat nu de zichtbare uitkomst, zodat medewerkers daar de bijgewerkte eigenschap zien.";
  }
  return "Dit is het einde van deze procesreis. HubSpot bevat nu de zichtbare uitkomst, zodat medewerkers daar de bijgewerkte informatie zien.";
}

function isHubSpotRecordCreation(stateWrite: string): boolean {
  const lower = stateWrite.toLowerCase();
  return lower.includes("maakt") || lower.includes("koppelt") || lower.includes("dealrecords");
}

function inferSignal(automation: Automatisering): string {
  if (isGitLab(automation)) return "Directe backendverwerking";

  const trigger = getPrimaryHubSpotTrigger(automation);
  if (trigger?.label) return trigger.label;

  const quoted = automation.naam.match(/['"]([^'"]+)['"]/);
  if (quoted?.[1]) return quoted[1];

  const triggerText = cleanupSignalText(automation.trigger);
  if (triggerText) return triggerText;

  return cleanupSignalText(automation.naam) || "Startsignaal";
}

function inferTerminalOutcome(automation: Automatisering): { title: string; description: string; evidence: string } {
  const text = [
    automation.naam,
    automation.doel,
    automation.trigger,
    automation.gitlabEndpoint?.endpoint,
    automation.gitlabEndpoint?.handler,
    ...automation.systemen,
  ].filter(Boolean).join(" ").toLowerCase();
  const technicalEvidence = [
    automation.gitlabEndpoint?.endpoint ? `Endpoint: ${automation.gitlabEndpoint.endpoint}.` : "",
    automation.gitlabEndpoint?.handler ? `Handler: ${automation.gitlabEndpoint.handler}.` : "",
  ].filter(Boolean).join(" ");

  if (text.includes("wefact") || text.includes("debtor") || text.includes("debiteur")) {
    return {
      title: "WeFact debiteur wordt aangemaakt of bijgewerkt",
      description: "Dit is het einde van deze procesreis. De backend werkt de debiteurgegevens in WeFact bij; een vervolgstap wordt alleen apart gekoppeld wanneer de volgende trigger bewezen is.",
      evidence: technicalEvidence || "Afgeleid uit WeFact-systeemmetadata en backendautomation.",
    };
  }

  if (text.includes("clockify")) {
    return {
      title: "Clockify gegevens worden bijgewerkt",
      description: "Dit is het einde van deze procesreis. De backend werkt de bekende Clockify-gegevens bij; een vervolgstap wordt alleen apart gekoppeld wanneer de volgende trigger bewezen is.",
      evidence: technicalEvidence || "Afgeleid uit Clockify-systeemmetadata en backendautomation.",
    };
  }

  return {
    title: "Backendverwerking afgerond",
    description: "Dit is het einde van deze procesreis. Er is geen concretere HubSpot- of externe systeemupdate bewezen in de beschikbare metadata.",
    evidence: technicalEvidence || "Afgeleid uit de GitLab automationmetadata.",
  };
}

function buildGitLabWorkerDescription(
  automation: Automatisering,
  funnel: ReturnType<typeof buildAutomationFunnel>,
  backendTrace?: BackendAutomationTrace | null,
): string {
  if (backendTrace) return backendTrace.summary;

  const compute = inferGitLabBusinessAction(automation);
  const reads = funnel?.hubspotReads.length
    ? "leest HubSpot-data"
    : "gebruikt de binnenkomende gegevens";
  const writes = funnel?.hubspotWrites.length
    ? "schrijft de uitkomst terug naar HubSpot"
    : "bepaalt de vervolgstap";

  return `Deze GitLab worker wordt door HubSpot aangeroepen, ${reads}, ${compute} en ${writes}.`;
}

function inferGitLabBusinessAction(automation: Automatisering): string {
  const text = `${automation.naam} ${automation.gitlabEndpoint?.handler ?? ""} ${automation.doel}`.toLowerCase();

  if (text.includes("next_quarter") || text.includes("next quarter") || text.includes("prev2m")) {
    return "bepaalt welke volgende BTW-periode bijgewerkt moet worden";
  }
  if (text.includes("lead")) return "verwerkt de binnengekomen lead";
  if (text.includes("owner") || text.includes("toewijz")) return "bepaalt wie verantwoordelijk wordt";
  if (text.includes("stage") || text.includes("fase")) return "bepaalt welke procesfase passend is";
  if (text.includes("dossier")) return "werkt het gekoppelde dossier bij";
  if (text.includes("bank")) return "werkt de bankkoppelingstatus bij";

  return "bepaalt wat er met deze processtap moet gebeuren";
}

function inferWorkerTitle(automation: Automatisering): string {
  const handler = automation.gitlabEndpoint?.handler;
  if (handler) return handler;

  const externalRoute = automation.externalId?.split("::").at(1);
  if (externalRoute) return externalRoute;

  return automation.naam;
}

function inferStateWrite(
  automation: Automatisering,
  previousAutomation: Automatisering | undefined,
  hubspotWrites: string[],
): string {
  const quotedProperty = inferQuotedPropertyName(previousAutomation) ?? inferQuotedPropertyName(automation);
  if (quotedProperty) return `${quotedProperty} = true`;
  if (hubspotWrites.length > 0) return hubspotWrites[0];
  const property = inferPropertyName(previousAutomation) ?? inferPropertyName(automation);
  if (property) return `${property} = true`;
  return hubspotWrites[0] ?? "Nieuwe HubSpot-status";
}

function inferQuotedPropertyName(automation?: Automatisering): string | null {
  if (!automation) return null;
  const quoted = automation.naam.match(/['"]([^'"]+)['"]/);
  if (!quoted?.[1]) return null;
  return toPropertyName(quoted[1]);
}

function inferPropertyName(automation?: Automatisering): string | null {
  if (!automation) return null;
  const quoted = automation.naam.match(/['"]([^'"]+)['"]/);
  const source = quoted?.[1] ?? automation.naam;
  const cleaned = source
    .replace(/\b(instellen|update|bijwerken|zetten|workflow|hubspot)\b/gi, "")
    .trim();
  if (!cleaned) return null;
  return toPropertyName(cleaned);
}

function toPropertyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function inferEmittedSignal(stateWrite: string): string {
  const property = stateWrite.split("=").at(0)?.trim();
  if (!property) return "HubSpot-status bijgewerkt";
  if (!stateWrite.includes("=")) return property.replace(/\.$/, "");
  return `${property} bijgewerkt`;
}

function inferDownstreamTitle(automations: Automatisering[]): string {
  const domains = new Set<string>();
  const text = automations.map((automation) => `${automation.naam} ${automation.doel} ${automation.fasen.join(" ")}`).join(" ").toUpperCase();

  for (const domain of ["JR", "VPB", "VA", "IB", "BTW", "SALES"]) {
    if (text.includes(domain)) domains.add(domain);
  }

  if (domains.size > 0) return [...domains].join(" / ");

  const systems = new Set(automations.flatMap((automation) => automation.systemen).filter((system) => system !== "GitLab"));
  return systems.size > 0 ? [...systems].join(" / ") : "Vervolgprocessen";
}

function cleanupSignalText(value: string): string {
  return value
    .replace(/\b(workflow|hubspot|backend|endpoint|automation)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
