export type Categorie = 
  | "HubSpot Workflow"
  | "Zapier Zap"
  | "Backend Script"
  | "HubSpot + Zapier"
  | "Typeform"
  | "SharePoint"
  | "WeFact"
  | "Docufy"
  | "E-mail"
  | "API"
  | "Anders";

export type Systeem = "HubSpot" | "Zapier" | "Typeform" | "SharePoint" | "WeFact" | "Docufy" | "Backend" | "E-mail" | "API" | "Anders";

export type Status = "Actief" | "Verouderd" | "In review" | "Uitgeschakeld";

export type KlantFase = "Marketing" | "Sales" | "Onboarding" | "Boekhouding" | "Offboarding";

export interface Koppeling {
  doelId: string;
  label: string;
}

// ── Branch / Gateway types ───────────────────────────────────────────────────

export interface AutomationBranch {
  id: string;
  label: string;       // bijv. "Heeft bankkoppeling"
  toStepId: string;    // doelstap
  description?: string; // optionele toelichting (plain text)
}

// ── Automatisering ───────────────────────────────────────────────────────────

export interface Automatisering {
  id: string;
  naam: string;
  categorie: Categorie;
  doel: string;
  trigger: string;
  systemen: Systeem[];
  stappen: string[];
  afhankelijkheden: string;
  owner: string;
  status: Status;
  verbeterideeën: string;
  mermaidDiagram: string;
  koppelingen: Koppeling[];
  fasen: KlantFase[];
  createdAt: string;
  laatstGeverifieerd: string | null;
  geverifieerdDoor: string;
  externalId?: string;
  source?: string;
  lastSyncedAt?: string | null;
  branches?: AutomationBranch[];
}

export interface Integration {
  id: string;
  userId: string;
  type: string;
  token: string;
  lastSyncedAt: string | null;
  status: "connected" | "error" | "disconnected";
  errorMessage: string | null;
  createdAt: string;
}

export type VerificatieStatus = "geverifieerd" | "verouderd" | "nooit";

export function getVerificatieStatus(a: Automatisering): VerificatieStatus {
  if (!a.laatstGeverifieerd) return "nooit";
  const diff = Date.now() - new Date(a.laatstGeverifieerd).getTime();
  const days90 = 90 * 24 * 60 * 60 * 1000;
  return diff <= days90 ? "geverifieerd" : "verouderd";
}

export const CATEGORIEEN: Categorie[] = [
  "HubSpot Workflow",
  "Zapier Zap",
  "Backend Script",
  "HubSpot + Zapier",
  "Typeform",
  "SharePoint",
  "WeFact",
  "Docufy",
  "E-mail",
  "API",
  "Anders",
];

export const SYSTEMEN: Systeem[] = ["HubSpot", "Zapier", "Typeform", "SharePoint", "WeFact", "Docufy", "Backend", "E-mail", "API", "Anders"];

export const STATUSSEN: Status[] = ["Actief", "Verouderd", "In review", "Uitgeschakeld"];

export const STATUS_LABELS: Record<string, string> = {
  "Actief": "Active",
  "Verouderd": "Outdated",
  "Uitgeschakeld": "Disabled",
  "In review": "In Review",
};

export const VERIFICATIE_LABELS: Record<string, string> = {
  "geverifieerd": "Verified",
  "verouderd": "Outdated",
  "nooit": "Never",
};

export const KLANT_FASEN: KlantFase[] = ["Marketing", "Sales", "Onboarding", "Boekhouding", "Offboarding"];

// --- Computed scores ---

export function berekenComplexiteit(a: Automatisering): number {
  const stappenScore = Math.min((a.stappen?.length || 0) * 10, 40);
  const systemenScore = Math.min((a.systemen?.length || 0) * 12, 36);
  const afhankelijkhedenScore = a.afhankelijkheden?.trim() ? 15 : 0;
  const koppelingenScore = Math.min((a.koppelingen?.length || 0) * 5, 15);
  return Math.min(stappenScore + systemenScore + afhankelijkhedenScore + koppelingenScore, 100);
}

export function berekenImpact(a: Automatisering, alle: Automatisering[]): number {
  // Count how many other automations depend on this one (direct + indirect)
  const directDeps = alle.filter((other) =>
    other.koppelingen?.some((k) => k.doelId === a.id)
  ).length;

  // Fasen coverage — more phases = more impact
  const fasenScore = (a.fasen?.length || 0) * 12;

  // Systems breadth
  const systemenScore = (a.systemen?.length || 0) * 8;

  // Direct dependencies
  const depScore = directDeps * 20;

  // Active = higher impact
  const statusBonus = a.status === "Actief" ? 10 : 0;

  return Math.min(fasenScore + systemenScore + depScore + statusBonus, 100);
}
