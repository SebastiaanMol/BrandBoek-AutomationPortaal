export type SystemKey = "zapier" | "make" | "power" | "n8n" | "logic" | "custom";

export interface SystemMeta {
  key: SystemKey;
  label: string;
  hue: string; // CSS var name
}

export const SYSTEMS: Record<SystemKey, SystemMeta> = {
  zapier: { key: "zapier", label: "Zapier", hue: "--system-zapier" },
  make: { key: "make", label: "Make", hue: "--system-make" },
  power: { key: "power", label: "Power Automate", hue: "--system-power" },
  n8n: { key: "n8n", label: "n8n", hue: "--system-n8n" },
  logic: { key: "logic", label: "Azure Logic Apps", hue: "--system-logic" },
  custom: { key: "custom", label: "Custom Service", hue: "--system-custom" },
};

export type StepKind = "trigger" | "action" | "condition" | "transform" | "notify" | "end";
export type Status = "active" | "paused" | "error";
export type Category = "Sales" | "HR" | "Finance" | "Operations" | "Marketing";

export interface InternalStep {
  id: string;
  order: number;
  kind: StepKind;
  title: string;
  summary: string;
}

/** One of the ~300 atomic automations from Zapier/Make/Power/etc. */
export interface AtomicAutomation {
  id: string;
  name: string;
  system: SystemKey;
  description: string;
  status: Status;
  lastRun: string;
  externalUrl?: string;
  steps: InternalStep[];
}

export interface AutomationEdge {
  from: string; // automation id
  to: string;
  label?: string;
  animated?: boolean;
}

/** A "big" business process composed of multiple atomic automations. */
export interface BusinessProcess {
  id: string;
  name: string;
  category: Category;
  owner: string;
  status: Status;
  trigger: string;
  frequency: string;
  lastRun: string;
  successRate: number;
  description: string;
  automationIds: string[];
  edges: AutomationEdge[];
}

/* -------------------------------------------------------------------------- */
/*  ATOMIC AUTOMATIONS                                                        */
/* -------------------------------------------------------------------------- */

const mkSteps = (defs: Array<[StepKind, string, string]>): InternalStep[] =>
  defs.map(([kind, title, summary], i) => ({
    id: `st-${i + 1}`,
    order: i + 1,
    kind,
    title,
    summary,
  }));

