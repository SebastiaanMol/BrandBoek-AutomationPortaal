import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, CircleAlert, ExternalLink, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getSourceQualityMatrixPresentation,
  type SourceQualityAutomationRow,
  type SourceQualitySource,
} from "@/lib/sourceQualityMatrixPresentation";
import type { Automatisering } from "@/lib/types";

type SourceFilter = "all" | SourceQualitySource;

const sourceFilters: Array<{ value: SourceFilter; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "hubspot", label: "HubSpot" },
  { value: "zapier", label: "Zapier" },
  { value: "gitlab", label: "GitLab/API" },
  { value: "typeform", label: "Typeform" },
];

export function SourceQualityMatrixTab({ automations }: { automations: Automatisering[] }) {
  const [activeSource, setActiveSource] = useState<SourceFilter>("all");
  const presentation = useMemo(
    () => getSourceQualityMatrixPresentation(automations),
    [automations],
  );
  const visibleRows = useMemo(
    () =>
      activeSource === "all"
        ? presentation.rows
        : presentation.rows.filter((row) => row.source === activeSource),
    [activeSource, presentation.rows],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              Bronkwaliteit
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              Bronkwaliteit voor procesreizen
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Alleen exacte webhook/endpoint matches mogen procesreizen vormen. Automations zonder
              webhook zijn niet automatisch fout; vaak zijn ze individuele of native automations.
            </p>
          </div>
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            Webhook-only bewijs
          </Badge>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {presentation.summaryCards.map((card) => (
            <article key={card.source} className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-foreground">{card.label}</h3>
                <Badge variant="outline">{card.matchable}/{card.total}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric label="Totaal" value={card.total} />
                <Metric label="Matchbaar" value={card.matchable} />
                <Metric label="Zonder" value={card.missing} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {card.interpretation}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-foreground">Automations per bron</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Classificatie van elke bronautomation voor procesreisvorming.
              </p>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Bronfilter">
              {sourceFilters.map((filter) => (
                <Button
                  key={filter.value}
                  type="button"
                  variant={activeSource === filter.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveSource(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Automation</TableHead>
                <TableHead>Bron</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Classificatie</TableHead>
                <TableHead>Routebewijs</TableHead>
                <TableHead>Waarom</TableHead>
                <TableHead className="text-right">Actie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.id} className="align-top">
                  <TableCell>
                    <p className="font-medium text-foreground">{row.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{row.id}</p>
                  </TableCell>
                  <TableCell>{row.sourceLabel}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>
                    <ClassificationBadge row={row} />
                  </TableCell>
                  <TableCell>
                    {row.routeEvidence ? (
                      <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {row.routeEvidence}
                      </code>
                    ) : (
                      <span className="text-sm text-muted-foreground">Geen route</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[320px] text-sm text-muted-foreground">
                    {row.reason}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link to={row.href} aria-label={`Open ${row.name}`}>
                        Open
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {visibleRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Geen automations gevonden voor dit bronfilter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">Webhook-match matrix</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Alleen exacte genormaliseerde routes verschijnen als 100% match.
            </p>
          </div>
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            {presentation.matches.length} matches
          </Badge>
        </div>

        <div className="mt-4 space-y-3">
          {presentation.matches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Geen exacte webhook/endpoint matches gevonden.
            </div>
          ) : (
            presentation.matches.map((match) => (
              <article
                key={match.id}
                className="grid gap-3 rounded-xl border border-green-200 bg-green-50/40 p-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
              >
                <div className="min-w-0">
                  <Badge variant="outline">{match.sourceLabel}</Badge>
                  <p className="mt-2 font-semibold text-foreground">{match.sourceAutomationName}</p>
                  <code className="mt-1 block truncate rounded bg-white px-2 py-1 text-xs text-muted-foreground">
                    {match.sourcePath}
                  </code>
                </div>
                <div className="flex items-center justify-center">
                  <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                    {match.evidenceLabel}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="min-w-0">
                  <Badge variant="outline">{match.targetLabel}</Badge>
                  <p className="mt-2 font-semibold text-foreground">{match.targetAutomationName}</p>
                  <code className="mt-1 block truncate rounded bg-white px-2 py-1 text-xs text-muted-foreground">
                    {match.targetPath}
                  </code>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <UnmatchedRoutes
          title="Webhooks zonder receiver"
          label="Deze zenders hebben nog geen exact GitLab/API endpoint."
          routes={presentation.unmatchedWebhooks}
        />
        <UnmatchedRoutes
          title="Endpoints zonder afzender"
          label="Deze endpoints hebben nog geen bekende webhook-zender."
          routes={presentation.unmatchedEndpoints}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-background px-2 py-2">
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function ClassificationBadge({ row }: { row: SourceQualityAutomationRow }) {
  if (row.classification === "matchable") {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {row.classificationLabel}
      </Badge>
    );
  }
  if (row.classification === "incomplete") {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
        <CircleAlert className="h-3.5 w-3.5" />
        {row.classificationLabel}
      </Badge>
    );
  }
  if (row.classification === "legacy") {
    return (
      <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
        <GitBranch className="h-3.5 w-3.5" />
        {row.classificationLabel}
      </Badge>
    );
  }
  return <Badge variant="outline">{row.classificationLabel}</Badge>;
}

function UnmatchedRoutes({
  title,
  label,
  routes,
}: {
  title: string;
  label: string;
  routes: Array<{
    automationId: string;
    automationName: string;
    normalizedPath: string;
    sourceLabel: string;
  }>;
}) {
  return (
    <section aria-label={title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      <div className="mt-4 space-y-2">
        {routes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Geen open routes.
          </p>
        ) : (
          routes.map((route) => (
            <div
              key={`${route.automationId}-${route.normalizedPath}`}
              className="rounded-lg border border-border px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">{route.automationName}</p>
                <Badge variant="outline">{route.sourceLabel}</Badge>
              </div>
              <code className="mt-1 block truncate text-xs text-muted-foreground">
                {route.normalizedPath}
              </code>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
