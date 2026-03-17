import { Automatisering, Koppeling } from "./types";

const STORAGE_KEY = "automatiseringen";

const SEED_DATA: Automatisering[] = [
  {
    id: "AUTO-001",
    naam: "Deal Stage Notificatie",
    categorie: "HubSpot Workflow",
    doel: "Stuur een Slack-melding wanneer een deal naar 'Voorstel verstuurd' gaat",
    trigger: "Deal stage verandert naar 'Voorstel verstuurd'",
    systemen: ["HubSpot", "API"],
    stappen: [
      "HubSpot detecteert deal stage wijziging",
      "Workflow triggert webhook naar Slack API",
      "Slack bericht wordt verstuurd naar #sales kanaal",
    ],
    afhankelijkheden: "Slack API token moet geldig zijn. HubSpot workflow moet actief staan.",
    owner: "Jasper",
    status: "Actief",
    verbeterideeën: "Bericht personaliseren met deal-eigenaar naam",
    mermaidDiagram: `graph TD
    A[Deal Stage Wijziging] -->|Trigger| B(HubSpot Workflow)
    B --> C{Webhook}
    C -->|POST| D[Slack API]
    D --> E[#sales Melding]`,
    koppelingen: [
      { doelId: "AUTO-002", label: "Geen reactie op deal triggert lead follow-up" },
      { doelId: "AUTO-003", label: "Deal akkoord levert data voor rapportage" },
    ],
    fasen: ["Sales"],
    createdAt: new Date().toISOString(),
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
  },
  {
    id: "AUTO-002",
    naam: "Nieuwe Lead E-mail Flow",
    categorie: "Zapier Zap",
    doel: "Automatisch welkomstmail sturen bij nieuwe HubSpot lead",
    trigger: "Nieuw contact aangemaakt in HubSpot",
    systemen: ["HubSpot", "Zapier", "E-mail"],
    stappen: [
      "HubSpot contact wordt aangemaakt",
      "Zapier detecteert nieuw contact via polling",
      "E-mail template wordt opgehaald",
      "Welkomstmail wordt verstuurd",
    ],
    afhankelijkheden: "Zapier connectie met HubSpot. E-mail template moet bestaan.",
    owner: "Lisa",
    status: "Actief",
    verbeterideeën: "Migreren naar native HubSpot workflow voor snellere verwerking",
    mermaidDiagram: `graph TD
    A[Nieuw HubSpot Contact] -->|Poll| B(Zapier Trigger)
    B --> C[Template Ophalen]
    C --> D[E-mail Versturen]
    D --> E[Lead Onboarded]`,
    koppelingen: [
      { doelId: "AUTO-001", label: "Klant reageert → terug naar Sales flow" },
    ],
    fasen: ["Marketing", "Sales"],
    createdAt: new Date().toISOString(),
  },
  {
    id: "AUTO-003",
    naam: "Dagelijkse Rapportage Script",
    categorie: "Backend Script",
    doel: "Genereer dagelijks een CSV-rapport van alle openstaande deals",
    trigger: "Cron job om 08:00",
    systemen: ["Backend", "HubSpot", "API"],
    stappen: [
      "Cron job start Python script",
      "Script haalt deals op via HubSpot API",
      "Data wordt gefilterd en geaggregeerd",
      "CSV wordt gegenereerd",
      "Rapport wordt ge-upload naar SharePoint",
    ],
    afhankelijkheden: "HubSpot API key. SharePoint toegang. Server uptime.",
    owner: "Jasper",
    status: "Verouderd",
    verbeterideeën: "Vervangen door HubSpot native rapportage",
    mermaidDiagram: `graph TD
    A[Cron 08:00] --> B[Python Script]
    B --> C[HubSpot API]
    C --> D[Data Aggregatie]
    D --> E[CSV Generatie]
    E --> F[SharePoint Upload]`,
    koppelingen: [],
    fasen: ["Boekhouding"],
    createdAt: new Date().toISOString(),
  },
];

export function getAutomatiseringen(): Automatisering[] {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
    return SEED_DATA;
  }
  const parsed: Automatisering[] = JSON.parse(data);
  return parsed.map((a) => ({
    ...a,
    koppelingen: a.koppelingen || [],
    fasen: a.fasen || [],
  }));
}

export function saveAutomatisering(item: Automatisering): void {
  const all = getAutomatiseringen();
  all.push(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function updateAutomatisering(item: Automatisering): void {
  const all = getAutomatiseringen();
  const idx = all.findIndex((a) => a.id === item.id);
  if (idx >= 0) all[idx] = item;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function generateId(): string {
  const all = getAutomatiseringen();
  const num = all.length + 1;
  return `AUTO-${String(num).padStart(3, "0")}`;
}

export function exportToCSV(data: Automatisering[]): string {
  const headers = ["ID", "Naam", "Categorie", "Doel", "Trigger", "Systemen", "Owner", "Status", "Fasen"];
  const rows = data.map((a) => [
    a.id, a.naam, a.categorie, a.doel, a.trigger,
    a.systemen.join("; "), a.owner, a.status, (a.fasen || []).join("; "),
  ]);
  return [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
}
