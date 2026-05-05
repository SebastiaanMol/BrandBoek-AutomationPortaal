import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

/** Flatten nested action arrays (HubSpot sometimes nests branch sub-actions) */
function flattenActions(actions: any[]): any[] {
  const result: any[] = [];
  for (const a of actions) {
    result.push(a);
    // Branch arms may contain their own sub-actions
    for (const arm of a.branches ?? a.options ?? []) {
      if (Array.isArray(arm.actions)) result.push(...flattenActions(arm.actions));
    }
  }
  return result;
}

function extractStappen(actions: any[]): string[] {
  return actions.map((a) => {
    const t = a.type ?? a.actionType ?? "";
    if (t === "WEBHOOK") {
      const rawUrl = a.url ?? a.webhookUrl ?? "";
      const known = describeKnownWebhook(rawUrl);
      return known?.step ?? `Webhook -> ${rawUrl || "?"}`;
    }
    if (t === "SINGLE_CONNECTION") {
      const actionTypeId = String(a.actionTypeId ?? "");
      const fields = a.fields ?? {};
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
      if (fields.property_name) {
        return `Stel '${fields.property_name}' in`;
      }
      if (fields.value && fields.property_name) {
        return `Stel '${fields.property_name}' in`;
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
    if (t === "WEBHOOK") return `Webhook → ${a.url ?? a.webhookUrl ?? "?"}`;
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
    if (t !== "BRANCH" && t !== "IF_THEN") continue;
    const arms = a.branches ?? a.options ?? a.branchActions ?? [];
    arms.forEach((arm: any, i: number) => {
      branches.push({
        id:       `b-${a.actionId ?? a.id ?? 0}-${i}`,
        label:    arm.label ?? arm.name ?? `Pad ${i + 1}`,
        toStepId: "",
      });
    });
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
  if (family === "PROPERTY") {
    if (prop && val) return `de ${objectLabel}-eigenschap '${prop}' ${opNl} '${val}'`;
    if (prop) return `de ${objectLabel}-eigenschap '${prop}' verandert`;
  }
  if (["ContactProperty","CONTACT_PROPERTY_CHANGE","CONTACT_PROPERTY"].includes(family)) {
    if (prop && val) return `de contacteigenschap '${prop}' ${opNl} '${val}'`;
    if (prop) return `de contacteigenschap '${prop}' verandert`;
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
    if (prop && val) return `de dealeigenschap '${prop}' ${opNl} '${val}'`;
    if (prop) return `de dealeigenschap '${prop}' verandert`;
  }
  if (["CompanyProperty","COMPANY_PROPERTY_CHANGE"].includes(family)) {
    if (prop && val) return `de bedrijfseigenschap '${prop}' ${opNl} '${val}'`;
    if (prop) return `de bedrijfseigenschap '${prop}' verandert`;
  }
  if (family === "EMAIL_OPENED") return "een contact een e-mail opent";
  if (family === "EMAIL_CLICKED") return "een contact op een link in een e-mail klikt";
  if (prop && val) return `'${prop}' ${opNl} '${val}'`;
  if (prop) return `'${prop}' verandert`;
  return "";
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
    const url = a.url ?? a.webhookUrl ?? ""; const method = (a.method ?? "POST").toUpperCase();
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
  return actions
    .filter((a) => (a.type ?? a.actionType) === "WEBHOOK")
    .flatMap((a) => {
      const raw: string = a.url ?? a.webhookUrl ?? "";
      try {
        const path = new URL(raw).pathname;
        return path && path !== "/" ? [path] : [];
      } catch { return []; }
    });
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

function mapWorkflow(wf: any) {
  const actions = flattenActions(wf.actions ?? []);
  const stappen   = extractStappen(actions);
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

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
        await db.from("integrations").update({ status: "error", error_message: errorMessage }).eq("id", integration.id);
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
        await db.from("integrations").update({ status: "error", error_message: errorMessage }).eq("id", integration.id);
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

    // Fetch details in batches of 15 to avoid rate limiting
    const workflows: any[] = [];
    for (let i = 0; i < workflowList.length; i += 15) {
      const batch = workflowList.slice(i, i + 15);
      const details = await Promise.all(batch.map((wf) => {
        const workflowId = getWorkflowId(wf);
        return workflowId ? fetchDetail(workflowId) : Promise.resolve(null);
      }));
      for (let j = 0; j < batch.length; j++) {
        // Merge list metadata with detail (detail may be null if fetch failed)
        workflows.push(details[j] ?? batch[j]);
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

    // Debug mode: return raw first workflow so we can inspect the actual API structure
    if (debugMode) {
      const sample = workflows[0] ?? null;
      const mappedSample = sample ? mapWorkflow(sample) : null;
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
          mapped_result: mappedSample,
        }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get existing automations from this source
    const { data: existing } = await db
      .from("automatiseringen")
      .select("id, external_id, status, import_status, naam")
      .eq("source", "hubspot");

    const existingMap: Record<string, { id: string; status: string; import_status: string; naam: string }> = {};
    const existingNameMap: Record<string, { id: string; status: string; import_status: string; naam: string }> = {};
    const claimedNames = new Set<string>();
    for (const row of existing ?? []) {
      if (row.external_id) existingMap[row.external_id] = row;
      if (row.naam) {
        const normalizedName = normalizeAutomationName(row.naam);
        existingNameMap[normalizedName] = row;
        claimedNames.add(normalizedName);
      }
    }

    const syncedIds = new Set<string>();
    const syncedDbIds = new Set<string>();
    const insertedIds: string[] = [];

    // Build insert/update batches — no sequential awaits per workflow
    const toInsert: any[] = [];
    const toUpdate: Array<{ id: string; data: Record<string, any> }> = [];
    const now = new Date().toISOString();

    for (const wf of workflows) {
      const externalId = getWorkflowId(wf);
      if (!externalId) continue;
      syncedIds.add(externalId);
      const usage = usageByWorkflowId[externalId] ?? { lastRunAt: null, runCount365d: null };
      const { pipelineId, stageId } = extractPipelineStage(wf);
      const mapped = mapWorkflow(wf);
      const existingRow = existingMap[externalId] ?? existingNameMap[normalizeAutomationName(mapped.naam)];

      if (existingRow) {
        syncedDbIds.add(existingRow.id);
        const currentNameKey = normalizeAutomationName(existingRow.naam);
        const mappedNameKey = normalizeAutomationName(mapped.naam);
        const updateName = mappedNameKey !== currentNameKey && claimedNames.has(mappedNameKey)
          ? existingRow.naam
          : mapped.naam;
        const importProposal = updateName === mapped.naam ? mapped : { ...mapped, naam: updateName };
        // NOTE: fasen intentionally excluded — preserves reviewer edits (per D-09)
        toUpdate.push({
          id: existingRow.id,
          data: {
            naam:                 updateName,
            status:               isWorkflowEnabled(wf) ? "Actief" : "Uitgeschakeld",
            trigger_beschrijving: mapped.trigger,
            systemen:             mapped.systemen,
            stappen:              mapped.stappen,
            branches:             mapped.branches,
            categorie:            mapped.categorie,
            webhook_paths:        mapped.webhookPaths,
            external_id:          externalId,
            import_proposal:      importProposal,
            raw_payload:          wf,
            pipeline_id:          pipelineId,
            stage_id:             stageId,
            hubspot_last_run_at:   usage.lastRunAt,
            hubspot_run_count_365d: usage.runCount365d,
            last_synced_at:       now,
          },
        });
      } else {
        const actualId = `AUTO-HS-${externalId}`;
        const uniqueName = makeUniqueAutomationName(mapped.naam, externalId, claimedNames);
        const importProposal = uniqueName === mapped.naam ? mapped : { ...mapped, naam: uniqueName };
        insertedIds.push(actualId);
        toInsert.push({
          id:                   actualId,
          naam:                 uniqueName,
          status:               mapped.status,
          doel:                 "",
          trigger_beschrijving: mapped.trigger,
          systemen:             mapped.systemen,
          stappen:              mapped.stappen,
          branches:             mapped.branches,
          categorie:            mapped.categorie,
          afhankelijkheden:     "",
          owner:                "",
          verbeterideeen:       "",
          mermaid_diagram:      "",
          fasen:                mapped.fasen,
          webhook_paths:        mapped.webhookPaths,
          external_id:          externalId,
          source:               "hubspot",
          import_source:        "hubspot",
          import_status:        "pending_approval",
          import_proposal:      importProposal,
          raw_payload:          wf,
          pipeline_id:          pipelineId,
          stage_id:             stageId,
          hubspot_last_run_at:   usage.lastRunAt,
          hubspot_run_count_365d: usage.runCount365d,
          last_synced_at:       now,
        });
      }
    }

    // One bulk insert for all new automations
    if (toInsert.length > 0) {
      const { error: insertError } = await db.from("automatiseringen").insert(toInsert);
      if (insertError) throw new Error(`Automatiseringen insert mislukt: ${insertError.message}`);
    }

    // Parallel updates in chunks of 20
    for (let i = 0; i < toUpdate.length; i += 20) {
      const updateResults = await Promise.all(
        toUpdate.slice(i, i + 20).map(({ id, data }) =>
          db.from("automatiseringen").update(data).eq("id", id),
        ),
      );
      const updateError = updateResults.find((result) => result.error)?.error;
      if (updateError) throw new Error(`Automatiseringen update mislukt: ${updateError.message}`);
    }

    const inserted = toInsert.length;
    const updated  = toUpdate.length;

    // Rejected HubSpot imports stay visible until the source no longer returns them.
    const rejectedToDelete = Object.entries(existingMap)
      .filter(([extId, row]) => row.import_status === "rejected" && !syncedIds.has(extId) && !syncedDbIds.has(row.id))
      .map(([, row]) => row.id);
    const deletedRejectedIds = new Set(rejectedToDelete);

    if (rejectedToDelete.length > 0) {
      const { error: deleteRejectedError } = await db
        .from("automatiseringen")
        .delete()
        .in("id", rejectedToDelete);
      if (deleteRejectedError) throw new Error(`Afgewezen HubSpot imports verwijderen mislukt: ${deleteRejectedError.message}`);
    }
    const deletedRejected = rejectedToDelete.length;

    // Deactivate removed approved/pending workflows in parallel
    const toDeactivate = Object.entries(existingMap)
      .filter(([extId, row]) => !syncedIds.has(extId) && !syncedDbIds.has(row.id) && !deletedRejectedIds.has(row.id) && row.status !== "Uitgeschakeld")
      .map(([, row]) => row.id);

    if (toDeactivate.length > 0) {
      const deactivateResults = await Promise.all(
        toDeactivate.map((id) => db.from("automatiseringen").update({ status: "Uitgeschakeld" }).eq("id", id)),
      );
      const deactivateError = deactivateResults.find((result) => result.error)?.error;
      if (deactivateError) throw new Error(`Automatiseringen deactiveren mislukt: ${deactivateError.message}`);
    }
    const deactivated = toDeactivate.length;

    const syncRunId = crypto.randomUUID();

    // ── Endpoint matching pass ────────────────────────────────────────────────
    const { data: hsAutos } = await db
      .from("automatiseringen")
      .select("id, webhook_paths")
      .eq("source", "hubspot")
      .neq("import_status", "rejected");

    const { data: glAutos } = await db
      .from("automatiseringen")
      .select("id, endpoints")
      .eq("source", "gitlab");

    const newMatches: Array<{ source_id: string; target_id: string; match_type: string; confirmed: boolean; sync_run_id: string }> = [];
    for (const hs of (hsAutos ?? [])) {
      const hsPaths: string[] = hs.webhook_paths ?? [];
      if (hsPaths.length === 0) continue;
      for (const gl of (glAutos ?? [])) {
        const glEndpoints: string[] = gl.endpoints ?? [];
        if (hsPaths.some((p: string) => glEndpoints.includes(p))) {
          newMatches.push({ source_id: hs.id, target_id: gl.id, match_type: "exact", confirmed: false, sync_run_id: syncRunId });
        }
      }
    }

    if (newMatches.length > 0) {
      await db.from("automation_links").upsert(newMatches, { onConflict: "source_id,target_id", ignoreDuplicates: true });
    }

    const matchedKeys = new Set(newMatches.map((m) => `${m.source_id}:${m.target_id}`));
    const hsIds = (hsAutos ?? []).map((r: any) => r.id);
    if (hsIds.length > 0) {
      const { data: existingLinks } = await db
        .from("automation_links")
        .select("id, source_id, target_id")
        .in("source_id", hsIds)
        .eq("confirmed", false);

      const staleIds = (existingLinks ?? [])
        .filter((l: any) => !matchedKeys.has(`${l.source_id}:${l.target_id}`))
        .map((l: any) => l.id);

      if (staleIds.length > 0) {
        await db.from("automation_links").delete().in("id", staleIds);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Step 4.5: Trigger enrichment + pipeline sync (fire-and-forget)
    {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const matchedSourceIds = new Set(newMatches.map((m) => m.source_id));

      for (const sourceId of matchedSourceIds) {
        fetch(`${supabaseUrl}/functions/v1/enrich-automation`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ automation_id: sourceId }),
        }).catch((e) => console.warn(`enrich-automation fout voor ${sourceId}:`, e));
      }

      // Enrich nieuw gesyncde automations zonder match
      for (const id of insertedIds) {
        if (matchedSourceIds.has(id)) continue;
        fetch(`${supabaseUrl}/functions/v1/enrich-automation`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ automation_id: id }),
        }).catch((e) => console.warn(`enrich-automation fout voor ${id}:`, e));
      }

      // Trigger pipeline sync
      fetch(`${supabaseUrl}/functions/v1/hubspot-pipelines`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}` },
      }).catch((e) => console.warn("hubspot-pipelines fout:", e));
    }
    // ─────────────────────────────────────────────────────────────────────────

    await db.from("integrations").update({
      last_synced_at: new Date().toISOString(),
      status: "connected",
      error_message: null,
    }).eq("id", integration.id);

    return new Response(
      JSON.stringify({ success: true, inserted, updated, deactivated, deletedRejected, total: workflows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("hubspot-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
