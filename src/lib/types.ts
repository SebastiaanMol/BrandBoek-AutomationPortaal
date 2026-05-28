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

export type Systeem = "HubSpot" | "Zapier" | "Typeform" | "SharePoint" | "WeFact" | "Docufy" | "Backend" | "E-mail" | "API" | "GitLab" | "Anders";

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

export interface GitLabEndpointInfo {
  method?: string;
  endpoint?: string;
  api_file?: string;
  handler?: string;
  calls?: GitLabCallInfo[];
}

export interface GitLabCallInfo {
  depth: number;
  kind: string;
  from: string;
  to: string;
  file: string | null;
}

export interface HubSpotWorkflowTriggerInfo {
  objectType?: string | null;
  property?: string | null;
  operator?: string | null;
  value?: string | number | boolean | null;
  label: string;
  source: string;
}

export interface HubSpotWorkflowActionInfo {
  index: number;
  type: string;
  label: string;
  webhookUrl?: string | null;
  webhookMethod?: string | null;
  webhookPath?: string | null;
  enrollWorkflowId?: string | null;
  propertyName?: string | null;
  propertyValue?: string | number | boolean | null;
}

export interface HubSpotWorkflowUserAuditInfo {
  id?: string | null;
  email?: string | null;
  label: string;
}

export interface HubSpotWorkflowBranchInfo {
  id: string;
  label: string;
  conditionLabel?: string | null;
  actions?: HubSpotWorkflowActionInfo[];
}

export interface HubSpotWorkflowInfo {
  workflowId?: string | null;
  name: string;
  objectType?: string | null;
  enrollmentType?: string | null;
  shouldReEnroll?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: HubSpotWorkflowUserAuditInfo | null;
  updatedBy?: HubSpotWorkflowUserAuditInfo | null;
  triggers: HubSpotWorkflowTriggerInfo[];
  actions: HubSpotWorkflowActionInfo[];
  branches?: HubSpotWorkflowBranchInfo[];
}

export interface ZapierWebhookHandoffInfo {
  method: string;
  path: string;
  host?: string;
}

export interface ZapierProcessStepInfo {
  index: number;
  appName: string;
  title: string;
  type: string;
  kind: string;
  summary: string;
  details: string[];
  webhookPaths: string[];
}

export interface ZapierProcessInfo {
  trigger: string;
  outcome: string;
  conditions: string[];
  emails: Array<{ subject: string; recipients: string[] }>;
  webhookHandoffs: ZapierWebhookHandoffInfo[];
  dataLookups: string[];
  steps: ZapierProcessStepInfo[];
}

export interface TypeformWebhookHandoffInfo {
  method: string;
  path: string;
  host?: string;
}

export interface TypeformProcessStepInfo {
  index: number;
  kind: string;
  title: string;
  summary: string;
  details: string[];
  webhookPaths: string[];
}

export interface TypeformProcessInfo {
  trigger: string;
  outcome: string;
  webhookHandoffs: TypeformWebhookHandoffInfo[];
  steps: TypeformProcessStepInfo[];
}

export interface TypeformImportInfo {
  form?: {
    id?: string;
    title?: string;
    display_url?: string;
    hidden_fields?: string[];
    fields?: Array<{
      id: string;
      ref?: string;
      title: string;
      type: string;
      choices?: string[];
    }>;
  };
  webhooks?: Array<{
    tag: string;
    enabled: boolean;
    eventTypes: string[];
    path?: string;
    host?: string;
  }>;
  process?: TypeformProcessInfo;
}

export interface AutomationStandardStepInfo {
  index: number;
  kind: string;
  title: string;
  summary: string;
  details: string[];
  evidenceRefs: string[];
}

export interface AutomationStandardProcessInfo {
  source: string;
  trigger: string;
  outcome: string;
  systems: string[];
  handoffs?: Array<{
    from: string;
    to: string;
    kind: string;
    evidence?: string;
  }>;
  steps: AutomationStandardStepInfo[];
  confidence?: Record<string, unknown>;
}

export interface GitLabImportInfo {
  endpoint?: {
    method?: string;
    path?: string;
    api_file?: string;
    handler?: string;
  };
  calls?: GitLabCallInfo[];
  hubspotReads?: GitLabCallInfo[];
  hubspotWrites?: GitLabCallInfo[];
  internalCalls?: GitLabCallInfo[];
  backgroundTasks?: GitLabCallInfo[];
}

export interface AutomationImportProposal {
  source?: string;
  read_only?: boolean;
  standard?: AutomationStandardProcessInfo;
  gitlab?: GitLabImportInfo;
  gitlab_endpoint?: GitLabEndpointInfo;
  beschrijving_in_simpele_taal?: string[];
  zap?: {
    id?: string;
    title?: string;
    status?: string;
    process?: ZapierProcessInfo;
    steps?: ZapierProcessStepInfo[];
  };
  typeform?: TypeformImportInfo;
  webhookPaths?: string[];
  [key: string]: unknown;
}

