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
};

const KNOWN_EXTENSIONS: Record<string, string> = {
  "18224765": "een externe dienst (Operations Hub / Data Sync)",
  "15573739": "de HubSpot Operations Hub data formatter",
  "15573740": "de HubSpot Operations Hub code-actie",
  "11798": "een HubSpot Payments-actie",
};

function filterToNl(f: any): string {
  const family = f.filterFamily ?? f.type ?? "";
  const prop   = f.property ?? f.propertyName ?? "";
  const val    = f.value ?? f.propertyValue ?? "";
  const opNl   = OPERATOR_LABEL[f.operator ?? ""] ?? "is";
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

function extractTriggerDetail(wf: any): string {
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
  return WORKFLOW_TYPE_TRIGGER_MAP[wf.type ?? ""] ?? "Onbekend";
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
  if (types.has("EMAIL") || types.has("SEND_EMAIL")) return "E-mail marketing";
  if (types.has("WEBHOOK") || types.has("EXTENSION")) return "Integratie";
  if (types.has("SALESFORCE_CREATE") || types.has("SALESFORCE_UPDATE")) return "CRM synchronisatie";
  if (types.has("SLACK_NOTIFICATION"))                return "Notificaties";
  if (types.has("SET_CONTACT_PROPERTY") || types.has("SET_DEAL_PROPERTY") || types.has("SET_COMPANY_PROPERTY")) return "Data beheer";
  if (types.has("CREATE_TASK"))                       return "Taakbeheer";
  return "Algemeen";
}

/** Generates a plain-Dutch numbered story for non-IT end users */
function actionToZin(t: string, a: any, step: number): string | null {
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

  sentences.push(`Deze automatisering heet '${wf.name ?? "Naamloze workflow"}' en is ${wf.enabled ? "actief" : "momenteel uitgeschakeld"}.`);

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
      try { return [new URL(raw).pathname]; } catch { return []; }
    });
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
    workflowType:                      wf.type ?? "",
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
    status:                       wf.enabled ? "Actief" : "Uitgeschakeld",
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

    // Fetch workflows from HubSpot
    const hubspotRes = await fetch("https://api.hubapi.com/automation/v3/workflows", {
      headers: { Authorization: `Bearer ${integration.token}` },
    });

    if (!hubspotRes.ok) {
      const errText = await hubspotRes.text();
      const errorMessage = hubspotRes.status === 401
        ? "Ongeldige HubSpot token."
        : `HubSpot API fout (${hubspotRes.status}): ${errText.slice(0, 200)}`;
      await db.from("integrations").update({ status: "error", error_message: errorMessage }).eq("id", integration.id);
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: hubspotRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await hubspotRes.json();
    const workflowList: any[] = body.workflows ?? body.results ?? [];

    // Fetch full details for each workflow (list endpoint omits actions/triggers)
    const token = integration.token;
    async function fetchDetail(wfId: number | string): Promise<any> {
      const r = await fetch(`https://api.hubapi.com/automation/v3/workflows/${wfId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return null;
      return r.json();
    }

    // Fetch details in batches of 5 to avoid rate limiting
    const workflows: any[] = [];
    for (let i = 0; i < workflowList.length; i += 5) {
      const batch = workflowList.slice(i, i + 5);
      const details = await Promise.all(batch.map((wf) => fetchDetail(wf.id)));
      for (let j = 0; j < batch.length; j++) {
        // Merge list metadata with detail (detail may be null if fetch failed)
        workflows.push(details[j] ?? batch[j]);
      }
    }

    // Debug mode: return raw first workflow so we can inspect the actual API structure
    if (debugMode) {
      const sample = workflows[0] ?? null;
      const mappedSample = sample ? mapWorkflow(sample) : null;
      return new Response(
        JSON.stringify({
          debug: true,
          total_workflows: workflows.length,
          first_workflow_keys: sample ? Object.keys(sample) : [],
          first_workflow_actions_sample: sample?.actions?.slice(0, 3) ?? [],
          first_workflow_triggerSets: sample?.triggerSets ?? null,
          first_workflow_segmentCriteria: sample?.segmentCriteria ?? null,
          mapped_result: mappedSample,
        }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get existing automations from this source
    const { data: existing } = await db
      .from("automatiseringen")
      .select("id, external_id, status, import_status")
      .eq("source", "hubspot");

    const existingMap: Record<string, { id: string; status: string; import_status: string }> = {};
    for (const row of existing ?? []) {
      if (row.external_id) existingMap[row.external_id] = row;
    }

    const syncedIds = new Set<string>();
    let inserted = 0, updated = 0;
    const insertedIds: string[] = [];

    for (const wf of workflows) {
      const externalId = String(wf.id);
      syncedIds.add(externalId);
      const now = new Date().toISOString();

      if (existingMap[externalId]) {
        const mapped = mapWorkflow(wf);
        const existingRow = existingMap[externalId];
        // Always re-apply full mapping so fields like stappen/systemen get filled in.
        // Only skip doel if it was already manually filled in.
        // NOTE: fasen intentionally excluded from update — preserves reviewer edits (per D-09)
        await db.from("automatiseringen").update({
          naam:                 wf.name,
          status:               wf.enabled ? "Actief" : "Uitgeschakeld",
          trigger_beschrijving: mapped.trigger,
          systemen:             mapped.systemen,
          stappen:              mapped.stappen,
          branches:             mapped.branches,
          categorie:            mapped.categorie,
          webhook_paths:        mapped.webhookPaths,
          import_proposal:      { ...mapped },
          raw_payload:          wf,
          last_synced_at:       now,
        }).eq("id", existingRow.id);
        updated++;
      } else {
        // New — apply full mapping, set pending_approval
        const mapped = mapWorkflow(wf);
        const { data: newId } = await db.rpc("generate_auto_id");

        const actualId = newId || `AUTO-HS-${externalId}`;
        insertedIds.push(actualId);
        await db.from("automatiseringen").insert({
          id:              actualId,
          naam:            mapped.naam,
          status:          mapped.status,
          doel:            "",              // leeg laten — moet gekeurd worden
          trigger_beschrijving: mapped.trigger,
          systemen:        mapped.systemen,
          stappen:         mapped.stappen,
          branches:        mapped.branches,
          categorie:       mapped.categorie,
          afhankelijkheden: "",
          owner:           "",
          verbeterideeen:  "",
          mermaid_diagram: "",
          fasen:           mapped.fasen,
          webhook_paths:   mapped.webhookPaths,
          external_id:     externalId,
          source:          "hubspot",
          import_source:   "hubspot",
          import_status:   "pending_approval",
          import_proposal: { ...mapped },
          raw_payload:     wf,
          last_synced_at:  now,
        });
        inserted++;
      }
    }

    // Deactivate removed workflows
    let deactivated = 0;
    for (const [extId, row] of Object.entries(existingMap)) {
      if (!syncedIds.has(extId) && row.status !== "Uitgeschakeld") {
        await db.from("automatiseringen").update({ status: "Uitgeschakeld" }).eq("id", row.id);
        deactivated++;
      }
    }

    const syncRunId = crypto.randomUUID();

    // ── Endpoint matching pass ────────────────────────────────────────────────
    const { data: hsAutos } = await db
      .from("automatiseringen")
      .select("id, webhook_paths")
      .eq("source", "hubspot");

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

    // ── Enrich gematchte en nieuwe automations ────────────────────────────────
    {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    }
    // ─────────────────────────────────────────────────────────────────────────

    await db.from("integrations").update({
      last_synced_at: new Date().toISOString(),
      status: "connected",
      error_message: null,
    }).eq("id", integration.id);

    return new Response(
      JSON.stringify({ success: true, inserted, updated, deactivated, total: workflows.length }),
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
