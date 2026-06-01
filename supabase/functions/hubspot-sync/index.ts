import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  applyPortalOwnedSyncChanges,
  previewPortalOwnedSync,
  recordSourceSyncFailure,
  startSourceSyncRun,
} from "../_shared/portal-owned-sync.ts";
import {
  extractHubSpotWebhookInfo,
  extractHubSpotWebhookPaths as extractHubSpotWebhookPathsFromActions,
  extractHubSpotWebhookUrl,
} from "../_shared/hubspot-webhook-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Rule-based mapper (TypeScript port of backend/mapper/hubspot_mapper.py) ──
// Handles both HubSpot Workflows API v3 and legacy field name variations.

const ACTION_SYSTEM_MAP: Record<string, string | null> = {
  // canonical v3 types
  SEND_EMAIL:            "HubSpot",
  EMAIL:                 "HubSpot",
  SET_CONTACT_PROPERTY:  "HubSpot",
  SET_COMPANY_PROPERTY:  "HubSpot",
  SET_DEAL_PROPERTY:     "HubSpot",
  CREATE_TASK:           "HubSpot",
  WEBHOOK:               "Webhook",
  DELAY:                 null,
  BRANCH:                null,
  IF_THEN:               null,
  SALESFORCE_CREATE:     "Salesforce",
  SALESFORCE_UPDATE:     "Salesforce",
  SLACK_NOTIFICATION:    "Slack",
  GOOGLE_SHEETS_ADD_ROW: "Google Sheets",
};

const ACTION_LABEL_MAP: Record<string, string> = {
  SEND_EMAIL:            "Stuur e-mail",
  EMAIL:                 "Stuur e-mail",
  SET_CONTACT_PROPERTY:  "Stel contacteigenschap in",
  SET_COMPANY_PROPERTY:  "Stel bedrijfseigenschap in",
  SET_DEAL_PROPERTY:     "Stel deal-eigenschap in",
  CREATE_TASK:           "Maak taak aan",
  WEBHOOK:               "Stuur webhook",
  DELAY:                 "Wacht",
  BRANCH:                "Vertakking (if/then)",
  IF_THEN:               "Vertakking (if/then)",
  SLACK_NOTIFICATION:    "Stuur Slack-bericht",
  GOOGLE_SHEETS_ADD_ROW: "Voeg rij toe aan Google Sheets",
  ENROLLMENT_TRIGGER:    "Inschrijftrigger",
};

const TRIGGER_LABEL_MAP: Record<string, string> = {
  STATIC_LIST:              "Contact toegevoegd aan lijst",
  ACTIVE_LIST:              "Contact in actieve lijst",
  ContactList:              "Contact toegevoegd aan lijst",
  CONTACT_LIST_MEMBERSHIP:  "Contact toegevoegd aan lijst",
  FORM_SUBMISSION:          "Formulier ingediend",
  FormSubmission:           "Formulier ingediend",
  DEAL_PROPERTY_CHANGE:     "Deal-eigenschap gewijzigd",
  CONTACT_PROPERTY_CHANGE:  "Contact-eigenschap gewijzigd",
  ContactProperty:          "Contact-eigenschap gewijzigd",
  COMPANY_PROPERTY_CHANGE:  "Bedrijfseigenschap gewijzigd",
  PAGE_VIEW:                "Paginabezoek",
  EMAIL_OPENED:             "E-mail geopend",
  EMAIL_CLICKED:            "Link in e-mail aangeklikt",
  CONTACT_CREATED:          "Nieuw contact aangemaakt",
  DEAL_CREATED:             "Nieuwe deal aangemaakt",
  COMPANY_CREATED:          "Nieuw bedrijf aangemaakt",
};

const WORKFLOW_TYPE_TRIGGER_MAP: Record<string, string> = {
  DRIP_DELAY:                    "Tijdgebaseerde inschrijving",
  PROPERTY_ANCHOR_EVENT_BASED:   "Eigenschap gewijzigd",
  FORM_SUBMISSION:               "Formulier ingediend",
  CONTACT_DATE_PROPERTY:         "Contactdatum bereikt",
  COMPANY_PROPERTY_ANCHOR:       "Bedrijfseigenschap gewijzigd",
  DEAL_PROPERTY_ANCHOR:          "Deal-eigenschap gewijzigd",
};

// ── Pipeline + stage extraction from trigger conditions ───────────────────────
function extractPipelineStage(wf: any): { pipelineId: string | null; stageId: string | null } {
  const PIPELINE_PROPS = new Set(["pipeline", "hs_pipeline"]);
  const STAGE_PROPS    = new Set(["dealstage", "hs_pipeline_stage"]);

  let pipelineId: string | null = null;
  let stageId:    string | null = null;

  function checkFilter(f: any) {
    const prop = (f.property ?? f.propertyName ?? "").toLowerCase();
    const raw = f.value ?? f.propertyValue;
    const val = (raw == null) ? "" : String(raw);
    if (!val || val === "null" || val === "undefined") return;
    if (PIPELINE_PROPS.has(prop)) pipelineId = val;
    if (STAGE_PROPS.has(prop))    stageId    = val;
  }

  for (const sources of [wf.triggerSets ?? [], wf.reEnrollmentTriggerSets ?? []]) {
    for (const ts of sources) {
      for (const f of ts.filters ?? []) checkFilter(f);
    }
  }
  for (const group of wf.segmentCriteria ?? []) {
    const filters = Array.isArray(group) ? group : [group];
    for (const f of filters) checkFilter(f);
  }

  return { pipelineId, stageId };
}

function msToHuman(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60)    return `${s} seconden`;
  if (s < 3600)  return `${Math.floor(s / 60)} minuten`;
  if (s < 86400) return `${Math.floor(s / 3600)} uur`;
  return `${Math.floor(s / 86400)} dagen`;
}

function durationToHuman(rawDelta: any, rawUnit: any): string {
  const delta = Number(rawDelta);
  const unit = String(rawUnit ?? "").toUpperCase();
  if (!Number.isFinite(delta)) return "een ingestelde periode";
  if (unit === "MINUTES" && delta % 1440 === 0) return `${delta / 1440} day${delta / 1440 === 1 ? "" : "s"}`;
  if (unit === "MINUTES" && delta % 60 === 0) return `${delta / 60} hour${delta / 60 === 1 ? "" : "s"}`;
  if (unit === "MINUTES") return `${delta} minute${delta === 1 ? "" : "s"}`;
  if (unit === "HOURS") return `${delta} hour${delta === 1 ? "" : "s"}`;
  if (unit === "DAYS") return `${delta} day${delta === 1 ? "" : "s"}`;
  return `${delta} ${unit.toLowerCase() || "units"}`;
}

function scheduledDelayToHuman(delay: any): string {
  const time = delay?.timeOfDay;
  const days = Number(delay?.delta ?? 0);
  const unit = String(delay?.timeUnit ?? "").toUpperCase();
  const hasTime = time && Number.isFinite(Number(time.hour)) && Number.isFinite(Number(time.minute));
  const timePart = hasTime
    ? `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`
    : "";
  if (!Number.isFinite(days) || days <= 0) return timePart || "the scheduled time";
  const dayPart = `${days} ${unit === "DAYS" ? `day${days === 1 ? "" : "s"}` : unit.toLowerCase()} later`;
  if (timePart) return `${dayPart} at ${timePart}`;
  return dayPart;
}

/** Flatten nested action arrays (HubSpot sometimes nests branch sub-actions) */
function flattenActions(actions: any[]): any[] {
  const result: any[] = [];
  for (const a of actions) {
    result.push(a);
    // Branch arms may contain their own sub-actions
    for (const arm of a.branches ?? a.options ?? a.listBranches ?? a.filterBranches ?? []) {
      if (Array.isArray(arm.actions)) result.push(...flattenActions(arm.actions));
    }
  }
  return result;
}

function extractStappen(actions: any[]): string[] {
  return actions.map((a) => {
    const t = a.type ?? a.actionType ?? "";
    const assignment = extractActionPropertyAssignment(a);
    if (t === "WEBHOOK") {
      const rawUrl = extractHubSpotWebhookUrl(a) ?? "";
      const known = describeKnownWebhook(rawUrl);
      return known?.step ?? `Webhook -> ${rawUrl || "?"}`;
    }
    if (t === "SINGLE_CONNECTION") {
      const actionTypeId = String(a.actionTypeId ?? "");
      const fields = a.fields ?? {};
      if (actionTypeId === "0-1" || fields.delta) {
        return `Delay for ${durationToHuman(fields.delta, fields.time_unit)}`;
      }
      if (actionTypeId === "0-28" || fields.delay) {
        return `Delay until ${scheduledDelayToHuman(fields.delay)}`;
      }
      if (actionTypeId === "0-29" || fields.event_filter_branches) {
        return "Wait until event criteria are met";
      }
      if (actionTypeId === "0-4" || fields.content_id) {
        return fields.content_id && fields.content_id !== "0"
          ? `Send email (content ID: ${fields.content_id})`
          : "Send email";
      }
      if (actionTypeId === "0-8" || fields.user_ids) {
        return `Send internal email notification: ${fields.subject ?? "Zonder onderwerp"}`;
      }
      if (actionTypeId === "0-63809083") {
        return `Add enrolled record to static list ${fields.listId ?? "?"}`;
      }
      if (actionTypeId === "0-63863438") {
        return `Remove enrolled record from static list ${fields.listId ?? "?"}`;
      }
      if (actionTypeId === "0-3" || fields.task_type || fields.subject) {
        return `Create task: ${fields.subject ?? "Zonder titel"}`;
      }
      if (actionTypeId === "0-31" || fields.marketableType) {
        return "Set marketing contact status";
      }
      if (actionTypeId === "0-14" || Array.isArray(fields.properties)) {
        const objectLabel = OBJECT_TYPE_LABEL[fields.object_type_id ?? ""] ?? "record";
        const props = (fields.properties ?? [])
          .map((p: any) => p.targetProperty)
          .filter(Boolean)
          .slice(0, 4)
          .join(", ");
        return props ? `Maak of update ${objectLabel} met velden: ${props}` : `Maak of update ${objectLabel}`;
      }
      if (actionTypeId === "0-15" || fields.flow_id) {
        return `Schrijf object in voor workflow ${fields.flow_id ?? "?"}`;
      }
      if (assignment.propertyName) {
        return assignment.propertyValue == null
          ? `Stel '${assignment.propertyName}' in`
          : `Stel '${assignment.propertyName}' in op '${assignment.propertyValue}'`;
      }
      return "Voer HubSpot-actie uit";
    }
    if (t === "LIST_BRANCH") {
      const branches = a.listBranches ?? a.branches ?? a.filterBranches ?? [];
      return `Splits in ${branches.length || "meerdere"} paden op basis van criteria`;
    }
    if (t === "DELAY") {
      const ms = a.delayMillis ?? a.delayTime ?? 0;
      return `Wacht ${msToHuman(ms)}`;
    }
    if (t === "SET_CONTACT_PROPERTY" || t === "SET_COMPANY_PROPERTY") {
      const val = a.propertyValue ?? a.newValue ?? "?";
      return `Stel '${a.propertyName ?? "?"}' in op '${val}'`;
    }
    if (t === "SET_DEAL_PROPERTY") {
      const val = a.propertyValue ?? a.newValue ?? "?";
      return `Deal: stel '${a.propertyName ?? "?"}' in op '${val}'`;
    }
    if (t === "SEND_EMAIL" || t === "EMAIL") {
      const id = a.contentId ?? a.emailId ?? a.body?.contentId ?? "?";
      return `Stuur e-mail (ID: ${id})`;
    }
    if (t === "WEBHOOK") return `Webhook → ${extractHubSpotWebhookUrl(a) ?? "?"}`;
    if (t === "CREATE_TASK") return `Maak taak aan: '${a.taskTitle ?? a.taskName ?? a.body?.taskTitle ?? "Zonder titel"}'`;
    if (t === "SLACK_NOTIFICATION") return `Slack bericht naar #${a.channel ?? "?"}`;
    if (t === "BRANCH" || t === "IF_THEN") {
      const arms = a.branches ?? a.options ?? a.branchActions ?? [];
      return `Vertakking: ${arms.length} paden`;
    }
    if (t === "EXTENSION") {
      const defId = a.extensionDefinitionId ?? a.extensionId ?? "?";
      return `Externe integratie (definitie ${defId})`;
    }
    if (!t) return null;
    return ACTION_LABEL_MAP[t] ?? t;
  }).filter(Boolean) as string[];
}