export type AutomationSourceFindingType =
  | "source_missing"
  | "source_data_incomplete"
  | "source_changed"
  | "webhook_changed"
  | "metadata_changed";

export type AutomationSourceFindingSeverity = "info" | "warning" | "critical";

export interface AutomationSourceFinding {
  id: string;
  automationId: string;
  source: string;
  externalId?: string | null;
  type: AutomationSourceFindingType;
  severity: AutomationSourceFindingSeverity;
  message: string;
  details?: Record<string, unknown>;
  dedupeKey?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string | null;
  resolvedReason?: string | null;
  syncRunId?: string | null;
}

// ── Pipeline stages ──────────────────────────────────────────────────────────

// PipelineStage represents the JSONB document shape as stored in the `pipelines.stages` column.
// snake_case field names match the stored JSON keys (no column-name mapping applied).
export interface PipelineStage {
  stage_id:      string;
  label:         string;
  display_order: number;
  metadata:      Record<string, unknown>;
}

export interface Pipeline {
  pipelineId:   string;
  naam:         string;
  stages:       PipelineStage[];
  syncedAt:     string;
  updatedAt:    string;
  beschrijving: string | null;
  isActive:     boolean;
  source:       "hubspot" | "custom";
}

// ── Flow ─────────────────────────────────────────────────────────────────────

export interface Flow {
  id: string;
  naam: string;
  beschrijving: string;
  systemen: Systeem[];
  automationIds: string[];
  createdAt: string;
  updatedAt: string;
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
  endpoints?: string[];
  source?: string;
  lastSyncedAt?: string | null;
  hubspotLastRunAt?: string | null;
  hubspotRunCount365d?: number | null;
  hubspotWorkflow?: HubSpotWorkflowInfo;
  webhookPaths?: string[];
  branches?: AutomationBranch[];
  beschrijvingInSimpeleTaal?: string[];
  gitlabFilePath?: string;
  gitlabEndpoint?: GitLabEndpointInfo;
  importProposal?: AutomationImportProposal;
  gitlabLastCommit?: string;
  aiDescription?: string;
  aiDescriptionUpdatedAt?: string | null;
  cleanupDeleteCandidate?: boolean;
  cleanupDeleteCandidateAt?: string | null;
  sourceFindings?: AutomationSourceFinding[];
  pipelineId?:            string;
  stageId?:               string;
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

export function getVerificatieStatus(a: Automatisering, periodeDagen = 90): VerificatieStatus {
  if (!a.laatstGeverifieerd) return "nooit";
  const diff = Date.now() - new Date(a.laatstGeverifieerd).getTime();
  const threshold = periodeDagen * 24 * 60 * 60 * 1000;
  return diff <= threshold ? "geverifieerd" : "verouderd";
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

export const SYSTEMEN: Systeem[] = ["HubSpot", "Zapier", "Typeform", "SharePoint", "WeFact", "Docufy", "Backend", "E-mail", "API", "GitLab", "Anders"];

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

// ── Portal Settings ──────────────────────────────────────────────────────────

export type VerplichtVeld =
  | "doel"
  | "trigger"
  | "systemen"
  | "stappen"
  | "owner"
  | "fasen"
  | "afhankelijkheden";

export const VERPLICHTE_VELDEN: VerplichtVeld[] = [
  "doel", "trigger", "systemen", "stappen", "owner", "fasen", "afhankelijkheden"
];

export interface PortalSettings {
  verificatiePeriodeDagen: number;
  beschikbareStatussen: Status[];
  beschikbareCategorieen: Categorie[];
  standaardStatusFilter: string;
  standaardSortering: "created_at" | "naam" | "status";
  verplichtVelden: VerplichtVeld[];
  extraSystemen: string[];
  extraCategorieen: string[];
}

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  verificatiePeriodeDagen: 90,
  beschikbareStatussen: ["Actief", "Verouderd", "In review", "Uitgeschakeld"],
  beschikbareCategorieen: [
    "HubSpot Workflow", "Zapier Zap", "Backend Script", "HubSpot + Zapier",
    "Typeform", "SharePoint", "WeFact", "Docufy", "E-mail", "API", "Anders",
  ],
  standaardStatusFilter: "alle",
  standaardSortering: "created_at",
  verplichtVelden: [],
  extraSystemen: [],
  extraCategorieen: [],
};

export function getPortalSettings(raw: Partial<PortalSettings>): PortalSettings {
  return { ...DEFAULT_PORTAL_SETTINGS, ...raw };
}
