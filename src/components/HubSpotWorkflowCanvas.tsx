import { useMemo, useState } from "react";
import { CheckCircle2, Flag, GitFork, PencilLine, Send, Workflow } from "lucide-react";
import type { Automatisering } from "@/lib/types";
import { usePipelines } from "@/lib/hooks";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  formatHubSpotTriggerSentence,
  getHubSpotWorkflowBranchPaths,
  getPrimaryWebhookPath,
} from "@/lib/processJourneyCopy";

interface HubSpotWorkflowCanvasProps {
  automation: Automatisering;
}

interface VisualWorkflowAction {
  id: string;
  step: string;
  type: string;
  title: string;
  body: string;
  tone: "edit" | "webhook";
  monospace?: boolean;
  propertyName?: string;
  propertyValue?: string;
  webhookPath?: string;
}

interface TriggerGroupDisplay {
  objectType: string;
  conditions: Array<{
    property: string;
    relation: string;
    values: string[];
  }>;
  reEnroll: boolean;
}

export function HubSpotWorkflowCanvas({ automation }: HubSpotWorkflowCanvasProps): React.ReactNode {
  const { data: pipelines = [] } = usePipelines();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const context = { pipelines };
  const triggerSentence = formatHubSpotTriggerSentence(automation, context);
  const triggerGroup = useMemo(
    () => buildTriggerGroupDisplay(automation, pipelines, triggerSentence),
    [automation, pipelines, triggerSentence],
  );
  const branchPaths = getHubSpotWorkflowBranchPaths(automation, context);
  const webhookPath = getPrimaryWebhookPath(automation);
  const actions = automation.hubspotWorkflow?.actions ?? [];
  const nonBranchActions = actions.filter((action) => action.type && action.type !== "LIST_BRANCH");
  const visualActions = buildVisualWorkflowActions(automation, nonBranchActions);
  const selection = useMemo(
    () =>
      selectedId
        ? buildSelectionDetail({
            selectedId,
            automation,
            triggerSentence,
            triggerGroup,
            branchPaths,
            webhookPath,
            visualActions,
          })
        : null,
    [automation, branchPaths, selectedId, triggerGroup, triggerSentence, visualActions, webhookPath],
  );

  if (automation.source !== "hubspot") return null;

  return (
    <section className="rounded-lg border border-border bg-slate-50/60">
      <div className="px-5 py-6">
      <div className="w-full">
        <div className="mx-auto max-w-[980px]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                HubSpot workflow canvas
              </p>
              <h3 className="mt-1 text-sm font-semibold text-foreground">
                Visuele weergave van trigger, paden en acties
              </h3>
            </div>
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-800">
              HubSpot
            </span>
          </div>

          <div className="flex flex-col items-center">
            <WorkflowCard
              id="trigger"
              selectedId={selectedId}
              onSelect={setSelectedId}
              tone="trigger"
              icon={<Flag className="h-4 w-4" />}
              eyebrow={`Trigger enrollment for ${triggerGroup?.objectType ?? "records"}`}
              title="Startvoorwaarde"
              footer={triggerGroup ? `Re-enroll ${triggerGroup.reEnroll ? "on" : "off"}` : undefined}
            >
              {triggerGroup ? (
                <div className="rounded-xl border border-slate-200 bg-white p-2">
                  <p className="px-2 pb-2 text-sm font-semibold text-slate-800">Group 1</p>
                  <div className="space-y-2">
                    {triggerGroup.conditions.map((condition) => (
                      <div key={`${condition.property}-${condition.values.join("|")}`} className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-sm leading-relaxed text-slate-700">
                          <span className="font-semibold text-slate-900">{condition.property}</span>{" "}
                          <span>{condition.relation}</span>
                        </p>
                        {condition.values.length > 0 && (
                          <ul className="mt-1 space-y-1 text-sm font-semibold leading-relaxed text-slate-900">
                            {condition.values.map((value) => (
                              <li key={value}>{value}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-slate-700">
                  {triggerSentence ?? automation.trigger ?? "Geen concrete trigger gevonden."}
                </p>
              )}
            </WorkflowCard>

            <Connector />

            {branchPaths.length > 0 ? (
              <>
                <WorkflowCard
                  id="branch"
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  tone="branch"
                  icon={<GitFork className="h-4 w-4" />}
                  eyebrow="1. Branch"
                  title={`${branchPaths.length} paden`}
                >
                  <p className="text-sm leading-relaxed text-slate-700">
                    Check branches in order:{" "}
                    <span className="font-semibold">
                      {branchPaths.map((path) => path.label).join(", ")}
                    </span>
                  </p>
                </WorkflowCard>

                <div className="h-8 w-px bg-sky-300" aria-hidden />
                <div className="relative w-full">
                  <div className="absolute left-[12%] right-[12%] top-0 h-px bg-sky-300" aria-hidden />
                  <div
                    className="grid gap-4 pt-4"
                    style={{ gridTemplateColumns: `repeat(${Math.min(branchPaths.length, 4)}, minmax(0, 1fr))` }}
                  >
                    {branchPaths.map((path, index) => (
                      <div key={path.id} className="flex min-w-0 flex-col items-center">
                        <div className="h-4 w-px bg-sky-300" aria-hidden />
                        <button
                          type="button"
                          onClick={() => setSelectedId(`branch-path:${path.id}`)}
                          className={`w-full rounded-md border bg-white px-3 py-2 text-center shadow-sm transition-colors ${
                            selectedId === `branch-path:${path.id}`
                              ? "border-primary ring-2 ring-primary/25"
                              : "border-slate-200 hover:border-sky-300"
                          }`}
                        >
                          <p className="truncate text-xs font-semibold text-slate-800" title={path.label}>
                            {path.label}
                          </p>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                            {path.conditionLabel}
                          </p>
                        </button>

                        <SmallPlus />

                        {path.updates.map((update) => (
                          <ActionCard
                            id={`update:${path.id}:${update.property}`}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                            key={`${path.id}-${update.property}`}
                            step={`${index + 2}. HubSpot update`}
                            tone="edit"
                            icon={<PencilLine className="h-4 w-4" />}
                            title={`Set ${update.property}`}
                            body={`to ${update.value}`}
                          />
                        ))}

                        <SmallPlus />

                        <ActionCard
                          id={`webhook:${path.id}`}
                          selectedId={selectedId}
                          onSelect={setSelectedId}
                          step={`${index + 5}. Doorsturen`}
                          tone="webhook"
                          icon={<Send className="h-4 w-4" />}
                          title="Stuurt door naar verwerking"
                          body="Technische route staat in Logica."
                        />

                        <SmallPlus />

                        <div className="rounded-md border border-slate-200 bg-white px-5 py-3 text-xs font-semibold text-slate-700">
                          End
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full max-w-xl space-y-3">
                {visualActions.length > 0 ? (
                  visualActions.slice(0, 8).map((action, index) => (
                    <div key={action.id}>
                      {index > 0 && <Connector />}
                      <ActionCard
                        id={action.id}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        step={action.step}
                        tone={action.tone}
                        icon={action.tone === "webhook" ? <Send className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        title={action.title}
                        body={action.body}
                        monospace={action.monospace}
                      />
                    </div>
                  ))
                ) : (
                  <WorkflowCard
                    id="actions-empty"
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    tone="branch"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    eyebrow="Acties"
                    title="Geen acties gevonden"
                  >
                    <p className="text-sm text-slate-700">
                      Deze workflow heeft nog geen uitleesbare acties in het portaal.
                    </p>
                  </WorkflowCard>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
      <Dialog open={Boolean(selection)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto p-0 sm:max-w-3xl">
          {selection && (
            <>
              <DialogHeader className="border-b border-border px-5 py-4 text-left">
                <DialogTitle>{selection.title}</DialogTitle>
                <DialogDescription>{selection.subtitle}</DialogDescription>
              </DialogHeader>
              <SelectionInspector detail={selection} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

interface SelectionDetail {
  title: string;
  subtitle: string;
  kind: "trigger" | "branch" | "path" | "update" | "webhook" | "action" | "empty";
  rows: Array<{ label: string; value: string; mono?: boolean }>;
  criteria?: string[];
}

function buildSelectionDetail({
  selectedId,
  automation,
  triggerSentence,
  triggerGroup,
  branchPaths,
  webhookPath,
  visualActions,
}: {
  selectedId: string;
  automation: Automatisering;
  triggerSentence?: string;
  triggerGroup?: TriggerGroupDisplay;
  branchPaths: ReturnType<typeof getHubSpotWorkflowBranchPaths>;
  webhookPath?: string;
  visualActions: VisualWorkflowAction[];
}): SelectionDetail {
  if (selectedId === "trigger") {
    return {
      title: "Trigger enrollment",
      subtitle: "Wanneer mag een deal deze workflow instromen?",
      kind: "trigger",
      rows: [
        { label: "Object", value: automation.hubspotWorkflow?.objectType ?? "Deal" },
        { label: "Workflow", value: automation.naam },
        { label: "Re-enrollment", value: automation.hubspotWorkflow?.shouldReEnroll ? "Aan" : "Onbekend of uit" },
      ],
      criteria: triggerGroup
        ? triggerGroup.conditions.flatMap((condition) =>
            condition.values.length
              ? condition.values.map((value) => `${condition.property} ${condition.relation} ${value}`)
              : [`${condition.property} ${condition.relation}`],
          )
        : [triggerSentence ?? automation.trigger ?? "Geen concrete trigger gevonden."],
    };
  }

  if (selectedId === "branch") {
    return {
      title: "1. Branch",
      subtitle: "Branch based on filter criteria",
      kind: "branch",
      rows: [
        { label: "Aantal paden", value: String(branchPaths.length) },
        { label: "Volgorde", value: branchPaths.map((path) => path.label).join(", ") || "Geen paden gevonden" },
      ],
      criteria: branchPaths.map((path) => path.conditionLabel),
    };
  }

  const branchPath = branchPaths.find((path) => selectedId.includes(`:${path.id}`));
  if (selectedId.startsWith("branch-path:") && branchPath) {
    return {
      title: branchPath.label,
      subtitle: "Branch name en criteria",
      kind: "path",
      rows: [
        { label: "Branch name", value: branchPath.label },
        { label: "Als criteria kloppen", value: "Ga door met de acties in dit pad" },
      ],
      criteria: [branchPath.conditionLabel],
    };
  }

  if (selectedId.startsWith("update:") && branchPath) {
    const update = branchPath.updates.find((candidate) => selectedId.endsWith(`:${candidate.property}`)) ?? branchPath.updates[0];
    return {
      title: "HubSpot update",
      subtitle: "Welke eigenschap HubSpot in dit pad zet",
      kind: "update",
      rows: [
        { label: "Pad", value: branchPath.label },
        { label: "Property", value: update?.property ?? "Onbekend" },
        { label: "Waarde", value: update?.value ?? "Onbekend" },
      ],
    };
  }

  if (selectedId.startsWith("webhook:") && branchPath) {
    return {
      title: "Stuurt door naar verwerking",
      subtitle: "HubSpot stuurt een signaal naar de backend",
      kind: "webhook",
      rows: [
        { label: "Pad", value: branchPath.label },
        { label: "Method", value: "POST" },
        { label: "Endpoint", value: branchPath.webhookPath ?? webhookPath ?? "Onbekend", mono: true },
      ],
    };
  }

  const action = visualActions.find((candidate) => selectedId === candidate.id);
  if (action) {
    return {
      title: action.title,
      subtitle: action.type || "Workflow action",
      kind: action.tone === "webhook" ? "webhook" : "action",
      rows: [
        { label: "Type", value: action.type || "Onbekend" },
        action.propertyName ? { label: "Property", value: action.propertyName } : null,
        action.propertyValue != null ? { label: "Waarde", value: action.propertyValue } : null,
        action.webhookPath ? { label: "Endpoint", value: action.webhookPath, mono: true } : null,
      ].filter((row): row is { label: string; value: string; mono?: boolean } => Boolean(row)),
    };
  }

  return {
    title: "Actie",
    subtitle: "Geen details beschikbaar",
    kind: "empty",
    rows: [],
  };
}

function buildVisualWorkflowActions(
  automation: Automatisering,
  actions: NonNullable<Automatisering["hubspotWorkflow"]>["actions"],
): VisualWorkflowAction[] {
  if (actions.length > 0) {
    return actions.map((action, index) => {
      const webhook = formatWebhookDisplay(action.webhookUrl, action.webhookPath);
      const propertyName = action.propertyName ?? extractPropertyFromStep(action.label);
      const propertyValue = action.propertyValue == null
        ? extractPropertyValueFromStep(action.label)
        : String(action.propertyValue);
      const isWebhook = Boolean(webhook);

      return {
        id: `action:${action.index}`,
        step: `${index + 1}. ${getActionStepLabel(action, isWebhook)}`,
        type: action.type || "HubSpot action",
        title: isWebhook
          ? "Stuurt door naar verwerking"
          : propertyName
            ? `Set ${formatPropertyLabel(propertyName)}`
            : action.label,
        body: isWebhook
          ? "Technische route staat in Logica."
          : propertyName
            ? propertyValue ? `to ${propertyValue}` : "waarde nog niet gesynchroniseerd uit HubSpot"
            : propertyValue || action.label,
        tone: isWebhook ? "webhook" : "edit",
        propertyName: propertyName ? formatPropertyLabel(propertyName) : undefined,
        propertyValue: propertyValue || undefined,
        webhookPath: webhook || undefined,
      };
    });
  }

  return automation.stappen
    .map((step, index) => {
      const propertyName = extractPropertyFromStep(step);
      const webhook = extractWebhookFromStep(step);
      if (!propertyName && !webhook) return null;

      const isWebhook = Boolean(webhook);
      const propertyValue = propertyName ? extractPropertyValueFromStep(step) : undefined;
      return {
        id: `step:${index + 1}`,
        step: `${index + 1}. ${isWebhook ? "Doorsturen" : "HubSpot update"}`,
        type: isWebhook ? "WEBHOOK" : "SET_PROPERTY",
        title: isWebhook
          ? "Stuurt door naar verwerking"
          : `Set ${formatPropertyLabel(propertyName ?? "eigenschap")}`,
        body: isWebhook ? "Technische route staat in Logica." : propertyValue ? `to ${propertyValue}` : "waarde nog niet gesynchroniseerd uit HubSpot",
        tone: isWebhook ? "webhook" : "edit",
        propertyName: propertyName ? formatPropertyLabel(propertyName) : undefined,
        propertyValue,
        webhookPath: webhook,
      } satisfies VisualWorkflowAction;
    })
    .filter((action): action is VisualWorkflowAction => Boolean(action));
}

function getActionStepLabel(
  action: NonNullable<Automatisering["hubspotWorkflow"]>["actions"][number],
  isWebhook: boolean,
): string {
  if (isWebhook) return "Doorsturen";
  const label = action.label ?? "";
  if (/^Delay\b/i.test(label)) return "Delay";
  if (/^Wait until\b/i.test(label)) return "Wait until event";
  if (/^Create task\b/i.test(label)) return "Create task";
  if (/^Send email\b/i.test(label)) return "Send email";
  if (/^Send internal email\b/i.test(label)) return "Send internal notification";
  if (/^(Add|Remove) enrolled record\b/i.test(label)) return "List membership";
  if (/^Set marketing contact/i.test(label)) return "Set marketing status";
  return "HubSpot update";
}

function buildTriggerGroupDisplay(
  automation: Automatisering,
  pipelines: ReturnType<typeof usePipelines>["data"] = [],
  triggerSentence?: string,
): TriggerGroupDisplay | undefined {
  const triggers = automation.hubspotWorkflow?.triggers ?? [];
  const workflowObjectType = automation.hubspotWorkflow?.objectType;
  const objectType = workflowObjectType ? pluralizeObjectType(workflowObjectType) : "records";

  const conditions = triggers
    .map((item) => {
      if (!item.property) {
        return {
          property: item.label,
          relation: "",
          values: [],
        };
      }

      const property = String(item.property);
      const rawValues = extractTriggerValues(item);
      return {
        property: formatHubSpotPropertyLabel(property),
        relation: getTriggerRelation(item, rawValues),
        values: rawValues.map((value) => resolveTriggerValue(property, value, pipelines ?? [])),
      };
    })
    .filter((condition) => condition.property || condition.relation || condition.values.length > 0);

  if (conditions.length > 0) {
    return {
      objectType,
      conditions,
      reEnroll: Boolean(automation.hubspotWorkflow?.shouldReEnroll),
    };
  }

  const sentenceMatch = triggerSentence?.match(/HubSpot-eigenschap '([^']+)' een van deze waarden is (.+)$/i);
  if (!sentenceMatch) return undefined;

  const values = [...sentenceMatch[2].matchAll(/'([^']+)'/g)]
    .map((match) => match[1])
    .filter(Boolean);
  if (values.length === 0) return undefined;

  return {
    objectType,
    conditions: [{
      property: formatHubSpotPropertyLabel(sentenceMatch[1]),
      relation: "is een van",
      values,
    }],
    reEnroll: Boolean(automation.hubspotWorkflow?.shouldReEnroll),
  };
}

function extractTriggerValues(trigger: NonNullable<Automatisering["hubspotWorkflow"]>["triggers"][number]): string[] {
  const operator = trigger.operator as unknown;
  if (operator && typeof operator === "object") {
    const values = (operator as { values?: unknown[]; value?: unknown }).values;
    if (Array.isArray(values)) return values.map(String).filter(Boolean);

    const value = (operator as { value?: unknown }).value;
    if (value != null) return [String(value)];
  }

  if (trigger.value != null) return [String(trigger.value)];

  const anyOfMatch = trigger.label.match(/een van deze waarden is '([^']+)'/i);
  if (anyOfMatch) return anyOfMatch[1].split(",").map((value) => value.trim()).filter(Boolean);

  const isMatch = trigger.label.match(/\bis '([^']+)'/i);
  if (isMatch) return [isMatch[1]];

  return [];
}

function getTriggerRelation(
  trigger: NonNullable<Automatisering["hubspotWorkflow"]>["triggers"][number],
  values: string[],
): string {
  const operator = trigger.operator as { operator?: unknown } | null;
  const operatorName = String(operator?.operator ?? "").toUpperCase();
  if (operatorName === "IS_KNOWN") return "is known";
  if (/is known/i.test(trigger.label)) return "is known";
  if (/verandert/i.test(trigger.label)) return "verandert";
  if (values.length > 0) return "is een van";
  return "voldoet aan";
}

function resolveTriggerValue(property: string, value: string, pipelines: NonNullable<ReturnType<typeof usePipelines>["data"]>): string {
  if (property === "dealstage") {
    for (const pipeline of pipelines) {
      const stage = pipeline.stages.find((candidate) => candidate.stage_id === value);
      if (stage) return `${stage.label} (${pipeline.naam}, id ${value})`;
    }
  }

  if (property === "pipeline") {
    const pipeline = pipelines.find((candidate) => candidate.pipelineId === value);
    if (pipeline) return `${pipeline.naam} (id ${value})`;
  }

  return value;
}

function pluralizeObjectType(objectType: string): string {
  const normalized = objectType.toLowerCase();
  if (normalized === "deal") return "deals";
  if (normalized === "contact") return "contacts";
  if (normalized === "company") return "companies";
  return `${objectType}s`;
}

function formatHubSpotPropertyLabel(property: string): string {
  const knownLabels: Record<string, string> = {
    activiteit: "Activiteit Sales Deal Stage",
    dealstage: "Deal stage",
    taal2: "Voertaal",
  };
  return knownLabels[property] ?? formatPropertyLabel(property);
}

function extractPropertyFromStep(step: string): string | undefined {
  return step.match(/(?:Stel|Set)\s+'([^']+)'/i)?.[1]
    ?? step.match(/Set\s+(.+?)\s+to\s+/i)?.[1]?.trim();
}

function formatWebhookDisplay(webhookUrl?: string | null, webhookPath?: string | null): string {
  if (webhookUrl && (!webhookPath || webhookPath === "/")) return webhookUrl;
  return webhookPath ?? webhookUrl ?? "";
}

function extractPropertyValueFromStep(step: string): string | undefined {
  return step.match(/(?:op|to)\s+'([^']+)'/i)?.[1]?.trim()
    ?? step.match(/\bto\s+(.+)$/i)?.[1]?.trim();
}

function extractWebhookFromStep(step: string): string | undefined {
  return step.match(/(\/[a-z0-9/_-]+)/i)?.[1]
    ?? step.match(/https?:\/\/\S+/i)?.[0];
}

function formatPropertyLabel(propertyName: string): string {
  return propertyName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bDtm\b/g, "DTM")
    .replace(/\bBtw\b/g, "BTW")
    .replace(/\bJr\b/g, "JR")
    .replace(/\bIb\b/g, "IB")
    .trim();
}

function WorkflowCard({
  id,
  selectedId,
  onSelect,
  tone,
  icon,
  eyebrow,
  title,
  footer,
  children,
}: {
  id: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  tone: "trigger" | "branch";
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const toneClass = tone === "trigger" ? "border-sky-300 bg-white" : "border-sky-300 bg-white";
  const selected = selectedId === id;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`w-full max-w-sm rounded-lg border text-left ${toneClass} shadow-sm transition-colors ${
        selected ? "ring-2 ring-primary/35" : "hover:border-sky-400"
      }`}
    >
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
            {icon}
          </span>
          <div>
            <p className="text-[11px] font-bold text-slate-700">{eyebrow}</p>
            <p className="text-sm font-semibold text-slate-900">{title}</p>
          </div>
        </div>
      </div>
      <div className="px-4 py-3">{children}</div>
      {footer && (
        <div className="border-t border-slate-100 px-4 py-2 text-right text-xs font-medium text-slate-500">
          {footer}
        </div>
      )}
    </button>
  );
}

function ActionCard({
  id,
  selectedId,
  onSelect,
  step,
  tone,
  icon,
  title,
  body,
  monospace = false,
}: {
  id: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  step: string;
  tone: "edit" | "webhook";
  icon: React.ReactNode;
  title: string;
  body: string;
  monospace?: boolean;
}) {
  const toneClass = tone === "edit"
    ? "border-t-teal-400 text-teal-700"
    : "border-t-amber-400 text-amber-700";
  const selected = selectedId === id;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`w-full rounded-lg border border-slate-200 border-t-4 bg-white text-left shadow-sm transition-colors ${toneClass} ${
        selected ? "ring-2 ring-primary/35" : "hover:border-sky-300"
      }`}
    >
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-current/25 bg-current/5">
            {icon}
          </span>
          <p className="text-xs font-semibold text-slate-700">{step}</p>
        </div>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-900">{title}</p>
        {body && (
          <p className={`mt-1 break-words text-xs leading-relaxed text-slate-700 ${monospace ? "font-mono" : ""}`}>
            {body}
          </p>
        )}
      </div>
    </button>
  );
}

function SelectionInspector({ detail }: { detail: SelectionDetail }) {
  return (
    <div className="bg-white">
      <div className="grid md:grid-cols-[230px_minmax(0,1fr)]">
        <div className="border-b border-border px-5 py-4 md:border-b-0 md:border-r">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Geselecteerd blok
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{detail.title}</h3>
          <p className="mt-1 text-sm text-slate-500">{detail.subtitle}</p>
        </div>
        <div>
          <div className="grid grid-cols-2 border-b border-border text-sm">
            <div className="bg-white px-5 py-3 font-semibold text-slate-900">
              Details
            </div>
            <div className="border-l border-border bg-slate-50 px-5 py-3 text-slate-600">
              Records in dit pad
            </div>
          </div>
          <div className="space-y-4 px-5 py-4">
            {detail.criteria && detail.criteria.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {detail.kind === "branch" ? "First, check if:" : "Criteria"}
                </p>
                <div className="mt-2 space-y-3">
                  {detail.criteria.map((criterion, index) => (
                    <div key={`${criterion}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-700">Group {index + 1}</p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-800">{criterion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.rows.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {detail.rows.map((row) => (
                  <div key={row.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {row.label}
                    </p>
                    <p className={`mt-1 break-words text-sm text-slate-900 ${row.mono ? "font-mono" : ""}`}>
                      {row.value || "-"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex flex-col items-center" aria-hidden>
      <div className="h-5 w-px bg-sky-300" />
      <SmallPlus />
    </div>
  );
}

function SmallPlus() {
  return (
    <div className="my-2 flex h-7 w-7 items-center justify-center rounded-md bg-slate-700 text-sm font-bold text-white shadow-sm">
      +
    </div>
  );
}