function normalizeHubSpotSteps(steps: string[]): string[] {
  const counts = new Map<string, number>();
  const firstByKey = new Map<string, string>();
  const orderedKeys: string[] = [];

  for (const rawStep of steps) {
    const step = String(rawStep ?? "").trim();
    if (!step) continue;

    const key = step.replace(/\s+/g, " ").trim().toLowerCase();
    if (!counts.has(key)) {
      counts.set(key, 0);
      firstByKey.set(key, step);
      orderedKeys.push(key);
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return orderedKeys.map((key) => {
    const step = firstByKey.get(key) ?? key;
    const count = counts.get(key) ?? 1;
    return count > 1 ? `${step} (${count} paden)` : step;
  });
}

function extractSystemen(actions: any[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const a of actions) {
    const t = a.type ?? a.actionType ?? "";
    const sys = ACTION_SYSTEM_MAP[t];
    if (sys && !seen.has(sys)) { seen.add(sys); result.push(sys); }
  }
  return result;
}

function extractBranches(actions: any[]): any[] {
  const branches: any[] = [];
  for (const a of actions) {
    const t = a.type ?? a.actionType ?? "";
    if (t !== "BRANCH" && t !== "IF_THEN" && t !== "LIST_BRANCH") continue;
    const arms = a.branches ?? a.options ?? a.branchActions ?? a.listBranches ?? a.filterBranches ?? [];
    arms.forEach((arm: any, i: number) => {
      branches.push({
        id:       `b-${a.actionId ?? a.id ?? 0}-${i}`,
        label:    arm.branchName ?? arm.label ?? arm.name ?? `Pad ${i + 1}`,
        description: extractBranchConditionLabel(arm),
        toStepId: "",
      });
    });
    const defaultBranch = a.defaultBranch ?? a.defaultConnection ?? null;
    if (defaultBranch) {
      branches.push({
        id: `b-${a.actionId ?? a.id ?? 0}-default`,
        label: a.defaultBranchName ?? defaultBranch.branchName ?? defaultBranch.label ?? "Standaardpad",
        description: "Als geen van bovenstaande criteria matcht",
        toStepId: "",
      });
    }
  }
  return branches;
}

const OPERATOR_LABEL: Record<string, string> = {
  EQ: "gelijk is aan", NEQ: "niet gelijk is aan",
  CONTAINS: "de waarde bevat", NOT_CONTAINS: "de waarde niet bevat",
  GT: "groter is dan", GTE: "groter of gelijk is aan",
  LT: "kleiner is dan", LTE: "kleiner of gelijk is aan",
  IS_KNOWN: "is ingevuld", IS_NOT_KNOWN: "leeg is",
  HAS_EVER_BEEN_EQUAL_TO: "ooit gelijk is geweest aan",
  IS_EQUAL_TO: "gelijk is aan",
  IS_ANY_OF: "een van deze waarden is",
  IS_NONE_OF: "niet een van deze waarden is",
};

const OBJECT_TYPE_LABEL: Record<string, string> = {
  "0-1": "contact",
  "0-2": "bedrijf",
  "0-3": "deal",
  "0-4": "meeting",
  "0-8": "regelitem",
};

const KNOWN_EXTENSIONS: Record<string, string> = {
  "18224765": "een externe dienst (Operations Hub / Data Sync)",
  "15573739": "de HubSpot Operations Hub data formatter",
  "15573740": "de HubSpot Operations Hub code-actie",
  "11798": "een HubSpot Payments-actie",
};

const KNOWN_WEBHOOK_PATHS: Record<string, { step: string; story: string }> = {
  "/properties/vpb/finished_webhook": {
    step: "Werk de gekoppelde VA VPB-deal bij naar 'VPB ingediend'",
    story: "De backend zoekt de bijbehorende VA VPB-deal en zet die door naar 'VPB ingediend'. Zo blijft de voorlopige aanslag-pipeline gelijklopen met de afgeronde VPB-deal.",
  },
  "/properties/va_vpb/finished_webhook": {
    step: "Markeer op de VPB-deal dat de VA VPB is ingediend",
    story: "De backend zoekt de gekoppelde VPB-deal en zet daarop de indicatie dat de VA VPB is ingediend.",
  },
  "/properties/ib/finished_webhook": {
    step: "Werk de gekoppelde VA IB-deal bij naar 'IB ingediend'",
    story: "De backend zoekt de bijbehorende VA IB-deal en zet die door naar 'IB ingediend'.",
  },
  "/properties/va_ib/finished_webhook": {
    step: "Markeer op de IB-deal dat de VA IB is ingediend",
    story: "De backend zoekt de gekoppelde IB-deal en zet daarop de indicatie dat de VA IB is ingediend.",
  },
  "/properties/btw/finished_webhook": {
    step: "Neem controleur en eigenaar over naar toekomstige BTW-deals",
    story: "De backend kopieert controleur en eigenaar van deze afgeronde BTW-deal naar latere BTW-deals van dezelfde klant.",
  },
  "/properties/btw/update_next_quarter_prev2m": {
    step: "Werk de volgende BTW-deal bij met de vorige-twee-maanden status",
    story: "De backend werkt de volgende BTW-kwartaaldeal bij op basis van de status van de voorgaande periode.",
  },
  "/properties/update_jr_stage_from_btw_geboekt": {
    step: "Werk de Jaarrekening-stage bij op basis van geboekte BTW-kwartalen",
    story: "De backend kijkt welke BTW-kwartalen geboekt zijn en zet de gekoppelde Jaarrekening-deal naar de passende prioriteit/stage.",
  },
};

function describeKnownWebhook(rawUrl: string): { step: string; story: string } | null {
  try {
    const path = new URL(rawUrl).pathname;
    return KNOWN_WEBHOOK_PATHS[path] ?? null;
  } catch {
    return null;
  }
}

function filterToNl(f: any): string {
  const operation = f.operation ?? {};
  const family = f.filterFamily ?? f.filterType ?? f.type ?? "";
  const prop   = f.property ?? f.propertyName ?? "";
  const rawVal = operation.values ?? operation.value ?? f.value ?? f.propertyValue ?? "";
  const val    = Array.isArray(rawVal) ? rawVal.join(", ") : rawVal;
  const opNl   = OPERATOR_LABEL[operation.operator ?? f.operator ?? ""] ?? "is";
  const objectLabel = OBJECT_TYPE_LABEL[f.objectTypeId ?? ""] ?? "object";
  const propLabel = hubSpotPropertyLabel(prop);
  if (family === "PROPERTY") {
    if (prop && operation.operator === "IS_KNOWN") return `${propLabel} is known`;
    if (prop && val) return `${propLabel} ${opNl} '${val}'`;
    if (prop) return `${propLabel} verandert`;
  }
  if (["ContactProperty","CONTACT_PROPERTY_CHANGE","CONTACT_PROPERTY"].includes(family)) {
    if (prop && operation.operator === "IS_KNOWN") return `${propLabel} is known`;
    if (prop && val) return `${propLabel} ${opNl} '${val}'`;
    if (prop) return `${propLabel} verandert`;
  }
  if (["ContactList","STATIC_LIST","ACTIVE_LIST","CONTACT_LIST_MEMBERSHIP"].includes(family)) {
    const listId = f.listId ?? val ?? "";
    return listId ? `een contact wordt toegevoegd aan lijst ${listId}` : "een contact wordt toegevoegd aan een specifieke lijst";
  }
  if (["FormSubmission","FORM_SUBMISSION"].includes(family)) {
    const formId = f.formId ?? val ?? "";
    return formId ? `formulier ${formId} wordt ingediend` : "een formulier wordt ingediend";
  }
  if (["DealProperty","DEAL_PROPERTY_CHANGE"].includes(family)) {
    if (prop && operation.operator === "IS_KNOWN") return `${propLabel} is known`;
    if (prop && val) return `${propLabel} ${opNl} '${val}'`;
    if (prop) return `${propLabel} verandert`;
  }
  if (["CompanyProperty","COMPANY_PROPERTY_CHANGE"].includes(family)) {
    if (prop && operation.operator === "IS_KNOWN") return `${propLabel} is known`;
    if (prop && val) return `${propLabel} ${opNl} '${val}'`;
    if (prop) return `${propLabel} verandert`;
  }
  if (family === "EMAIL_OPENED") return "een contact een e-mail opent";
  if (family === "EMAIL_CLICKED") return "een contact op een link in een e-mail klikt";
  if (prop && operation.operator === "IS_KNOWN") return `${propLabel} is known`;
  if (prop && val) return `${propLabel} ${opNl} '${val}'`;
  if (prop) return `${propLabel} verandert`;
  return "";
}

function hubSpotPropertyLabel(property: string): string {
  const labels: Record<string, string> = {
    activiteit: "Activiteit Sales Deal Stage",
    dealstage: "Deal stage",
    taal2: "Voertaal",
  };
  return labels[property] ?? property.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function collectFiltersFromBranch(branch: any, result: any[] = []): any[] {
  for (const f of branch?.filters ?? []) result.push(f);
  for (const child of branch?.filterBranches ?? []) collectFiltersFromBranch(child, result);
  return result;
}

function extractTriggerDetail(wf: any): string {
  const enrollmentBranch = wf.enrollmentCriteria?.listFilterBranch;
  if (enrollmentBranch) {
    for (const f of collectFiltersFromBranch(enrollmentBranch)) {
      const r = filterToNl(f);
      if (r) return r;
    }
  }
  for (const sources of [wf.triggerSets ?? [], wf.reEnrollmentTriggerSets ?? []]) {
    for (const ts of sources) {
      for (const f of ts.filters ?? []) { const r = filterToNl(f); if (r) return r; }
    }
  }
  for (const group of wf.segmentCriteria ?? []) {
    const filters = Array.isArray(group) ? group : [group];
    for (const f of filters) { const r = filterToNl(f); if (r) return r; }
  }
  return "";
}

type HubSpotUserAudit = {
  id?: string | null;
  email?: string | null;
  label: string;
};

type HubSpotWorkflowAuditActors = {
  createdBy?: HubSpotUserAudit | null;
  updatedBy?: HubSpotUserAudit | null;
  events: any[];
  debug?: Record<string, unknown>;
};

function extractWorkflowAudit(
  wf: any,
  actions: any[],
  usersById: Map<string, HubSpotUserAudit> = new Map(),
  auditActors?: HubSpotWorkflowAuditActors | null,
) {
  return {
    workflowId: getWorkflowId(wf) ?? null,
    name: wf.name ?? "Naamloze workflow",
    objectType: OBJECT_TYPE_LABEL[wf.objectTypeId ?? ""] ?? wf.objectTypeId ?? null,
    enrollmentType: wf.enrollmentCriteria?.type ?? null,
    shouldReEnroll: wf.enrollmentCriteria?.shouldReEnroll ?? false,
    createdAt: normalizeDateString(wf.createdAt ?? wf.created_at ?? wf.insertedAt ?? wf.creationDate) ?? null,
    updatedAt: normalizeDateString(wf.updatedAt ?? wf.updated_at ?? wf.lastUpdatedAt ?? wf.updated) ?? null,
    createdBy: auditActors?.createdBy ?? extractWorkflowUserAudit(wf, "created", usersById),
    updatedBy: auditActors?.updatedBy ?? extractWorkflowUserAudit(wf, "updated", usersById),
    triggers: extractAuditTriggers(wf),
    actions: extractAuditActions(actions),
    branches: extractAuditBranches(wf.actions ?? []),
  };
}

function normalizeDateString(value: unknown): string | null {
  if (value == null) return null;
  const raw = typeof value === "number" ? value : String(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function extractWorkflowUserAudit(
  wf: any,
  kind: "created" | "updated",
  usersById: Map<string, HubSpotUserAudit>,
): HubSpotUserAudit | null {
  const direct = kind === "created"
    ? firstDefined(wf.createdBy, wf.createdByUser, wf.creator, wf.createdUser)
    : firstDefined(wf.updatedBy, wf.updatedByUser, wf.lastUpdatedBy, wf.lastModifiedBy, wf.updatedUser);
  const directAudit = normalizeUserAudit(direct, usersById);
  if (directAudit) return directAudit;

  const rawId = kind === "created"
    ? firstDefined(wf.createdByUserId, wf.createdUserId, wf.createUserId, wf.creatorId, wf.authorId)
    : firstDefined(wf.updatedByUserId, wf.updatedUserId, wf.updateUserId, wf.lastUpdatedByUserId, wf.lastModifiedByUserId);
  return normalizeUserAudit(rawId, usersById);
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function normalizeUserAudit(value: unknown, usersById: Map<string, HubSpotUserAudit>): HubSpotUserAudit | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") {
    const id = String(value).trim();
    if (!id) return null;
    return usersById.get(id) ?? { id, label: `HubSpot user ${id}` };
  }

  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = stringValue(record.id ?? record.userId ?? record.user_id ?? record.hubspotUserId ?? record.hs_internal_user_id);
  const firstName = stringValue(record.firstName ?? record.first_name);
  const lastName = stringValue(record.lastName ?? record.last_name);
  const email = stringValue(record.email ?? record.userEmail ?? record.user_email);
  const name = stringValue(record.name ?? record.fullName ?? record.label) || [firstName, lastName].filter(Boolean).join(" ").trim();
  if (id && usersById.has(id)) return usersById.get(id) ?? null;
  if (!id && !email && !name) return null;
  return {
    id: id || null,
    email: email || null,
    label: name || email || (id ? `HubSpot user ${id}` : "Onbekend"),
  };
}

function auditEventDate(event: any): Date | null {
  const raw = firstDefined(
    event?.occurredAt,
    event?.timestamp,
    event?.createdAt,
    event?.eventTime,
    event?.eventTimestamp,
    event?.activityTimestamp,
  );
  const normalized = normalizeDateString(raw);
  return normalized ? new Date(normalized) : null;
}

function auditEventAction(event: any): "created" | "updated" | "unknown" {
  const rawAction = [
    event?.action,
    event?.actionType,
    event?.eventType,
    event?.category,
    event?.subCategory,
    event?.operation,
    event?.activityType,
  ].map((value) => String(value ?? "").toLowerCase()).join(" ");

  if (/\b(create|created|creation|new)\b/.test(rawAction)) return "created";
  if (/\b(update|updated|edit|edited|modify|modified|publish|published|change|changed|delete|deleted)\b/.test(rawAction)) return "updated";
  return "unknown";
}

function auditEventActor(event: any, usersById: Map<string, HubSpotUserAudit>): HubSpotUserAudit | null {
  return normalizeUserAudit(
    firstDefined(
      event?.actingUser,
      event?.actor,
      event?.user,
      event?.userId,
      event?.actingUserId,
      event?.actorUserId,
      event?.performedBy,
      event?.updatedBy,
      event?.createdBy,
    ),
    usersById,
  );
}

function auditEventTargetsWorkflow(event: any, workflowId: string): boolean {
  const directTargets = [
    event?.targetObjectId,
    event?.targetObject?.id,
    event?.target?.id,
    event?.target?.objectId,
    event?.objectId,
    event?.entityId,
    event?.resourceId,
  ].map((value) => String(value ?? "").trim()).filter(Boolean);
  if (directTargets.includes(workflowId)) return true;

  try {
    return JSON.stringify(event).includes(workflowId);
  } catch {
    return false;
  }
}

function summarizeAuditEvent(event: any) {
  return {
    occurredAt: normalizeDateString(firstDefined(event?.occurredAt, event?.timestamp, event?.createdAt, event?.eventTime)) ?? null,
    action: firstDefined(event?.action, event?.actionType, event?.eventType, event?.operation) ?? null,
    targetObjectId: firstDefined(event?.targetObjectId, event?.targetObject?.id, event?.target?.objectId, event?.objectId) ?? null,
    actingUser: firstDefined(event?.actingUser, event?.actingUserId, event?.actor, event?.actorUserId, event?.userId) ?? null,
  };
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function extractAuditBranches(actions: any[]) {
  const branches: any[] = [];
  const actionById = new Map<string, any>();
  actions.forEach((action) => {
    const id = action.actionId ?? action.id;
    if (id != null) actionById.set(String(id), action);
  });

  for (const action of actions) {
    const type = action.type ?? action.actionType ?? "";
    if (type !== "BRANCH" && type !== "IF_THEN" && type !== "LIST_BRANCH") continue;

    const arms = action.branches ?? action.options ?? action.branchActions ?? action.listBranches ?? action.filterBranches ?? [];
    arms.forEach((arm: any, index: number) => {
      const nextActionId = arm.connection?.nextActionId ?? arm.nextActionId ?? null;
      const armActions = Array.isArray(arm.actions)
        ? flattenActions(arm.actions)
        : collectActionChain(actionById, nextActionId);
      branches.push({
        id: `b-${action.actionId ?? action.id ?? 0}-${index}`,
        label: arm.branchName ?? arm.label ?? arm.name ?? `Pad ${index + 1}`,
        conditionLabel: extractBranchConditionLabel(arm),
        actions: extractAuditActions(armActions),
      });
    });

    const defaultBranch = action.defaultBranch ?? action.defaultConnection ?? null;
    if (defaultBranch) {
      const nextActionId = defaultBranch.nextActionId ?? action.defaultNextActionId ?? null;
      const defaultActions = Array.isArray(defaultBranch.actions)
        ? flattenActions(defaultBranch.actions)
        : collectActionChain(actionById, nextActionId);
      branches.push({
        id: `b-${action.actionId ?? action.id ?? 0}-default`,
        label: action.defaultBranchName ?? defaultBranch.branchName ?? defaultBranch.label ?? "Standaardpad",
        conditionLabel: "Als geen van bovenstaande criteria matcht",
        actions: extractAuditActions(defaultActions),
      });
    }
  }

  return branches.slice(0, 20);
}

function collectActionChain(actionById: Map<string, any>, startActionId: any): any[] {
  const chain: any[] = [];
  const seen = new Set<string>();
  let currentId = startActionId == null ? null : String(startActionId);

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const action = actionById.get(currentId);
    if (!action) break;
    chain.push(action);
    const nextActionId = action.connection?.nextActionId ?? action.nextActionId ?? null;
    currentId = nextActionId == null ? null : String(nextActionId);
  }

  return chain;
}

function extractBranchConditionLabel(branch: any): string | null {
  const filters = collectFiltersFromBranch(branch);
  const labels = filters.map((filter) => filterToNl(filter)).filter(Boolean);
  if (labels.length > 0) return labels.join(" en ");

  return branch.branchName ?? branch.label ?? branch.name ?? null;
}

function extractAuditTriggers(wf: any) {
  const triggers: any[] = [];
  const enrollmentBranch = wf.enrollmentCriteria?.listFilterBranch;

  if (enrollmentBranch) {
    triggers.push(...collectAuditTriggersFromBranch(enrollmentBranch, "enrollmentCriteria", wf.objectTypeId ?? null));
  }

  for (const ts of wf.triggerSets ?? []) {
    for (const f of ts.filters ?? []) triggers.push(filterToAudit(f, "triggerSets"));
  }

  for (const ts of wf.reEnrollmentTriggerSets ?? []) {
    for (const f of ts.filters ?? []) triggers.push(filterToAudit(f, "reEnrollmentTriggerSets"));
  }

  for (const group of wf.segmentCriteria ?? []) {
    const filters = Array.isArray(group) ? group : [group];
    for (const f of filters) triggers.push(filterToAudit(f, "segmentCriteria"));
  }

  return triggers.filter((trigger) => trigger.label).slice(0, 12);
}

function collectAuditTriggersFromBranch(
  branch: any,
  source: string,
  parentObjectTypeId: string | null,
): any[] {
  const triggers: any[] = [];
  const branchObjectTypeId = branch?.objectTypeId ?? parentObjectTypeId;

  if (branch?.filterBranchType === "ASSOCIATION") {
    const associatedObjectType = OBJECT_TYPE_LABEL[branch.objectTypeId ?? ""] ?? "record";
    const parentObjectType = OBJECT_TYPE_LABEL[parentObjectTypeId ?? ""] ?? "Record";
    triggers.push({
      objectType: associatedObjectType,
      property: null,
      operator: null,
      value: null,
      label: `${capitalize(parentObjectType)} is associated to: Any ${capitalize(associatedObjectType)}`,
      source,
    });
    triggers.push({
      objectType: associatedObjectType,
      property: null,
      operator: null,
      value: null,
      label: `And associated ${capitalize(associatedObjectType)} has all of:`,
      source,
    });
  }

  for (const f of branch?.filters ?? []) {
    triggers.push(filterToAudit({ ...f, objectTypeId: f.objectTypeId ?? branchObjectTypeId }, source));
  }

  for (const child of branch?.filterBranches ?? []) {
    triggers.push(...collectAuditTriggersFromBranch(child, source, branchObjectTypeId));
  }

  return triggers;
}

function capitalize(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function filterToAudit(f: any, source: string) {
  const property = f.property ?? f.propertyName ?? f.pruningRefineBy ?? null;
  const rawValue = f.operation?.values ?? f.operation?.value ?? f.value ?? f.propertyValue ?? f.values ?? f.acceptedValues ?? null;
  const operator = f.operator ?? f.operation ?? f.filterOperator ?? null;
  const objectType = OBJECT_TYPE_LABEL[f.objectTypeId ?? ""] ?? f.objectType ?? null;

  return {
    objectType,
    property,
    operator,
    value: normalizeAuditValue(rawValue),
    label: filterToNl(f) || buildFallbackFilterLabel(property, operator, rawValue),
    source,
  };
}

function normalizeAuditValue(value: any): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 6).map((item) => String(item)).join(", ");
  return JSON.stringify(value).slice(0, 180);
}

function normalizeActionValue(value: any): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const values = value
      .map((item) => normalizeActionValue(item))
      .filter((item): item is string | number | boolean => item != null);
    return values.length ? values.slice(0, 6).map(String).join(", ") : null;
  }
  if (typeof value !== "object") return String(value);

  const timestampType = String(value.timestampType ?? "").toUpperCase();
  const valueType = String(value.type ?? "").toUpperCase();
  const serialized = JSON.stringify(value).toUpperCase();
  if (
    timestampType === "EXECUTION_TIME" ||
    (valueType === "TIMESTAMP" && serialized.includes("EXECUTION_TIME")) ||
    /ACTION_EXECUTION|ACTION_EXECUTED|EXECUTED_AT|CURRENT_DATE|CURRENT_TIME|NOW/.test(serialized)
  ) {
    return "de datum waarop deze actie wordt uitgevoerd";
  }

  for (const key of ["staticValue", "value", "propertyValue", "newValue", "literalValue", "stringValue", "numberValue", "dateValue"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const normalized = normalizeActionValue(value[key]);
      if (normalized != null) return normalized;
    }
  }

  return JSON.stringify(value).slice(0, 180);
}

function extractActionPropertyAssignment(a: any): { propertyName: string | null; propertyValue: string | number | boolean | null } {
  const fields = a.fields ?? {};
  const actionTypeId = String(a.actionTypeId ?? "");
  if (actionTypeId === "0-1" || fields.delta) {
    return {
      propertyName: null,
      propertyValue: `Wait ${durationToHuman(fields.delta, fields.time_unit)}`,
    };
  }
  if (actionTypeId === "0-28" || fields.delay) {
    return {
      propertyName: null,
      propertyValue: `Wait until ${scheduledDelayToHuman(fields.delay)}`,
    };
  }
  if (actionTypeId === "0-29" || fields.event_filter_branches) {
    return {
      propertyName: null,
      propertyValue: fields.expiration_minutes
        ? `Timeout after ${fields.expiration_minutes} minutes`
        : "Continue when the event criteria are met",
    };
  }
  if (actionTypeId === "0-4" || fields.content_id) {
    return {
      propertyName: null,
      propertyValue: fields.content_id && fields.content_id !== "0"
        ? `Email content ID: ${fields.content_id}`
        : "Email content configured in HubSpot",
    };
  }
  if (actionTypeId === "0-8" || fields.user_ids) {
    return {
      propertyName: null,
      propertyValue: `Recipients: ${(fields.user_ids ?? []).length || "configured"} HubSpot user(s)`,
    };
  }
  if (actionTypeId === "0-63809083" || actionTypeId === "0-63863438") {
    const action = actionTypeId === "0-63863438" ? "Remove from static list" : "Add to static list";
    return {
      propertyName: null,
      propertyValue: `${action}: ${fields.listId ?? "unknown list"}`,
    };
  }
  if (actionTypeId === "0-3" || fields.task_type || fields.subject) {
    const ownerSource = fields.owner_assignment?.value?.propertyName
      ? ` Owner comes from ${hubSpotPropertyLabel(fields.owner_assignment.value.propertyName)}.`
      : "";
    return {
      propertyName: null,
      propertyValue: `Task subject: ${fields.subject ?? "Zonder titel"}.${ownerSource}`,
    };
  }
  if (actionTypeId === "0-31" || fields.marketableType) {
    const status = String(fields.marketableType ?? "").toUpperCase() === "MARKETABLE"
      ? "Set as marketing contact"
      : "Set as non-marketing contact";
    return {
      propertyName: null,
      propertyValue: `Enrolled contact: ${status}`,
    };
  }

  const firstProperty = Array.isArray(fields.properties) ? fields.properties[0] : null;
  const propertyName = a.propertyName ?? fields.property_name ?? firstProperty?.targetProperty ?? null;
  const propertyValue =
    a.propertyValue ??
    a.newValue ??
    fields.value ??
    firstProperty?.value ??
    firstProperty?.staticValue ??
    firstProperty?.propertyValue ??
    null;

  return {
    propertyName,
    propertyValue: normalizeActionValue(propertyValue),
  };
}

function buildFallbackFilterLabel(property: string | null, operator: string | null, value: any): string {
  const normalizedValue = normalizeAuditValue(value);
  if (property && normalizedValue != null) return `'${property}' ${operator ?? "is"} '${normalizedValue}'`;
  if (property) return `'${property}' verandert`;
  return "";
}

function extractAuditActions(actions: any[]) {
  return actions.slice(0, 40).map((a, index) => {
    const type = a.type ?? a.actionType ?? "";
    const fields = a.fields ?? {};
    const webhook = extractHubSpotWebhookInfo(a);
    const assignment = extractActionPropertyAssignment(a);

    return {
      index: index + 1,
      type,
      label: extractStappen([a])[0] ?? ACTION_LABEL_MAP[type] ?? (type || "Onbekende actie"),
      webhookUrl: webhook.url,
      webhookMethod: webhook.method,
      webhookPath: webhook.path,
      enrollWorkflowId: fields.flow_id ?? null,
      propertyName: assignment.propertyName,
      propertyValue: assignment.propertyValue,
    };
  });
}

/** Short label for categorie/display */
function extractTrigger(wf: any): string {
  if (wf.enrollmentCriteria?.type) {
    const filters = collectFiltersFromBranch(wf.enrollmentCriteria.listFilterBranch);
    const first = filters[0];
    if (first?.filterType === "PROPERTY") return `${OBJECT_TYPE_LABEL[first.objectTypeId ?? wf.objectTypeId ?? ""] ?? "Object"} eigenschap`;
    return wf.enrollmentCriteria.type === "LIST_BASED" ? "Lijst/gefilterde criteria" : wf.enrollmentCriteria.type;
  }
  for (const ts of wf.triggerSets ?? []) {
    for (const f of ts.filters ?? []) {
      const kind = f.filterFamily ?? f.type ?? f.filterType ?? "";
      if (kind) return TRIGGER_LABEL_MAP[kind] ?? kind;
    }
  }
  for (const group of wf.segmentCriteria ?? []) {
    const filters = Array.isArray(group) ? group : [group];
    for (const f of filters) {
      const kind = f.filterFamily ?? f.type ?? "";
      if (kind) return TRIGGER_LABEL_MAP[kind] ?? kind;
    }
  }
  for (const ts of wf.reEnrollmentTriggerSets ?? []) {
    for (const f of ts.filters ?? []) {
      const kind = f.filterFamily ?? f.type ?? "";
      if (kind) return TRIGGER_LABEL_MAP[kind] ?? kind;
    }
  }
  return WORKFLOW_TYPE_TRIGGER_MAP[wf.type ?? ""] ?? WORKFLOW_TYPE_TRIGGER_MAP[wf.flowType ?? ""] ?? "Onbekend";
}

/** Infer KlantFase values from workflow name keywords */
function inferFasen(wf: any): string[] {
  const naam = (wf?.name ?? "").toLowerCase();
  const fasen: string[] = [];
  if (/onboarding|welkom|welcome|intake|aanmeld/.test(naam)) fasen.push("Onboarding");
  if (/marketing|nieuwsbrief|newsletter|lead|campagne|campaign/.test(naam)) fasen.push("Marketing");
  if (/sales|offerte|quote|deal|pipeline/.test(naam)) fasen.push("Sales");
  if (/boekhoud|factuur|invoice|betaling|payment|wefact/.test(naam)) fasen.push("Boekhouding");
  if (/offboard|opzegg|churn|verloop|exit/.test(naam)) fasen.push("Offboarding");
  return fasen;
}

function inferCategorie(actions: any[]): string {
  const types = new Set(actions.map((a) => a.type ?? a.actionType ?? ""));
  const hasRecordAction = actions.some((a) => (a.type ?? a.actionType) === "SINGLE_CONNECTION" && (a.fields?.properties || a.fields?.property_name));
  if (types.has("EMAIL") || types.has("SEND_EMAIL")) return "E-mail marketing";
  if (types.has("WEBHOOK") || types.has("EXTENSION")) return "Integratie";
  if (types.has("SALESFORCE_CREATE") || types.has("SALESFORCE_UPDATE")) return "CRM synchronisatie";
  if (types.has("SLACK_NOTIFICATION"))                return "Notificaties";
  if (types.has("SET_CONTACT_PROPERTY") || types.has("SET_DEAL_PROPERTY") || types.has("SET_COMPANY_PROPERTY") || hasRecordAction) return "Data beheer";
  if (types.has("CREATE_TASK"))                       return "Taakbeheer";
  return "Algemeen";
}

/** Generates a plain-Dutch numbered story for non-IT end users */
function actionToZin(t: string, a: any, step: number): string | null {
  if (t === "SINGLE_CONNECTION") {
    const actionTypeId = String(a.actionTypeId ?? "");
    const fields = a.fields ?? {};
    if (actionTypeId === "0-14" || Array.isArray(fields.properties)) {
      const objectLabel = OBJECT_TYPE_LABEL[fields.object_type_id ?? ""] ?? "record";
      const properties = fields.properties ?? [];
      const props = properties
        .map((p: any) => p.targetProperty)
        .filter(Boolean)
        .slice(0, 5);
      const assocCount = (fields.associations ?? []).length;
      const details: string[] = [];
      if (props.length) details.push(`velden: ${props.join(", ")}`);
      if (assocCount) details.push(`${assocCount} koppeling(en) met gerelateerde records`);
      return `Stap ${step}: HubSpot maakt of werkt automatisch een ${objectLabel} bij${details.length ? ` (${details.join("; ")})` : ""}.`;
    }
    if (actionTypeId === "0-15" || fields.flow_id) {
      return `Stap ${step}: Het object wordt automatisch ingeschreven in workflow ${fields.flow_id ?? "?"}.`;
    }
    if (actionTypeId === "0-63809083") {
      return `Stap ${step}: HubSpot voegt het ingeschreven record toe aan statische lijst ${fields.listId ?? "?"}.`;
    }
    if (actionTypeId === "0-63863438") {
      return `Stap ${step}: HubSpot verwijdert het ingeschreven record uit statische lijst ${fields.listId ?? "?"}.`;
    }
    if (fields.property_name) {
      const value = fields.value?.staticValue ?? fields.value?.propertyName ?? "";
      return value
        ? `Stap ${step}: HubSpot vult '${fields.property_name}' automatisch met '${value}'.`
        : `Stap ${step}: HubSpot werkt '${fields.property_name}' automatisch bij.`;
    }
    return `Stap ${step}: HubSpot voert automatisch een interne workflow-actie uit.`;
  }
  if (t === "LIST_BRANCH") {
    return `Stap ${step}: HubSpot splitst de workflow in meerdere paden op basis van ingestelde criteria.`;
  }
  if (t === "DELAY") {
    const ms = a.delayMillis ?? a.delayTime ?? 0;
    const anchor = a.anchorSetting ?? {};
    const anchorProp = anchor.anchorProperty ?? "";
    if (anchorProp) { const dir = anchor.offsetDirection === "BEFORE" ? "voor" : "na"; return `Stap ${step}: Het systeem wacht ${msToHuman(ms)} ${dir} de datum van '${anchorProp}'.`; }
    return `Stap ${step}: Het systeem wacht ${msToHuman(ms)} voordat het verdergaat met de volgende stap.`;
  }
  if (t === "SEND_EMAIL" || t === "EMAIL") {
    const body = a.body ?? {};
    const subject = a.emailSubject ?? body.emailSubject ?? a.subject ?? body.subject ?? "";
    const emailName = a.emailName ?? body.emailName ?? a.name ?? body.name ?? "";
    const cid = a.contentId ?? a.emailId ?? body.contentId ?? "";
    if (subject) return `Stap ${step}: De klant ontvangt automatisch de e-mail met onderwerp: '${subject}'.`;
    if (emailName) return `Stap ${step}: De klant ontvangt automatisch de e-mail '${emailName}'.`;
    if (cid) return `Stap ${step}: De klant ontvangt automatisch een e-mail (e-mail ID: ${cid}).`;
    return `Stap ${step}: De klant ontvangt automatisch een e-mail.`;
  }
  if (t === "SET_CONTACT_PROPERTY") {
    const prop = a.propertyName ?? "een eigenschap"; const val = a.propertyValue ?? a.newValue ?? "";
    return val ? `Stap ${step}: Het veld '${prop}' in het contactprofiel wordt automatisch ingesteld op '${val}'.` : `Stap ${step}: Het veld '${prop}' in het contactprofiel wordt automatisch bijgewerkt.`;
  }
  if (t === "SET_COMPANY_PROPERTY") {
    const prop = a.propertyName ?? "een eigenschap"; const val = a.propertyValue ?? a.newValue ?? "";
    return val ? `Stap ${step}: Het veld '${prop}' in het bedrijfsprofiel wordt automatisch ingesteld op '${val}'.` : `Stap ${step}: Het veld '${prop}' in het bedrijfsprofiel wordt automatisch bijgewerkt.`;
  }
  if (t === "SET_DEAL_PROPERTY") {
    const prop = a.propertyName ?? "een eigenschap"; const val = a.propertyValue ?? a.newValue ?? "";
    return val ? `Stap ${step}: Op de bijbehorende deal wordt het veld '${prop}' automatisch ingesteld op '${val}'.` : `Stap ${step}: Op de bijbehorende deal wordt het veld '${prop}' automatisch bijgewerkt.`;
  }
  if (t === "CREATE_TASK") {
    const body = a.body ?? {};
    const title = a.taskTitle ?? a.taskName ?? body.taskTitle ?? "";
    const dueDays = a.taskDueDateOffsetDays ?? body.taskDueDateOffsetDays ?? "";
    const owner = a.taskOwnerId ?? body.taskOwnerId ?? "";
    const parts: string[] = [];
    if (title) parts.push(`'${title}'`);
    if (dueDays) parts.push(`met een deadline over ${dueDays} dag(en)`);
    if (owner) parts.push(`toegewezen aan gebruiker ${owner}`);
    return `Stap ${step}: Er wordt automatisch een taak aangemaakt: ${parts.join(" ") || "zonder titel"}.`;
  }
  if (t === "WEBHOOK") {
    const webhook = extractHubSpotWebhookInfo(a);
    const url = webhook.url ?? "";
    const method = webhook.method ?? "POST";
    const known = describeKnownWebhook(url);
    if (known) return `Stap ${step}: ${known.story}`;
    return url ? `Stap ${step}: Er wordt een ${method}-verzoek gestuurd naar '${url}' om een extern systeem te informeren.` : `Stap ${step}: Er wordt een automatisch signaal (webhook) gestuurd naar een extern systeem.`;
  }
  if (t === "EXTENSION") {
    const defId = String(a.extensionDefinitionId ?? a.extensionId ?? "");
    const extName = KNOWN_EXTENSIONS[defId] ?? "";
    if (extName) return `Stap ${step}: Er wordt automatisch een actie uitgevoerd via ${extName}.`;
    if (defId) return `Stap ${step}: Er wordt automatisch een externe integratie aangestuurd (koppeling-ID: ${defId}). Nakijken welke software dit is.`;
    return `Stap ${step}: Er wordt automatisch een externe koppeling aangestuurd. Nakijken welke software dit is.`;
  }
  if (t === "BRANCH" || t === "IF_THEN") {
    const arms = a.branches ?? a.options ?? a.branchActions ?? [];
    const n = arms.length;
    if (n > 0) {
      const labels = arms.slice(0, 4).map((arm: any, i: number) => `'${arm.label ?? arm.name ?? `Pad ${i+1}`}'`).join(", ");
      const meer = n > 4 ? ` (en ${n-4} meer)` : "";
      return `Stap ${step}: Het systeem maakt een keuze op basis van de situatie van de klant en kiest een van ${n} paden: ${labels}${meer}.`;
    }
    return `Stap ${step}: Het systeem maakt een keuze op basis van de situatie van de klant.`;
  }
  if (t === "SLACK_NOTIFICATION") {
    const channel = a.channel ?? ""; const msg = ((a.message ?? a.body?.message ?? "") as string).slice(0, 60);
    if (channel && msg) return `Stap ${step}: Er wordt een Slack-bericht gestuurd naar #${channel}: '${msg}${msg.length === 60 ? "..." : ""}'.`;
    if (channel) return `Stap ${step}: Er wordt automatisch een bericht gestuurd naar het Slack-kanaal #${channel}.`;
    return `Stap ${step}: Er wordt automatisch een Slack-bericht verstuurd.`;
  }
  if (t === "SALESFORCE_CREATE") { const obj = a.objectType ?? a.sfObjectType ?? ""; return obj ? `Stap ${step}: Er wordt automatisch een nieuw ${obj}-record aangemaakt in Salesforce.` : `Stap ${step}: Er wordt automatisch een nieuw record aangemaakt in Salesforce.`; }
  if (t === "SALESFORCE_UPDATE") { const obj = a.objectType ?? a.sfObjectType ?? ""; return obj ? `Stap ${step}: Een bestaand ${obj}-record in Salesforce wordt automatisch bijgewerkt.` : `Stap ${step}: Een bestaand Salesforce-record wordt automatisch bijgewerkt.`; }
  if (t === "GOOGLE_SHEETS_ADD_ROW") { const sheet = a.spreadsheetName ?? a.spreadsheetId ?? ""; return sheet ? `Stap ${step}: Er wordt automatisch een nieuwe rij toegevoegd aan '${sheet}'.` : `Stap ${step}: Er wordt automatisch een nieuwe rij toegevoegd aan een Google Sheets-bestand.`; }
  if (t) return `Stap ${step}: Het systeem voert een automatische actie uit (type: ${t}). Nakijken wat dit precies inhoudt.`;
  return null;
}

function generateSimpeleTaal(wf: any, actions: any[], trigger: string, enrollment: any, branches: any[]): string[] {
  const sentences: string[] = [];
  let step = 1;
  const wfType: string = wf.type ?? "";
  const contactLists: any = (wf.metaData ?? {}).contactListIds ?? {};
  const triggerDetail = extractTriggerDetail(wf);

  sentences.push(`Deze automatisering heet '${wf.name ?? "Naamloze workflow"}' en is ${isWorkflowEnabled(wf) ? "actief" : "momenteel uitgeschakeld"}.`);

  if (triggerDetail) {
    sentences.push(`Stap ${step}: De automatisering start zodra ${triggerDetail}.`); step++;
  } else if (enrollment.isSegmentBased) {
    const active = contactLists.active ?? "?"; const enrolled = contactLists.enrolled ?? "?";
    sentences.push(`Stap ${step}: De automatisering start voor contacten die in een specifieke lijst zijn opgenomen (lijst-ID's: actief=${active}, ingeschreven=${enrolled}).`); step++;
  } else if (trigger !== "Onbekend") {
    sentences.push(`Stap ${step}: De automatisering start zodra het volgende gebeurt — ${trigger.toLowerCase()}.`); step++;
  }

  if (wfType === "DRIP_DELAY") sentences.push("Tussen de stappen zitten wachttijden: het systeem wacht steeds tot het juiste moment voordat het doorgaat naar de volgende actie.");
  else if (wfType === "PROPERTY_ANCHOR_EVENT_BASED") sentences.push("De automatisering is gekoppeld aan een specifieke eigenschap van een contact en reageert zodra die eigenschap verandert.");
  else if (wfType === "CONTACT_DATE_PROPERTY") sentences.push("De automatisering is gekoppeld aan een datum in het contactprofiel (zoals een verjaardag of contractvervaldatum) en start automatisch op of rond die datum.");
  else if (enrollment.objectType) sentences.push(`Deze workflow werkt op HubSpot-${enrollment.objectType}records.`);

  for (const a of actions) {
    const t: string = a.type ?? a.actionType ?? "";
    const zin = actionToZin(t, a, step);
    if (zin) { sentences.push(zin); step++; }
  }

  if (branches.length > 0) {
    const paden = branches.slice(0, 5).map((b: any) => `'${b.label}'`).join(", ");
    const meer = branches.length > 5 ? ` (en ${branches.length - 5} meer)` : "";
    sentences.push(`Stap ${step}: Het systeem kiest automatisch een richting op basis van de situatie van de klant. Mogelijke paden: ${paden}${meer}.`); step++;
  }

  const completedId = contactLists.completed; const succeededId = contactLists.succeeded;
  if (completedId || succeededId) {
    const info: string[] = [];
    if (completedId) info.push(`'afgerond' (lijst ${completedId})`);
    if (succeededId) info.push(`'geslaagd' (lijst ${succeededId})`);
    sentences.push(`Stap ${step}: Na afloop wordt de klant automatisch gemarkeerd als ${info.join(" en ")}, zodat dezelfde automatisering niet onnodig opnieuw start.`); step++;
  }

  if (enrollment.allowContactToTriggerMultipleTimes) sentences.push("Let op: Deze automatisering kan meerdere keren worden doorlopen door dezelfde klant — elke keer dat de startvoorwaarde opnieuw van toepassing is.");
  if (enrollment.shouldReEnroll) sentences.push("Let op: re-enrollment staat aan; hetzelfde object kan opnieuw instromen wanneer de ingestelde criteria opnieuw gelden.");
  if (enrollment.allowEnrollmentFromMerge) sentences.push("Als twee contacten worden samengevoegd in HubSpot, start het samengevoegde contact automatisch opnieuw in deze automatisering.");
  const triggeredBy: any[] = enrollment.triggeredByWorkflowIds ?? [];
  if (triggeredBy.length > 0) {
    const ids = triggeredBy.slice(0, 3).join(", ");
    const meer = triggeredBy.length > 3 ? ` (en ${triggeredBy.length - 3} meer)` : "";
    sentences.push(`Deze automatisering wordt geactiveerd door een andere automatisering (workflow-ID: ${ids}${meer}).`);
  }
  if (sentences.length <= 1) sentences.push("Er zijn geen specifieke acties gevonden in deze automatisering. Controleer in HubSpot of de workflow stappen bevat.");

  return sentences;
}

function extractWebhookPaths(actions: any[]): string[] {
  return extractHubSpotWebhookPathsFromActions(actions);
}

function getWorkflowId(wf: any): string | null {
  const id = wf.id ?? wf.workflowId ?? wf.flowId;
  return id == null ? null : String(id);
}

function getWorkflowPerformanceId(wf: any): string | null {
  const hybridMatch = typeof wf.uuid === "string" ? wf.uuid.match(/hybrid-execution-wf-(\d+)/i) : null;
  if (hybridMatch) return hybridMatch[1];
  const id = wf.workflowId ?? wf.flowId;
  return id == null ? null : String(id);
}

function normalizeAutomationName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function makeUniqueAutomationName(name: string, externalId: string, claimedNames: Set<string>): string {
  const normalized = normalizeAutomationName(name);
  if (!claimedNames.has(normalized)) {
    claimedNames.add(normalized);
    return name;
  }

  const fallback = `${name} (HubSpot ${externalId})`;
  claimedNames.add(normalizeAutomationName(fallback));
  return fallback;
}

function isWorkflowEnabled(wf: any): boolean {
  return Boolean(wf.enabled ?? wf.isEnabled ?? wf.active ?? false);
}

interface WorkflowUsage {
  lastRunAt: string | null;
  runCount365d: number | null;
}

function asDate(value: unknown): Date | null {
  if (typeof value === "number") {
    const date = new Date(value < 10_000_000_000 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && /^\d+$/.test(value)) return asDate(numeric);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function extractWorkflowUsage(performance: any): WorkflowUsage {
  let lastRunAt: Date | null = null;
  let runCount365d = 0;

  function visit(value: any): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const entries = Object.entries(value);
    const recordDate = entries
      .map(([key, entryValue]) => /date|time|bucket|period|start/i.test(key) ? asDate(entryValue) : null)
      .find((date): date is Date => Boolean(date));

    const series = typeof value.series === "string" ? value.series.toLowerCase() : "";
    const recordCount = entries.reduce((total, [key, entryValue]) => {
      if (typeof entryValue !== "number" || !Number.isFinite(entryValue)) return total;
      if (/frequency/i.test(key) && /enrolled|completed/.test(series)) return total + entryValue;
      if (/enroll|complete|execute|execution|started|run/i.test(key)) return total + entryValue;
      return total;
    }, 0);

    if (recordCount > 0) {
      runCount365d += recordCount;
      if (recordDate && (!lastRunAt || recordDate > lastRunAt)) lastRunAt = recordDate;
    }

    entries.forEach(([, entryValue]) => visit(entryValue));
  }

  visit(performance);

  return {
    lastRunAt: lastRunAt?.toISOString() ?? null,
    runCount365d: runCount365d > 0 ? runCount365d : 0,
  };
}

function mapWorkflow(
  wf: any,
  usersById: Map<string, HubSpotUserAudit> = new Map(),
  auditActors?: HubSpotWorkflowAuditActors | null,
) {
  const actions = flattenActions(wf.actions ?? []);
  const stappen   = normalizeHubSpotSteps(extractStappen(actions));
  const systemen = [...new Set(["HubSpot", ...extractSystemen(actions)])] as string[];
  const branches  = extractBranches(actions);
  const trigger   = extractTrigger(wf);
  const categorie = inferCategorie(actions);
  const naam      = wf.name ?? "Naamloze workflow";
  const beschrijving = wf.description ?? "";

  const enrollment = {
    isSegmentBased:                    wf.isSegmentBased ?? false,
    allowContactToTriggerMultipleTimes: wf.allowContactToTriggerMultipleTimes ?? false,
    allowEnrollmentFromMerge:          wf.allowEnrollmentFromMerge ?? false,
    listening:                         wf.listening ?? false,
    workflowType:                      wf.type ?? wf.flowType ?? "",
    objectTypeId:                      wf.objectTypeId ?? null,
    objectType:                        OBJECT_TYPE_LABEL[wf.objectTypeId ?? ""] ?? null,
    enrollmentType:                    wf.enrollmentCriteria?.type ?? null,
    shouldReEnroll:                    wf.enrollmentCriteria?.shouldReEnroll ?? false,
    contactListIds:                    wf.metaData?.contactListIds ?? {},
    triggeredByWorkflowIds:            wf.metaData?.triggeredByWorkflowIds ?? [],
  };

  const beschrijvingInSimpeleTaal = generateSimpeleTaal(wf, actions, trigger, enrollment, branches);
  const inferredFasen = inferFasen(wf);

  const confidence = {
    naam:                         "high",
    status:                       "high",
    beschrijving:                 beschrijving ? "high" : "low",
    trigger:                      trigger !== "Onbekend" ? "high" : "low",
    systemen:                     systemen.length ? "high" : "low",
    stappen:                      stappen.length  ? "high" : "low",
    branches:                     branches.length ? "medium" : "low",
    categorie:                    "medium",
    doel:                         "low",
    beschrijving_in_simpele_taal: beschrijvingInSimpeleTaal.length > 1 ? "high" : "low",
    fasen:                        inferredFasen.length > 0 ? "medium" : "low",
  };

  return {
    naam,
    status:                       isWorkflowEnabled(wf) ? "Actief" : "Uitgeschakeld",
    beschrijving,
    doel:                         naam ? `Automatisch gegenereerd op basis van naam: '${naam}'` : "",
    trigger,
    systemen,
    stappen,
    branches,
    categorie,
    fasen:                        inferredFasen,
    enrollment,
    hubspot_workflow:              extractWorkflowAudit(wf, actions, usersById, auditActors),
    beschrijving_in_simpele_taal: beschrijvingInSimpeleTaal,
    confidence,
    webhookPaths:                 extractWebhookPaths(actions),
  };
}

// ── Edge Function ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const debugMode = url.searchParams.get("debug") === "1";
    const debugWorkflowId = url.searchParams.get("workflowId");
    const priorityAuditWorkflowId = url.searchParams.get("auditWorkflowId") || debugWorkflowId;

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const syncRequest = await parseHubSpotSyncRequest(req);

    if (syncRequest.mode === "apply") {
      const result = await applyPortalOwnedSyncChanges(db, {
        source: "hubspot",
        syncRunId: syncRequest.syncRunId,
        selectedChangeItemIds: syncRequest.selectedChangeItemIds,
        now: new Date().toISOString(),
      });
      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (syncRequest.mode === "preview") {
      // Preview mode fetches HubSpot read-only data and stores review items.
    }

    // Get HubSpot integration token
    const { data: integration, error: intError } = await db
      .from("integrations")
      .select("*")
      .eq("type", "hubspot")
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intError || !integration) {
      await recordSourceSyncFailure(db, "hubspot", new Date().toISOString(), {
        status: "failed",
        errorMessage: "Geen HubSpot-integratie gevonden.",
      });
      return new Response(
        JSON.stringify({ error: "Geen HubSpot-integratie gevonden. Sla eerst een token op via Instellingen → Integraties." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = integration.token;

    async function fetchWorkflowSummaries(endpoint: string): Promise<{ workflows: any[]; pages: number }> {
      const workflows: any[] = [];
      let after: string | null = null;
      let pages = 0;

      while (true) {
        const pageUrl = new URL(endpoint);
        pageUrl.searchParams.set("limit", "100");
        if (after) pageUrl.searchParams.set("after", after);

        const pageRes = await fetch(pageUrl.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!pageRes.ok) {
          const errText = await pageRes.text();
          throw { status: pageRes.status, text: errText };
        }

        const body = await pageRes.json();
        const page: any[] = body.workflows ?? body.results ?? [];
        workflows.push(...page);
        pages++;

        const nextAfter = body.paging?.next?.after
          ?? (body.paging?.next?.link ? new URL(body.paging.next.link, endpoint).searchParams.get("after") : null);

        if (!nextAfter) return { workflows, pages };
        after = String(nextAfter);

        if (pages > 100) {
          throw { status: 500, text: "HubSpot pagination bleef doorlopen; sync afgebroken." };
        }
      }
    }

    let workflowList: any[] = [];
    let workflowListPages = 0;
    let workflowListEndpoint = "automation/v4/flows";

    try {
      const result = await fetchWorkflowSummaries("https://api.hubapi.com/automation/v4/flows");
      workflowList = result.workflows;
      workflowListPages = result.pages;
    } catch (error: any) {
      const canFallbackToV3 = error?.status === 404 || error?.status === 405;
      if (!canFallbackToV3) {
        const errorMessage = error?.status === 401
          ? "Ongeldige HubSpot token."
          : `HubSpot API fout (${error?.status ?? "onbekend"}): ${String(error?.text ?? error).slice(0, 200)}`;
        await recordSourceSyncFailure(db, "hubspot", new Date().toISOString(), {
          status: error?.status === 401 || error?.status === 403 ? "auth_failed" : error?.status === 429 ? "rate_limited" : "failed",
          errorMessage,
        });
        return new Response(JSON.stringify({ error: errorMessage }), {
          status: error?.status ?? 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      workflowListEndpoint = "automation/v3/workflows";
      try {
        const result = await fetchWorkflowSummaries("https://api.hubapi.com/automation/v3/workflows");
        workflowList = result.workflows;
        workflowListPages = result.pages;
      } catch (fallbackError: any) {
        const errorMessage = fallbackError?.status === 401
          ? "Ongeldige HubSpot token."
          : `HubSpot API fout (${fallbackError?.status ?? "onbekend"}): ${String(fallbackError?.text ?? fallbackError).slice(0, 200)}`;
        await recordSourceSyncFailure(db, "hubspot", new Date().toISOString(), {
          status: fallbackError?.status === 401 || fallbackError?.status === 403 ? "auth_failed" : fallbackError?.status === 429 ? "rate_limited" : "failed",
          errorMessage,
        });
        return new Response(JSON.stringify({ error: errorMessage }), {
          status: fallbackError?.status ?? 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch full details for each workflow (list endpoint omits actions/triggers)
    async function fetchDetail(wfId: number | string): Promise<any> {
      for (const endpoint of [
        `https://api.hubapi.com/automation/v3/workflows/${wfId}`,
        `https://api.hubapi.com/automation/v4/flows/${wfId}`,
      ]) {
        const r = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) return r.json();
      }
      return null;
    }

    async function fetchUsage(wfId: number | string): Promise<WorkflowUsage> {
      const end = Date.now();
      const start = end - 365 * 24 * 60 * 60 * 1000;

      try {
        const r = await fetch(
          `https://api.hubapi.com/automation/v3/performance/workflow/${wfId}?start=${start}&end=${end}&bucket=DAY`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (r.ok) return extractWorkflowUsage(await r.json());
      } catch {
        // Usage data is helpful for cleanup advice, but should never block the sync.
      }

      return { lastRunAt: null, runCount365d: null };
    }

    async function fetchHubSpotUsers(): Promise<Map<string, HubSpotUserAudit>> {
      for (const endpoint of [
        "https://api.hubapi.com/settings/users/2026-03",
        "https://api.hubapi.com/settings/v3/users",
      ]) {
        try {
          const users = await fetchHubSpotUsersFromEndpoint(endpoint);
          if (users.size > 0) return users;
        } catch {
          // User lookup requires additional HubSpot scopes in some portals.
          // Workflow sync should still succeed and store the raw user IDs.
        }
      }
      return new Map();
    }

    async function fetchHubSpotUsersFromEndpoint(endpoint: string): Promise<Map<string, HubSpotUserAudit>> {
      const users = new Map<string, HubSpotUserAudit>();
      let after: string | null = null;
      let pages = 0;

      while (true) {
        const pageUrl = new URL(endpoint);
        pageUrl.searchParams.set("limit", "100");
        if (after) pageUrl.searchParams.set("after", after);

        const response = await fetch(pageUrl.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`HubSpot users API ${response.status}`);

        const body = await response.json();
        for (const user of body.results ?? []) {
          const audit = normalizeUserAudit(user, new Map());
          if (audit?.id) users.set(audit.id, audit);
        }

        pages++;
        const nextAfter = body.paging?.next?.after
          ?? (body.paging?.next?.link ? new URL(body.paging.next.link, endpoint).searchParams.get("after") : null);
        if (!nextAfter || pages > 20) return users;
        after = String(nextAfter);
      }
    }

    async function fetchWorkflowAuditLogActors(
      workflowsToInspect: any[],
      usersById: Map<string, HubSpotUserAudit>,
      options: { maxTargetedWorkflowLookups?: number } = {},
    ): Promise<Map<string, HubSpotWorkflowAuditActors>> {
      const workflowInfos = workflowsToInspect
        .map((wf) => ({
          workflowId: getWorkflowId(wf),
          createdAt: normalizeDateString(wf.createdAt ?? wf.created_at ?? wf.insertedAt ?? wf.creationDate),
          updatedAt: normalizeDateString(wf.updatedAt ?? wf.updated_at ?? wf.lastUpdatedAt ?? wf.updated),
        }))
        .filter((wf): wf is { workflowId: string; createdAt: string | null; updatedAt: string | null } => Boolean(wf.workflowId));
      const wantedWorkflowIds = [...new Set(workflowInfos.map((wf) => wf.workflowId))];
      const actorsByWorkflowId = new Map<string, HubSpotWorkflowAuditActors>();
      if (!wantedWorkflowIds.length) return actorsByWorkflowId;

      for (const workflowId of wantedWorkflowIds) {
        actorsByWorkflowId.set(workflowId, { createdBy: null, updatedBy: null, events: [], debug: {} });
      }

      for (const endpoint of [
        "https://api.hubapi.com/account-info/v3/activity/audit-logs",
        "https://api.hubapi.com/account-info/2026-03/activity/audit-logs",
      ]) {
        try {
          let after: string | null = null;
          let pages = 0;
          let matchedEvents = 0;

          while (true) {
            const pageUrl = new URL(endpoint);
            pageUrl.searchParams.set("limit", "100");
            if (after) pageUrl.searchParams.set("after", after);

            const response = await fetch(pageUrl.toString(), {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error(`HubSpot audit logs API ${response.status}`);

            const body = await response.json();
            const events = Array.isArray(body.results) ? body.results : Array.isArray(body) ? body : [];
            for (const event of events) {
              for (const workflowId of wantedWorkflowIds) {
                if (!auditEventTargetsWorkflow(event, workflowId)) continue;

                const actor = auditEventActor(event, usersById);
                if (!actor) continue;

                const current = actorsByWorkflowId.get(workflowId) ?? { createdBy: null, updatedBy: null, events: [], debug: {} };
                const action = auditEventAction(event);
                const eventDate = auditEventDate(event);
                current.events.push(event);

                if (action === "created") {
                  const existingDate = current.events
                    .filter((candidate) => auditEventAction(candidate) === "created")
                    .map(auditEventDate)
                    .filter((date): date is Date => Boolean(date))
                    .sort((a, b) => a.getTime() - b.getTime())[0];
                  if (!current.createdBy || (eventDate && existingDate && eventDate <= existingDate)) current.createdBy = actor;
                } else if (action === "updated" || !current.updatedBy) {
                  current.updatedBy = actor;
                }

                current.debug = {
                  ...(current.debug ?? {}),
                  endpoint,
                  matchedEventCount: current.events.length,
                  eventSamples: current.events.slice(0, 5).map(summarizeAuditEvent),
                };
                actorsByWorkflowId.set(workflowId, current);
                matchedEvents++;
              }
            }

            pages++;
            const nextAfter = body.paging?.next?.after
              ?? (body.paging?.next?.link ? new URL(body.paging.next.link, endpoint).searchParams.get("after") : null);
            if (!nextAfter || pages >= 25 || matchedEvents >= wantedWorkflowIds.length * 10) break;
            after = String(nextAfter);
          }
          break;
        } catch (error) {
          for (const workflowId of wantedWorkflowIds) {
            const current = actorsByWorkflowId.get(workflowId) ?? { createdBy: null, updatedBy: null, events: [], debug: {} };
            current.debug = {
              ...(current.debug ?? {}),
              failedEndpoint: endpoint,
              error: error instanceof Error ? error.message : String(error),
            };
            actorsByWorkflowId.set(workflowId, current);
          }
        }
      }

      const maxTargetedWorkflowLookups = options.maxTargetedWorkflowLookups ?? 12;
      const targetedWorkflows = workflowInfos.filter((workflow) => {
        const current = actorsByWorkflowId.get(workflow.workflowId);
        return !current?.createdBy || !current?.updatedBy;
      }).slice(0, maxTargetedWorkflowLookups);
      for (let i = 0; i < targetedWorkflows.length; i += 8) {
        const batch = targetedWorkflows.slice(i, i + 8);
        await Promise.all(batch.map(async (workflow) => {
          const current = actorsByWorkflowId.get(workflow.workflowId) ?? { createdBy: null, updatedBy: null, events: [], debug: {} };
          for (const window of workflowAuditSearchWindows(workflow)) {
            if (window.kind === "created" && current.createdBy) continue;
            if (window.kind === "updated" && current.updatedBy) continue;

            const targeted = await fetchWorkflowAuditLogActorsForTimestamp(workflow.workflowId, window.kind, window.timestamp, usersById);
            if (!targeted || targeted.events.length === 0) continue;

            current.events.push(...targeted.events);
            current.createdBy = current.createdBy ?? targeted.createdBy ?? null;
            current.updatedBy = current.updatedBy ?? targeted.updatedBy ?? null;
            current.debug = {
              ...(current.debug ?? {}),
              targetedWindows: [
                ...((current.debug?.targetedWindows as unknown[] | undefined) ?? []),
                ...((targeted.debug?.targetedWindows as unknown[] | undefined) ?? []),
              ],
              targetedEventSamples: [
                ...((current.debug?.targetedEventSamples as unknown[] | undefined) ?? []),
                ...targeted.events.slice(0, 3).map(summarizeAuditEvent),
              ].slice(0, 8),
            };
          }
          actorsByWorkflowId.set(workflow.workflowId, current);
        }));
      }

      return actorsByWorkflowId;
    }

    async function fetchWorkflowAuditLogActorsForTimestamp(
      workflowId: string,
      kind: "created" | "updated",
      timestamp: string,
      usersById: Map<string, HubSpotUserAudit>,
    ): Promise<HubSpotWorkflowAuditActors | null> {
      const result: HubSpotWorkflowAuditActors = { createdBy: null, updatedBy: null, events: [], debug: {} };
      const timestampDate = new Date(timestamp);
      if (Number.isNaN(timestampDate.getTime())) return null;

      const occurredAfter = new Date(timestampDate.getTime() - 10 * 60 * 1000).toISOString();
      const occurredBefore = new Date(timestampDate.getTime() + 10 * 60 * 1000).toISOString();

      for (const endpoint of [
        "https://api.hubapi.com/account-info/v3/activity/audit-logs",
        "https://api.hubapi.com/account-info/2026-03/activity/audit-logs",
      ]) {
        try {
          let after: string | null = null;
          let pages = 0;
          while (pages < 3) {
            const pageUrl = new URL(endpoint);
            pageUrl.searchParams.set("limit", "100");
            pageUrl.searchParams.set("occurredAfter", occurredAfter);
            pageUrl.searchParams.set("occurredBefore", occurredBefore);
            if (after) pageUrl.searchParams.set("after", after);

            const response = await fetch(pageUrl.toString(), {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error(`HubSpot audit logs API ${response.status}`);

            const body = await response.json();
            const events = Array.isArray(body.results) ? body.results : Array.isArray(body) ? body : [];
            for (const event of events) {
              if (!auditEventTargetsWorkflow(event, workflowId)) continue;
              const actor = auditEventActor(event, usersById);
              if (!actor) continue;

              result.events.push(event);
              if (kind === "created" || auditEventAction(event) === "created") result.createdBy = result.createdBy ?? actor;
              if (kind === "updated" || auditEventAction(event) === "updated") result.updatedBy = actor;
            }

            pages++;
            const nextAfter = body.paging?.next?.after
              ?? (body.paging?.next?.link ? new URL(body.paging.next.link, endpoint).searchParams.get("after") : null);
            if (result.events.length > 0 || !nextAfter) break;
            after = String(nextAfter);
          }

          result.debug = {
            ...(result.debug ?? {}),
            targetedWindows: [
              ...((result.debug?.targetedWindows as unknown[] | undefined) ?? []),
              { workflowId, kind, endpoint, occurredAfter, occurredBefore, matchedEventCount: result.events.length },
            ],
          };
          if (result.events.length > 0) return result;
        } catch (error) {
          result.debug = {
            ...(result.debug ?? {}),
            targetedWindows: [
              ...((result.debug?.targetedWindows as unknown[] | undefined) ?? []),
              {
                workflowId,
                kind,
                endpoint,
                occurredAfter,
                occurredBefore,
                error: error instanceof Error ? error.message : String(error),
              },
            ],
          };
        }
      }

      return result.events.length > 0 ? result : null;
    }

    function workflowAuditSearchWindows(workflow: { createdAt: string | null; updatedAt: string | null }) {
      const minAuditDate = new Date("2024-01-01T00:00:00.000Z").getTime();
      return [
        { kind: "updated" as const, timestamp: workflow.updatedAt },
        { kind: "created" as const, timestamp: workflow.createdAt },
      ].filter((window): window is { kind: "created" | "updated"; timestamp: string } => {
        if (!window.timestamp) return false;
        const time = new Date(window.timestamp).getTime();
        return Number.isFinite(time) && time >= minAuditDate;
      });
    }

    // Fetch details in batches of 15 to avoid rate limiting
    const workflows: any[] = [];
    for (let i = 0; i < workflowList.length; i += 15) {
      const batch = workflowList.slice(i, i + 15);
      const details = await Promise.all(batch.map((wf) => {
        const workflowId = getWorkflowId(wf);
        return workflowId ? fetchDetail(workflowId) : Promise.resolve(null);
      }));
      for (let j = 0; j < batch.length; j++) {
        // Merge list metadata with detail; audit fields can be present on either response.
        workflows.push(details[j] ? { ...batch[j], ...details[j] } : batch[j]);
      }
    }

    const usageByWorkflowId: Record<string, WorkflowUsage> = {};
    for (let i = 0; i < workflows.length; i += 10) {
      const batch = workflows.slice(i, i + 10);
      const usageResults = await Promise.all(batch.map((wf) => {
        const workflowId = getWorkflowId(wf);
        const performanceId = getWorkflowPerformanceId(wf);
        return workflowId && performanceId ? fetchUsage(performanceId) : Promise.resolve({ lastRunAt: null, runCount365d: null });
      }));
      for (let j = 0; j < batch.length; j++) {
        const workflowId = getWorkflowId(batch[j]);
        if (workflowId) usageByWorkflowId[workflowId] = usageResults[j];
      }
    }

    const hubSpotUsersById = await fetchHubSpotUsers();
    const auditWorkflows = debugMode && debugWorkflowId
      ? workflows.filter((wf) => getWorkflowId(wf) === debugWorkflowId)
      : priorityAuditWorkflowId
        ? [
          ...workflows.filter((wf) => getWorkflowId(wf) === priorityAuditWorkflowId),
          ...workflows.filter((wf) => getWorkflowId(wf) !== priorityAuditWorkflowId),
        ]
        : workflows;
    const auditActorsByWorkflowId = await fetchWorkflowAuditLogActors(auditWorkflows, hubSpotUsersById, {
      maxTargetedWorkflowLookups: debugMode && debugWorkflowId ? 1 : 12,
    });

    // Debug mode: return raw first workflow so we can inspect the actual API structure
    if (debugMode) {
      const auditDebug = url.searchParams.get("auditDebug") === "1";
      const sample = debugWorkflowId
        ? workflows.find((wf) => getWorkflowId(wf) === debugWorkflowId) ?? null
        : workflows[0] ?? null;
      const sampleWorkflowId = sample ? getWorkflowId(sample) : null;
      const sampleAuditActors = sampleWorkflowId ? auditActorsByWorkflowId.get(sampleWorkflowId) ?? null : null;
      const mappedSample = sample ? mapWorkflow(sample, hubSpotUsersById, sampleAuditActors) : null;
      return new Response(
        JSON.stringify({
          debug: true,
          workflow_list_endpoint: workflowListEndpoint,
          workflow_list_pages: workflowListPages,
          workflow_list_total: workflowList.length,
          total_workflows: workflows.length,
          first_workflow_keys: sample ? Object.keys(sample) : [],
          first_workflow_actions_sample: sample?.actions?.slice(0, 3) ?? [],
          first_workflow_triggerSets: sample?.triggerSets ?? null,
          first_workflow_segmentCriteria: sample?.segmentCriteria ?? null,
          first_workflow_usage: sample ? usageByWorkflowId[getWorkflowId(sample) ?? ""] ?? null : null,
          hubspot_users_resolved: hubSpotUsersById.size,
          audit_debug: auditDebug ? {
            workflow_id: sampleWorkflowId,
            actor_lookup: sampleAuditActors ? {
              createdBy: sampleAuditActors.createdBy ?? null,
              updatedBy: sampleAuditActors.updatedBy ?? null,
              matchedEventCount: sampleAuditActors.events.length,
              debug: sampleAuditActors.debug ?? null,
            } : null,
            workflows_with_audit_events: [...auditActorsByWorkflowId.entries()]
              .filter(([, actors]) => actors.events.length > 0)
              .map(([workflowId, actors]) => ({
                workflowId,
                createdBy: actors.createdBy ?? null,
                updatedBy: actors.updatedBy ?? null,
                matchedEventCount: actors.events.length,
              }))
              .slice(0, 25),
          } : undefined,
          mapped_result: mappedSample,
        }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    {
      const now = new Date().toISOString();
      const payloads = workflows.map((wf) => {
        const externalId = getWorkflowId(wf);
        if (!externalId) return null;
        const usage = usageByWorkflowId[externalId] ?? { lastRunAt: null, runCount365d: null };
        const { pipelineId, stageId } = extractPipelineStage(wf);
        const mapped = mapWorkflow(wf, hubSpotUsersById, auditActorsByWorkflowId.get(externalId) ?? null);

        return {
          naam: mapped.naam,
          status: isWorkflowEnabled(wf) ? "Actief" : "Uitgeschakeld",
          doel: mapped.doel ?? "",
          trigger_beschrijving: mapped.trigger,
          systemen: mapped.systemen,
          stappen: mapped.stappen,
          branches: mapped.branches,
          categorie: mapped.categorie,
          afhankelijkheden: "",
          owner: "",
          verbeterideeen: "",
          mermaid_diagram: "",
          fasen: mapped.fasen,
          webhook_paths: mapped.webhookPaths,
          external_id: externalId,
          source: "hubspot",
          import_source: "hubspot",
          import_proposal: mapped,
          pipeline_id: pipelineId,
          stage_id: stageId,
          hubspot_last_run_at: usage.lastRunAt,
          hubspot_run_count_365d: usage.runCount365d,
          last_synced_at: now,
        };
      }).filter(Boolean);

      const syncRunId = await startSourceSyncRun(db, "hubspot", now);
      const result = await previewPortalOwnedSync(db, {
        source: "hubspot",
        payloads,
        syncRunId,
        now,
      });

      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (e) {
    console.error("hubspot-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

type HubSpotSyncRequest =
  | { mode: "preview" }
  | { mode: "apply"; syncRunId: string; selectedChangeItemIds: string[] };

async function parseHubSpotSyncRequest(req: Request): Promise<HubSpotSyncRequest> {
  if (req.method !== "POST") return { mode: "preview" };
  const body = await req.json().catch(() => ({}));
  if (body?.mode === "apply") {
    return {
      mode: "apply",
      syncRunId: String(body.syncRunId ?? ""),
      selectedChangeItemIds: Array.isArray(body.selectedChangeItemIds)
        ? body.selectedChangeItemIds.map(String)
        : [],
    };
  }
  return { mode: "preview" };
}
