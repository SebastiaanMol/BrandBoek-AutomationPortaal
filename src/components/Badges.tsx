import { Categorie, Status, Systeem } from "@/lib/types";

export function SystemBadge({ systeem }: { systeem: Systeem | string }) {
  const map: Record<string, string> = {
    HubSpot: "badge-hubspot",
    Zapier: "badge-zapier",
    Backend: "badge-backend",
  };
  return <span className={map[systeem] || "badge-backend"}>{systeem}</span>;
}

export function CategorieBadge({ categorie }: { categorie: Categorie }) {
  if (categorie.includes("HubSpot") && categorie.includes("Zapier"))
    return <span className="badge-hubspot">HubSpot + Zapier</span>;
  if (categorie.includes("HubSpot")) return <span className="badge-hubspot">{categorie}</span>;
  if (categorie.includes("Zapier")) return <span className="badge-zapier">{categorie}</span>;
  if (categorie.includes("Backend")) return <span className="badge-backend">{categorie}</span>;
  return <span className="badge-backend">{categorie}</span>;
}

export function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    Actief: "badge-status-actief",
    Verouderd: "badge-status-verouderd",
    "In review": "badge-status-review",
    Uitgeschakeld: "badge-status-uitgeschakeld",
  };
  return (
    <span className={`${map[status]} inline-flex items-center gap-1`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
