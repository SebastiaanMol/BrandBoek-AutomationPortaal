import { Link, Navigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2, Pencil, Sparkles } from "lucide-react";
import { StatusBadge, CategorieBadge, SystemBadge, SourceBadge } from "@/components/Badges";
import { useAutomatiseringen, useSetCleanupDeleteCandidate } from "@/lib/hooks";
import { AutomatiseringDetailPanel } from "./AlleAutomatiseringen";
import { getAutomationDetailDisplayName } from "@/lib/automationDetailPresentation";

export default function AutomationDetailPage(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const { data: automations = [], isLoading } = useAutomatiseringen();
  const cleanupMarker = useSetCleanupDeleteCandidate();
  const automation = automations.find((item) => item.id === id);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!automation) return <Navigate to="/alle" replace />;

  const primarySystem = automation.systemen[0] || "Anders";
  const sourceMissingFinding = automation.sourceFindings?.find((finding) => finding.type === "source_missing" && !finding.resolvedAt);
  const displayName = getAutomationDetailDisplayName(automation);

  return (
    <div className="mx-auto max-w-[1180px] space-y-6 px-6 py-8 lg:px-10">
      <header className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <Link
          to="/alle"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Terug naar automations
        </Link>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <SourceBadge source={automation.source} />
              <StatusBadge status={automation.status} />
              <CategorieBadge categorie={automation.categorie} />
              <SystemBadge systeem={primarySystem} />
            </div>
            <p className="font-mono text-xs text-muted-foreground">{automation.id}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {displayName}
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to={`/brandy?context=${automation.id}&naam=${encodeURIComponent(displayName)}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Vraag Brandy
            </Link>
            <Link
              to={`/bewerk/${automation.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Pencil className="h-3.5 w-3.5" />
              Bewerken
            </Link>
          </div>
        </div>
      </header>

      {sourceMissingFinding && (
        <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-red-700">Bronwaarschuwing</p>
                <h2 className="mt-1 text-lg font-semibold">
                  {sourceMissingFinding.message || `Deze automation kan niet meer worden teruggevonden bij ${formatSourceName(sourceMissingFinding.source)}.`}
                </h2>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-red-800">
                <span>Voor het eerst gezien: {formatFindingDate(sourceMissingFinding.firstSeenAt)}</span>
                <span>Laatst bevestigd: {formatFindingDate(sourceMissingFinding.lastSeenAt)}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <AutomatiseringDetailPanel
          a={automation}
          cleanupMarker={cleanupMarker}
          variant="page"
        />
      </section>
    </div>
  );
}

function formatSourceName(source: string | undefined | null): string {
  if (source === "hubspot") return "HubSpot";
  if (source === "gitlab") return "GitLab";
  if (source === "zapier") return "Zapier";
  if (source === "typeform") return "Typeform";
  return "de bron";
}

function formatFindingDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "onbekend";
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
