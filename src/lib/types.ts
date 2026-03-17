export type Categorie = 
  | "HubSpot Workflow"
  | "Zapier Zap"
  | "Backend Script"
  | "HubSpot + Zapier"
  | "Anders";

export type Systeem = "HubSpot" | "Zapier" | "Typeform" | "SharePoint" | "WeFact" | "Docufy" | "Backend" | "E-mail" | "API" | "Anders";

export type Status = "Actief" | "Verouderd" | "In review" | "Uitgeschakeld";

export interface Koppeling {
  doelId: string;
  label: string;
}

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
  createdAt: string;
}

export const CATEGORIEEN: Categorie[] = [
  "HubSpot Workflow",
  "Zapier Zap",
  "Backend Script",
  "HubSpot + Zapier",
  "Anders",
];

export const SYSTEMEN: Systeem[] = ["HubSpot", "Zapier", "Typeform", "SharePoint", "WeFact", "Docufy", "Backend", "E-mail", "API", "Anders"];

export const STATUSSEN: Status[] = ["Actief", "Verouderd", "In review", "Uitgeschakeld"];
