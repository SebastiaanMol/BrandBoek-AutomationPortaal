import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ExternalLink, GitBranch, Loader2, Search, ServerCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAutomatiseringenIncludingLegacyGitlab } from "@/lib/hooks";
import {
  getGitLabEndpointCheckPresentation,
  type GitLabEndpointCheckRow,
  type GitLabEndpointLinkStatus,
} from "@/lib/gitlabEndpointCheckPresentation";

type FilterValue = "all" | GitLabEndpointLinkStatus;

const FILTERS: Array<{ value: FilterValue; label: string }> = [
  { value: "all", label: "Alle endpoints" },
  { value: "no_endpoint", label: "Geen endpoint" },
  { value: "not_linkable", label: "Niet linkbaar" },
  { value: "shared", label: "Gedeeld endpoint" },
  { value: "linked", label: "Gekoppeld" },
];

export default function GitLabEndpointCheck() {
  const { data: automations = [], isLoading } = useAutomatiseringenIncludingLegacyGitlab();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [query, setQuery] = useState("");
  const presentation = useMemo(
    () => getGitLabEndpointCheckPresentation(automations),
    [automations],
  );
  const visibleRows = useMemo(
    () => presentation.rows.filter((row) => {
      const matchesFilter = filter === "all"
        ? row.hasEndpoint
        : row.linkStatus === filter;
      const haystack = [
        row.automationName,
        row.automationId,
        row.normalizedPath,
        row.path,
        row.method,
        row.sourceField,
        row.handler,
        row.apiFile,
        row.issue,
      ].join(" ").toLowerCase();
      return matchesFilter && haystack.includes(query.trim().toLowerCase());
    }),
    [filter, presentation.rows, query],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <p className="label-uppercase">Developer tool</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              GitLab endpoint check
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Tijdelijke developer-pagina om specifieke GitLab endpoint-automations te controleren. Legacy/bestandsrecords blijven zichtbaar als geen endpoint.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/analyse">
                <GitBranch className="h-4 w-4" />
                Terug naar analyse
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="GitLab endpoint metrics">
        <MetricCard label="GitLab endpoint automations" value={presentation.metrics.totalGitLabAutomations} detail="specifieke endpoint-nodes" tone="neutral" />
        <MetricCard label="Geen endpoint" value={presentation.metrics.automationsWithoutEndpoint} detail="legacy/bestandsrecords" tone="critical" />
        <MetricCard label="Endpoint routes" value={presentation.metrics.endpointRows} detail="ontvangende GitLab routes" tone="info" />
        <MetricCard label="Niet linkbaar" value={presentation.metrics.notLinkableEndpointRows} detail="geen primaire procesreis-match" tone="warning" />
        <MetricCard label="Linkbaar" value={presentation.metrics.linkedEndpointRows + presentation.metrics.sharedEndpointRows} detail="gekoppeld of gedeeld endpoint" tone="good" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="label-uppercase">GitLab endpoint automations</p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">
                Endpoint en procesreis-linkbaarheid
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                De tabel gebruikt dezelfde harde route-analyse als de analytics-cockpit: normalized path, methode en inkomende webhook/endpoint-bewijs.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-[260px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Zoek naam, path, handler..."
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === item.value
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-border bg-background text-muted-foreground hover:bg-secondary"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="border-b border-border bg-secondary/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Automation</th>
                <th className="px-4 py-3 font-semibold">Endpoint</th>
                <th className="px-4 py-3 font-semibold">Procesreis</th>
                <th className="px-4 py-3 font-semibold">Sender / bewijs</th>
                <th className="px-4 py-3 font-semibold">Waarom</th>
                <th className="px-4 py-3 font-semibold">Actie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Geen GitLab endpoint automations gevonden voor deze filter.
                  </td>
                </tr>
              ) : visibleRows.map((row) => (
                <EndpointRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EndpointRow({ row }: { row: GitLabEndpointCheckRow }) {
  return (
    <tr className="align-top">
      <td className="px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <ServerCog className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{row.automationName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="rounded-full bg-secondary px-2 py-0.5">{row.status}</span>
              <span>{row.automationId}</span>
            </div>
            {(row.handler || row.apiFile || row.gitlabFilePath) && (
              <p className="mt-2 max-w-[260px] truncate font-mono text-xs text-muted-foreground">
                {row.handler || row.apiFile || row.gitlabFilePath}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        {row.hasEndpoint ? (
          <div className="space-y-1.5">
            <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground">
              {row.method}
            </span>
            <code className="block max-w-[280px] overflow-hidden text-ellipsis rounded bg-secondary px-2 py-1 text-xs text-muted-foreground">
              {row.normalizedPath || row.path}
            </code>
            <p className="text-xs text-muted-foreground">
              Bronveld: <code>{row.sourceField}</code>
            </p>
          </div>
        ) : (
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
            Geen endpoint
          </span>
        )}
      </td>
      <td className="px-4 py-4">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusPillClass(row.linkStatus)}`}>
          {row.linkStatus === "linked" || row.linkStatus === "shared" ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" />
          )}
          {row.linkStatusLabel}
        </span>
        <p className="mt-2 text-xs text-muted-foreground">{row.classificationLabel}</p>
      </td>
      <td className="px-4 py-4 text-xs text-muted-foreground">
        {row.matchedSenders.length > 0 ? (
          <div className="space-y-1">
            {row.matchedSenders.map((sender, index) => (
              <p key={`${sender}-${index}`} className="font-medium text-foreground">{sender}</p>
            ))}
          </div>
        ) : (
          <p>Geen harde sender-match.</p>
        )}
        {row.conflictingSenders.length > 0 && (
          <p className="mt-2 text-red-700">Methode-conflict: {row.conflictingSenders.join(", ")}</p>
        )}
        {row.supportingEvidenceCount > 0 && (
          <p className="mt-2">{row.supportingEvidenceCount} ondersteunende routevermelding(en)</p>
        )}
      </td>
      <td className="max-w-[300px] px-4 py-4">
        <p className="text-sm leading-relaxed text-foreground">{row.issue}</p>
        {row.detail && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{row.detail}</p>}
      </td>
      <td className="px-4 py-4">
        <p className="mb-3 max-w-[320px] text-xs leading-relaxed text-muted-foreground">{row.nextAction}</p>
        <Button asChild size="sm" variant="outline">
          <Link to={row.href}>
            Open
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </td>
    </tr>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "good" | "warning" | "critical" | "info" | "neutral";
}) {
  return (
    <div className={`rounded-2xl border bg-card p-4 shadow-sm ${metricBorderClass(tone)}`}>
      <p className="label-uppercase">{label}</p>
      <p className="mt-2 font-mono text-3xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function metricBorderClass(tone: "good" | "warning" | "critical" | "info" | "neutral"): string {
  if (tone === "good") return "border-t-4 border-t-emerald-500";
  if (tone === "warning") return "border-t-4 border-t-amber-500";
  if (tone === "critical") return "border-t-4 border-t-red-500";
  if (tone === "info") return "border-t-4 border-t-blue-500";
  return "border-border";
}

function statusPillClass(status: GitLabEndpointLinkStatus): string {
  if (status === "linked" || status === "shared") return "bg-emerald-100 text-emerald-800";
  if (status === "no_endpoint") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}