export const ATOMIC_AUTOMATIONS: Record<string, AtomicAutomation> = {
  /* —— Contact aanmaken (Sales) —— */
  "a-webform-capture": {
    id: "a-webform-capture",
    name: "Webform inzending vangen",
    system: "zapier",
    description: "Luistert op nieuwe inzendingen van het contactformulier op de website.",
    status: "active",
    lastRun: "2 min geleden",
    steps: mkSteps([
      ["trigger", "Nieuwe form submission", "Webhook van het Webflow contactformulier."],
      ["transform", "Velden normaliseren", "Naam, email, telefoon en bedrijf opschonen."],
      ["action", "Doorzetten naar pipeline", "Payload naar interne queue."],
    ]),
  },
  "a-email-validate": {
    id: "a-email-validate",
    name: "Email valideren",
    system: "make",
    description: "Controleert of het emailadres geldig en niet wegwerp is.",
    status: "active",
    lastRun: "3 min geleden",
    steps: mkSteps([
      ["trigger", "Email ontvangen", "Input vanuit voorgaande automation."],
      ["action", "ZeroBounce check", "Externe API roept ZeroBounce aan."],
      ["condition", "Kwaliteit beoordelen", "Score > 0.7 = doorzetten."],
    ]),
  },
  "a-kvk-enrich": {
    id: "a-kvk-enrich",
    name: "KVK gegevens ophalen",
    system: "custom",
    description: "Verrijkt het bedrijf met officiële KVK data: vestiging, SBI, bestuurders.",
    status: "active",
    lastRun: "8 min geleden",
    steps: mkSteps([
      ["trigger", "Bedrijfsnaam ontvangen", "Input bedrijfsnaam of KVK nummer."],
      ["action", "KVK API zoeken", "Match op handelsnaam met fuzzy matching."],
      ["transform", "Velden mappen", "Naar interne datamodel."],
      ["action", "Resultaat teruggeven", "Verrijkt bedrijfsobject."],
    ]),
  },
  "a-dedupe-contact": {
    id: "a-dedupe-contact",
    name: "Duplicaat detectie",
    system: "n8n",
    description: "Zoekt of het contact al bestaat in HubSpot op email of telefoon.",
    status: "active",
    lastRun: "4 min geleden",
    steps: mkSteps([
      ["action", "HubSpot search", "Query op email."],
      ["condition", "Match gevonden?", "Ja → merge, Nee → nieuw."],
    ]),
  },
  "a-hubspot-create-contact": {
    id: "a-hubspot-create-contact",
    name: "Contact aanmaken in HubSpot",
    system: "zapier",
    description: "Maakt een nieuw contact aan in HubSpot CRM.",
    status: "active",
    lastRun: "4 min geleden",
    steps: mkSteps([
      ["action", "Create contact", "POST /contacts naar HubSpot API."],
      ["action", "Tags toevoegen", "Source = web, lifecycle = lead."],
    ]),
  },
  "a-hubspot-create-company": {
    id: "a-hubspot-create-company",
    name: "Bedrijf aanmaken in HubSpot",
    system: "zapier",
    description: "Maakt het bedrijf aan en koppelt het aan het contact.",
    status: "active",
    lastRun: "4 min geleden",
    steps: mkSteps([
      ["action", "Create company", "Bedrijf met KVK metadata."],
      ["action", "Associate", "Koppel contact aan bedrijf."],
    ]),
  },
  "a-segment-event": {
    id: "a-segment-event",
    name: "Segment event sturen",
    system: "custom",
    description: "Stuurt 'contact_created' event naar Segment voor analytics.",
    status: "active",
    lastRun: "4 min geleden",
    steps: mkSteps([
      ["action", "Track event", "Segment identify + track."],
    ]),
  },
  "a-slack-notify-sales": {
    id: "a-slack-notify-sales",
    name: "Sales team notificeren",
    system: "zapier",
    description: "Stuurt een Slack-bericht naar #sales-leads met de nieuwe contact info.",
    status: "active",
    lastRun: "4 min geleden",
    steps: mkSteps([
      ["notify", "Slack message", "Block kit message met owner mention."],
    ]),
  },
  "a-assign-owner": {
    id: "a-assign-owner",
    name: "Owner toewijzen",
    system: "make",
    description: "Round-robin toewijzing van een sales owner aan het contact.",
    status: "active",
    lastRun: "4 min geleden",
    steps: mkSteps([
      ["transform", "Round-robin selectie", "Volgende in rotatie."],
      ["action", "Update HubSpot owner", "Patch contact owner."],
    ]),
  },
  "a-welcome-email": {
    id: "a-welcome-email",
    name: "Welkomst-email versturen",
    system: "zapier",
    description: "Stuurt automatisch de welkomst-email vanuit de juiste mailbox.",
    status: "active",
    lastRun: "5 min geleden",
    steps: mkSteps([
      ["action", "Template renderen", "Personaliseren met naam."],
      ["notify", "Email versturen", "Via Postmark."],
    ]),
  },

  /* —— Deal stage wijzigen (Sales, hergebruikt KVK) —— */
  "a-deal-stage-change": {
    id: "a-deal-stage-change",
    name: "Deal stage gewijzigd",
    system: "power",
    description: "Trigger wanneer een deal in HubSpot van stage verandert.",
    status: "active",
    lastRun: "12 min geleden",
    steps: mkSteps([
      ["trigger", "Webhook deal.stage.changed", "Vanuit HubSpot."],
      ["transform", "Stage mappen", "Internal stage code bepalen."],
    ]),
  },
  "a-deal-validate": {
    id: "a-deal-validate",
    name: "Deal velden valideren",
    system: "make",
    description: "Controleert of alle verplichte velden ingevuld zijn voor de nieuwe stage.",
    status: "active",
    lastRun: "12 min geleden",
    steps: mkSteps([
      ["condition", "Verplichte velden check", "Per stage een set."],
      ["notify", "Owner notificeren bij missend", "Slack DM."],
    ]),
  },
  "a-contract-generate": {
    id: "a-contract-generate",
    name: "Contract genereren",
    system: "custom",
    description: "Genereert een contract uit de PandaDoc template met deal-data.",
    status: "active",
    lastRun: "30 min geleden",
    steps: mkSteps([
      ["transform", "Template variabelen", "Mappen vanuit deal."],
      ["action", "PandaDoc create", "Document aanmaken."],
    ]),
  },
  "a-finance-notify": {
    id: "a-finance-notify",
    name: "Finance team informeren",
    system: "zapier",
    description: "Notificeert Finance dat er een nieuwe deal richting Closed Won gaat.",
    status: "active",
    lastRun: "30 min geleden",
    steps: mkSteps([
      ["notify", "Slack #finance", "Met deal-link en bedrag."],
    ]),
  },

  /* —— Onboarding nieuwe medewerker (HR) —— */
  "a-afas-new-employee": {
    id: "a-afas-new-employee",
    name: "AFAS nieuwe medewerker",
    system: "power",
    description: "Detecteert een nieuwe medewerker in AFAS HR.",
    status: "active",
    lastRun: "1 uur geleden",
    steps: mkSteps([
      ["trigger", "employee.created webhook", "Vanuit AFAS."],
    ]),
  },
  "a-entra-create-account": {
    id: "a-entra-create-account",
    name: "Entra ID account aanmaken",
    system: "logic",
    description: "Maakt Microsoft 365 account met juiste licentie.",
    status: "active",
    lastRun: "1 uur geleden",
    steps: mkSteps([
      ["action", "Graph API create user", "Met UPN en initieel wachtwoord."],
      ["action", "Licentie toewijzen", "E3 of E5 op basis van rol."],
    ]),
  },
  "a-access-bundle": {
    id: "a-access-bundle",
    name: "Toegangspakket bepalen",
    system: "logic",
    description: "Kiest het juiste pakket op basis van rol en afdeling.",
    status: "active",
    lastRun: "1 uur geleden",
    steps: mkSteps([
      ["condition", "Switch op afdeling", "Sales, Tech, Default."],
    ]),
  },
  "a-tools-provision": {
    id: "a-tools-provision",
    name: "Werktools inrichten",
    system: "zapier",
    description: "Slack, Notion en HubSpot accounts aanmaken en koppelen.",
    status: "active",
    lastRun: "1 uur geleden",
    steps: mkSteps([
      ["action", "Slack invite", "Naar juiste workspace."],
      ["action", "Notion access", "Toevoegen aan team."],
      ["action", "HubSpot seat", "Indien sales-rol."],
    ]),
  },
  "a-welcome-package": {
    id: "a-welcome-package",
    name: "Welkomstpakket samenstellen",
    system: "custom",
    description: "Laptopmodel, swag-maat en boeken op basis van rol.",
    status: "active",
    lastRun: "1 uur geleden",
    steps: mkSteps([
      ["transform", "Bundel kiezen", "Mapping rol → bundel."],
      ["action", "NetSuite order", "Order aanmaken."],
    ]),
  },
  "a-buddy-notify": {
    id: "a-buddy-notify",
    name: "Manager & buddy informeren",
    system: "zapier",
    description: "Slack-bericht naar manager en aangewezen buddy met checklist.",
    status: "active",
    lastRun: "1 uur geleden",
    steps: mkSteps([
      ["notify", "Slack DM", "Met onboarding checklist."],
    ]),
  },

  /* —— Factuur verwerken (Finance) —— */
  "a-invoice-inbox": {
    id: "a-invoice-inbox",
    name: "Factuur mailbox monitoren",
    system: "power",
    description: "Pakt nieuwe facturen op uit de gedeelde inbox.",
    status: "active",
    lastRun: "20 min geleden",
    steps: mkSteps([
      ["trigger", "Nieuwe email met PDF", "facturen@acme.nl."],
    ]),
  },
  "a-invoice-ocr": {
    id: "a-invoice-ocr",
    name: "Factuur OCR",
    system: "custom",
    description: "Leest factuur uit met OCR en extraheert leverancier, bedrag, IBAN.",
    status: "active",
    lastRun: "20 min geleden",
    steps: mkSteps([
      ["action", "OCR via Klippa", "PDF naar gestructureerde data."],
      ["transform", "Velden mappen", "Naar Exact-formaat."],
    ]),
  },
  "a-invoice-match-po": {
    id: "a-invoice-match-po",
    name: "Match met PO",
    system: "make",
    description: "Zoekt bijbehorende inkooporder en matcht regels.",
    status: "active",
    lastRun: "20 min geleden",
    steps: mkSteps([
      ["action", "PO zoeken", "Op leverancier en referentie."],
      ["condition", "3-way match", "PO + ontvangst + factuur."],
    ]),
  },
  "a-invoice-approval": {
    id: "a-invoice-approval",
    name: "Goedkeuring routeren",
    system: "logic",
    description: "Stuurt naar de juiste goedkeurder o.b.v. bedrag en kostenplaats.",
    status: "paused",
    lastRun: "3 uur geleden",
    steps: mkSteps([
      ["transform", "Approver bepalen", "Drempelbedragen."],
      ["notify", "Teams approval", "Adaptive card."],
    ]),
  },
  "a-invoice-book": {
    id: "a-invoice-book",
    name: "Boeken in Exact",
    system: "custom",
    description: "Boekt de goedgekeurde factuur in Exact Online.",
    status: "active",
    lastRun: "1 dag geleden",
    steps: mkSteps([
      ["action", "Exact API push", "Boekstuk aanmaken."],
    ]),
  },

  /* —— Verlofaanvraag (HR) —— */
  "a-leave-request": {
    id: "a-leave-request",
    name: "Verlofaanvraag ontvangen",
    system: "power",
    description: "Trigger bij nieuwe verlofaanvraag in AFAS.",
    status: "active",
    lastRun: "5 uur geleden",
    steps: mkSteps([
      ["trigger", "leave.created", "Vanuit AFAS."],
    ]),
  },
  "a-leave-balance": {
    id: "a-leave-balance",
    name: "Saldo controleren",
    system: "logic",
    description: "Checkt of de medewerker voldoende verlofuren heeft.",
    status: "active",
    lastRun: "5 uur geleden",
    steps: mkSteps([
      ["condition", "Saldo voldoende?", "Anders melding."],
    ]),
  },
  "a-leave-approval": {
    id: "a-leave-approval",
    name: "Manager goedkeuring",
    system: "zapier",
    description: "Stuurt goedkeuringsverzoek naar de manager via Slack.",
    status: "active",
    lastRun: "5 uur geleden",
    steps: mkSteps([
      ["notify", "Slack approval", "Approve / Decline knoppen."],
    ]),
  },
  "a-calendar-sync": {
    id: "a-calendar-sync",
    name: "Agenda synchroniseren",
    system: "logic",
    description: "Plaatst verlof in persoonlijke en team-agenda.",
    status: "active",
    lastRun: "5 uur geleden",
    steps: mkSteps([
      ["action", "Outlook event", "Met out-of-office."],
    ]),
  },
};

