import { Categorie, Status, STATUS_LABELS, Systeem } from "@/lib/types";

export function SystemBadge({ systeem }: { systeem: Systeem | string }) {
  const map: Record<string, string> = {
    HubSpot: "badge-hubspot",
    Zapier: "badge-zapier",
    Backend: "badge-backend",
    Typeform: "badge-typeform",
    SharePoint: "badge-sharepoint",
    WeFact: "badge-wefact",
    Docufy: "badge-docufy",
    "E-mail": "badge-email",
    API: "badge-api",
    GitLab: "badge-gitlab",
  };
  return <span className={map[systeem] || "badge-backend"}>{systeem}</span>;
}

export function CategorieBadge({ categorie }: { categorie: Categorie }) {
  const map: Record<string, string> = {
    "HubSpot Workflow": "badge-hubspot",
    "Zapier Zap": "badge-zapier",
    "HubSpot + Zapier": "badge-hubspot",
    "Backend Script": "badge-backend",
    Typeform: "badge-typeform",
    SharePoint: "badge-sharepoint",
    WeFact: "badge-wefact",
    Docufy: "badge-docufy",
    "E-mail": "badge-email",
    API: "badge-api",
  };
  return <span className={map[categorie] || "badge-backend"}>{categorie}</span>;
}

export function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    Actief: "badge-status-active",
    Verouderd: "badge-status-outdated",
    "In review": "badge-status-review",
    Uitgeschakeld: "badge-status-disabled",
  };
  return (
    <span className={`${map[status]} inline-flex items-center gap-1`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