/* -------------------------------------------------------------------------- */
/*  BUSINESS PROCESSES                                                        */
/* -------------------------------------------------------------------------- */

const seq = (ids: string[], animateFirst = true): AutomationEdge[] =>
  ids.slice(0, -1).map((from, i) => ({
    from,
    to: ids[i + 1],
    animated: animateFirst && i === 0,
  }));

export const PROCESSES: BusinessProcess[] = [
  {
    id: "p-contact-creation",
    name: "Contact aanmaken",
    category: "Sales",
    owner: "Revenue Operations",
    status: "active",
    trigger: "Nieuwe inzending op website",
    frequency: "Realtime · ~80x per dag",
    lastRun: "4 min geleden",
    successRate: 99.1,
    description:
      "Wanneer een lead binnenkomt via het webformulier, wordt het contact volledig aangemaakt en verrijkt: email gevalideerd, KVK-data opgehaald, duplicaten gecheckt, contact en bedrijf in HubSpot gezet, owner toegewezen, en sales geïnformeerd — allemaal binnen 30 seconden.",
    automationIds: [
      "a-webform-capture",
      "a-email-validate",
      "a-dedupe-contact",
      "a-kvk-enrich",
      "a-hubspot-create-contact",
      "a-hubspot-create-company",
      "a-assign-owner",
      "a-segment-event",
      "a-slack-notify-sales",
      "a-welcome-email",
    ],
    edges: [
      ...seq([
        "a-webform-capture",
        "a-email-validate",
        "a-dedupe-contact",
        "a-kvk-enrich",
        "a-hubspot-create-contact",
      ]),
      { from: "a-hubspot-create-contact", to: "a-hubspot-create-company" },
      { from: "a-hubspot-create-company", to: "a-assign-owner" },
      { from: "a-assign-owner", to: "a-segment-event" },
      { from: "a-assign-owner", to: "a-slack-notify-sales" },
      { from: "a-assign-owner", to: "a-welcome-email" },
    ],
  },
  {
    id: "p-deal-stage",
    name: "Deal stage wijzigen",
    category: "Sales",
    owner: "Revenue Operations",
    status: "active",
    trigger: "Stage-wijziging in HubSpot",
    frequency: "Realtime · ~25x per dag",
    lastRun: "12 min geleden",
    successRate: 97.6,
    description:
      "Wanneer een deal in HubSpot van stage verandert, valideert dit proces de gegevens, haalt KVK-info op voor verificatie, genereert eventueel een contract en informeert de juiste teams. Bij Closed Won loopt de deal automatisch door naar Finance.",
    automationIds: [
      "a-deal-stage-change",
      "a-deal-validate",
      "a-kvk-enrich",
      "a-contract-generate",
      "a-finance-notify",
    ],
    edges: [
      { from: "a-deal-stage-change", to: "a-deal-validate", animated: true },
      { from: "a-deal-validate", to: "a-kvk-enrich" },
      { from: "a-kvk-enrich", to: "a-contract-generate", label: "Closed Won" },
      { from: "a-contract-generate", to: "a-finance-notify" },
    ],
  },
  {
    id: "p-onboarding",
    name: "Onboarding nieuwe medewerker",
    category: "HR",
    owner: "People Operations",
    status: "active",
    trigger: "Nieuwe medewerker in AFAS",
    frequency: "Realtime · ~12x per maand",
    lastRun: "1 uur geleden",
    successRate: 98.4,
    description:
      "Volledig digitale onboarding wanneer HR een nieuwe medewerker aanmaakt in AFAS. Account, mailbox, toegang tot systemen, welkomstpakket en notificaties naar manager en buddy — zonder handmatig werk.",
    automationIds: [
      "a-afas-new-employee",
      "a-entra-create-account",
      "a-access-bundle",
      "a-tools-provision",
      "a-welcome-package",
      "a-buddy-notify",
    ],
    edges: seq([
      "a-afas-new-employee",
      "a-entra-create-account",
      "a-access-bundle",
      "a-tools-provision",
      "a-welcome-package",
      "a-buddy-notify",
    ]),
  },
  {
    id: "p-invoice",
    name: "Factuur verwerken",
    category: "Finance",
    owner: "Finance Operations",
    status: "active",
    trigger: "Email in facturen-inbox",
    frequency: "Realtime · ~40x per dag",
    lastRun: "20 min geleden",
    successRate: 94.2,
    description:
      "Inkomende facturen worden automatisch uitgelezen, gematcht met inkooporders, naar de juiste goedkeurder gestuurd en uiteindelijk in Exact geboekt. Handmatige inboeking is alleen nog nodig bij uitzonderingen.",
    automationIds: [
      "a-invoice-inbox",
      "a-invoice-ocr",
      "a-invoice-match-po",
      "a-invoice-approval",
      "a-invoice-book",
    ],
    edges: seq([
      "a-invoice-inbox",
      "a-invoice-ocr",
      "a-invoice-match-po",
      "a-invoice-approval",
      "a-invoice-book",
    ]),
  },
  {
    id: "p-leave",
    name: "Verlofaanvraag",
    category: "HR",
    owner: "People Operations",
    status: "active",
    trigger: "Verlofaanvraag in AFAS",
    frequency: "Realtime · ~20x per week",
    lastRun: "5 uur geleden",
    successRate: 99.8,
    description:
      "Verlofaanvragen worden automatisch gecontroleerd op saldo, ter goedkeuring naar de manager gestuurd en bij goedkeuring direct in agenda's en out-of-office gezet.",
    automationIds: [
      "a-leave-request",
      "a-leave-balance",
      "a-leave-approval",
      "a-calendar-sync",
    ],
    edges: seq([
      "a-leave-request",
      "a-leave-balance",
      "a-leave-approval",
      "a-calendar-sync",
    ]),
  },
  {
    id: "p-lead-enrichment",
    name: "Lead verrijking & scoring",
    category: "Marketing",
    owner: "Marketing Operations",
    status: "paused",
    trigger: "Nieuwe lead in HubSpot",
    frequency: "Elke 15 minuten",
    lastRun: "3 uur geleden",
    successRate: 96.0,
    description:
      "Verrijkt nieuwe leads met KVK- en Clearbit-data, berekent een score op basis van firmographics en gedrag, en routeert hot leads direct naar sales.",
    automationIds: ["a-kvk-enrich", "a-segment-event", "a-slack-notify-sales"],
    edges: seq(["a-kvk-enrich", "a-segment-event", "a-slack-notify-sales"]),
  },
];

/** Build reverse index: which processes use a given automation. */
export const getProcessesUsingAutomation = (automationId: string): BusinessProcess[] =>
  PROCESSES.filter((p) => p.automationIds.includes(automationId));

export const getProcess = (id: string) => PROCESSES.find((p) => p.id === id);

export const totalSystemsAcrossPortal = (): number => {
  const set = new Set<SystemKey>();
  Object.values(ATOMIC_AUTOMATIONS).forEach((a) => set.add(a.system));
  return set.size;
};

export const systemsForProcess = (p: BusinessProcess): SystemKey[] => {
  const set = new Set<SystemKey>();
  p.automationIds.forEach((id) => {
    const a = ATOMIC_AUTOMATIONS[id];
    if (a) set.add(a.system);
  });
  return Array.from(set);
};
